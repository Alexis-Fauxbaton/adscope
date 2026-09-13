from datetime import datetime, timedelta, timezone

import pytest

from adscope_api.auth import hash_key, new_key
from adscope_api.follow_models import Follow, TrackedFamily
from adscope_api.models import License, Listing
from adscope_api.observations import record
from adscope_api.intake import ObservationIn
from adscope_api.revisit import ADDRESS, QUIET, SPACING, due

from conftest import auth

NOW = datetime(2026, 9, 7, 12, 0, tzinfo=timezone.utc)
LONG_AGO = NOW - timedelta(days=30)


def listed(session, site_id, *, seller_type="pro", published=None, last_seen=LONG_AGO,
           site="lbc", **kw):
    listing = Listing(site=site, site_id=site_id, first_seen=LONG_AGO,
                      last_seen=last_seen, observations=1, seller_type=seller_type,
                      published_at=published or LONG_AGO, **kw)
    session.add(listing)
    session.commit()
    return listing


def ids(served):
    return [item["site_id"] for item in served]


def merchant(session):
    """Une licence quelconque : la file est commune, ce n'est jamais l'appelant
    qui décide de ce qui passe en tête, c'est quelqu'un."""
    key_hash = hash_key(new_key())
    session.add(License(key_hash=key_hash, label="marchand"))
    session.commit()
    return key_hash


# Fait rougir `Listing.last_seen <= now - QUIET` dans `revisit.due` : sans ce
# filtre, la file dépenserait une fiche pour une annonce que le balayage vient
# de montrer vivante — la vérification gratuite est déjà faite.
def test_a_listing_seen_two_hours_ago_is_not_worth_a_page(session):
    listed(session, "3263259495", last_seen=NOW - timedelta(hours=2))
    assert due(session, "lbc", 10, NOW) == []


def test_a_listing_silent_longer_than_the_sweep_is_served(session):
    listed(session, "3263259495", last_seen=NOW - QUIET - timedelta(hours=1))
    assert ids(due(session, "lbc", 10, NOW)) == ["3263259495"]


# Fait rougir `_rank` : sans lui l'ordre serait celui du silence seul, et la
# file dépenserait ses pages sur des annonces de particuliers récentes, dont la
# disparition ne se distingue pas d'une expiration à soixante jours.
def test_the_old_professional_comes_first(session):
    listed(session, "1000000001", seller_type="private", published=NOW - timedelta(days=2))
    listed(session, "1000000002", seller_type="pro", published=NOW - timedelta(days=2))
    listed(session, "1000000003", seller_type="pro", published=NOW - timedelta(days=200))
    listed(session, "1000000004", seller_type="private", published=NOW - timedelta(days=200))
    assert ids(due(session, "lbc", 10, NOW)) == [
        "1000000003", "1000000002", "1000000004", "1000000001",
    ]


# Fait rougir le marquage de `due` : sans lui, une fiche servie que le crawler
# n'ouvre pas — mur anti-bot, budget épuisé — reviendrait en tête à chaque
# appel, et la file n'avancerait plus.
def test_serving_a_listing_holds_it_back(session):
    listing = listed(session, "3263259495")
    assert ids(due(session, "lbc", 10, NOW)) == ["3263259495"]
    session.commit()
    assert listing.last_revisit_at == NOW
    assert listing.next_detail_crawl == NOW + SPACING
    assert due(session, "lbc", 10, NOW + timedelta(days=1)) == []


# Fait rougir `Listing.disappeared_at.is_(None)` : une annonce dont la
# disparition est écrite est sortie du jeu, la rouvrir ne dirait plus rien.
def test_a_disappeared_listing_leaves_the_queue(session):
    listed(session, "3263259495", disappeared_at=NOW - timedelta(days=1))
    assert due(session, "lbc", 10, NOW) == []


# Fait rougir `listing.disappeared_at = listing.absent_since = None` dans
# `observations.record` : sans cet effacement, une constatation d'absence
# vieille de trois semaines attendrait toujours sa concordante, et la première
# revisite qui échouerait après un passage vivant écrirait la disparition.
def test_seeing_the_listing_alive_drops_the_absence_in_progress(session):
    listing = listed(session, "3263259495", absent_since=NOW - timedelta(days=20))
    record(session, ObservationIn(site="lbc", site_id="3263259495", price=9900),
           source="crawler", now=NOW)
    session.commit()
    assert listing.absent_since is None


# Fait rougir `ADDRESS.get(site)` : La Centrale n'a pas de signature d'absence
# confirmée sur une vraie disparition, et sa file n'existe donc pas. Le second
# identifiant n'est pas une référence La Centrale — les 24 relevées portent
# toutes une lettre de tête —, il porte exprès la forme leboncoin : `W103538172`
# seul laissait le test passer pour la mauvaise raison, refusé par l'adresse
# avant même d'atteindre le verrou du site.
@pytest.mark.parametrize("site_id", ["W103538172", "3263259495"])
def test_lacentrale_never_enters_the_queue(session, site_id):
    listed(session, site_id, site="lc")
    assert due(session, "lc", 10, NOW) == []


# Fait rougir la forme exigée dans `_lbc` : une référence qui n'est pas celle
# qu'on a vue produirait une adresse fausse, donc une page d'absence sur une
# annonce vivante. Le refus se journalise et ne sert rien.
@pytest.mark.parametrize("site_id", ["12345", "W103538172", "3263259495x"])
def test_an_address_that_cannot_be_rebuilt_is_refused(session, site_id):
    listed(session, site_id)
    assert due(session, "lbc", 10, NOW) == []


def test_the_address_carries_the_category_that_leboncoin_ignores(session):
    assert ADDRESS["lbc"]("3263259495") == "https://www.leboncoin.fr/ad/voitures/3263259495"


def test_the_route_serves_the_queue(client, key, session):
    listed(session, "3263259495")
    res = client.post("/v1/revisits", json={"site": "lbc", "limit": 5}, headers=auth(key))
    assert res.status_code == 200
    assert res.json() == [{
        "site": "lbc", "site_id": "3263259495",
        "url": "https://www.leboncoin.fr/ad/voitures/3263259495",
    }]


def test_the_route_needs_a_license(client, session):
    assert client.post("/v1/revisits", json={"site": "lbc"}).status_code == 401


# Fait rougir `(_wanted(), 0)` dans `revisit._rank` : sans ce rang, l'annonce
# qu'un marchand a mise de côté attendrait derrière les 9 000 professionnelles
# anciennes de la base — c'est-à-dire des semaines, alors qu'il l'a ouverte ce
# matin. C'est le seul rang qui vienne de quelqu'un.
def test_a_followed_listing_comes_before_the_old_professional(session):
    listed(session, "1000000003", seller_type="pro", published=NOW - timedelta(days=200))
    mine = listed(session, "1000000001", seller_type="private",
                  published=NOW - timedelta(days=2))
    session.add(Follow(license_key_hash=merchant(session), listing_id=mine.id,
                       followed_at=NOW))
    session.commit()
    assert ids(due(session, "lbc", 10, NOW)) == ["1000000001", "1000000003"]


# Fait rougir la moitié `tracked` de `_wanted` : le périmètre vaut le suivi.
# Le marchand ne peut pas suivre une à une les annonces qu'il n'a pas encore
# vues ; dire « les Clio » est la seule façon de les faire revisiter.
def test_a_listing_of_the_perimeter_comes_first_too(session):
    listed(session, "1000000003", seller_type="pro", published=NOW - timedelta(days=200))
    listed(session, "1000000001", seller_type="private", published=NOW - timedelta(days=2),
           brand="Renault", model="Clio")
    session.add(TrackedFamily(license_key_hash=merchant(session), brand="Renault",
                              model="Clio"))
    session.commit()
    assert ids(due(session, "lbc", 10, NOW)) == ["1000000001", "1000000003"]


# Fait rougir `TrackedFamily.model == Listing.model` : la famille est marque
# *et* modèle. Sans le modèle, « les Clio » tirerait toutes les Renault de la
# base — 12 000 annonces — dans le rang que le marchand croyait réserver.
def test_the_perimeter_holds_on_the_model_too(session):
    listed(session, "1000000003", seller_type="pro", published=NOW - timedelta(days=200))
    listed(session, "1000000001", seller_type="private", published=NOW - timedelta(days=2),
           brand="Renault", model="Megane")
    session.add(TrackedFamily(license_key_hash=merchant(session), brand="Renault",
                              model="Clio"))
    session.commit()
    assert ids(due(session, "lbc", 10, NOW)) == ["1000000003", "1000000001"]


# Fait rougir `Listing.last_seen <= now - QUIET`, que le rang 0 ne lève pas :
# suivre une annonce ne fait pas rouvrir une fiche que le balayage vient de
# montrer vivante. Le geste du marchand change l'ordre de la file, jamais ce
# qu'elle s'autorise.
def test_a_followed_listing_still_owes_the_silence(session):
    mine = listed(session, "3263259495", last_seen=NOW - timedelta(hours=2))
    session.add(Follow(license_key_hash=merchant(session), listing_id=mine.id,
                       followed_at=NOW))
    session.commit()
    assert due(session, "lbc", 10, NOW) == []
