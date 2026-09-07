from datetime import datetime, timedelta, timezone

import pytest

from adscope_api.disappearance import GUARD_MIN, observe
from adscope_api.intake import ObservationIn
from adscope_api.models import Listing
from adscope_api.observations import record
from adscope_api.revisit import CONFIRM_DELAY, SPACING, due

from conftest import auth

NOW = datetime(2026, 9, 7, 12, 0, tzinfo=timezone.utc)
LATER = NOW + CONFIRM_DELAY
SEEN = NOW - timedelta(days=10)
# Assez de fiches pour que la proportion veuille dire quelque chose, et assez de
# marge au-dessus de `GUARD_MIN` pour qu'aucun test ne tienne au seuil exact.
FLEET = 40
# Les préfixes disent le rôle : la file rend les fiches dans son ordre à elle,
# pas dans celui où les tests les ont posées.
DOOMED, ALIVE, UNOPENED = "82", "93", "74"
STALE, HUMAN = "65", "51"
# Un service qui tombe hors de la fenêtre au moment où le garde-fou est
# consulté, et de peu : c'est ce qui tient le chiffre de `GUARD_WINDOW` et pas
# seulement son existence — à 72 h, cette fiche-là rentrerait.
STALE_SERVE = NOW - timedelta(hours=30)
# Quand la file rouvre une fiche qu'elle a déjà servie deux fois : le bail de
# sept jours a couru, et l'absence constatée au premier jour est toujours là.
MUCH_LATER = LATER + SPACING


def listed(session, site_id="3263259495", site="lbc", last_seen=SEEN, **kw):
    listing = Listing(site=site, site_id=site_id, first_seen=SEEN, last_seen=last_seen,
                      observations=1, seller_type="pro", **kw)
    session.add(listing)
    session.commit()
    return listing


def sleeping(session, count, prefix):
    """`count` fiches silencieuses depuis dix jours, que la file servira."""
    for index in range(count):
        listed(session, site_id=f"{prefix}{index:04d}")


def gone(session, listing, at, evidence="absent"):
    return observe(session, listing.site, listing.site_id, evidence, at)


def alive(session, site_id, at):
    """Ce que fait une revisite qui retrouve l'annonce : une observation."""
    record(session, ObservationIn(site="lbc", site_id=site_id, price=9900),
           source="crawler", now=at)


def served(session, at, limit=500):
    """Ce que la file sert, et c'est elle qui pose `last_revisit_at`.

    Aucun test du garde-fou ne touche à cette colonne, ni à `absent_since`, ni à
    `next_detail_crawl` : le rafraîchissement à chaque ouverture fait partie du
    flux qu'on prétend garder, et c'est lui qu'aucun test ne voyait.
    """
    return [item["site_id"] for item in due(session, "lbc", limit, at)]


def written(session):
    return session.query(Listing).filter(Listing.disappeared_at.is_not(None)).count()


# Fait rougir `if listing.absent_since is None` : sans la double constatation,
# une panne passagère du site — une coquille rendue avec `ad: null` — suffirait
# à écrire une date qu'on ne pourra plus retirer.
def test_the_first_sighting_only_books_a_second_look(session):
    listing = listed(session)
    assert gone(session, listing, NOW) == "first"
    assert listing.disappeared_at is None
    assert listing.absent_since == NOW
    assert listing.next_detail_crawl == NOW + CONFIRM_DELAY


# Fait rougir `if now - listing.absent_since < CONFIRM_DELAY` : deux lectures de
# la même page à vingt minutes d'écart sont une seule constatation.
def test_a_second_sighting_too_close_writes_nothing(session):
    listing = listed(session)
    gone(session, listing, NOW)
    assert gone(session, listing, NOW + timedelta(minutes=20)) == "too_soon"
    assert listing.disappeared_at is None


# Fait rougir `listing.disappeared_at = listing.absent_since` : c'est la date de
# la *première* constatation qui est écrite — le premier moment où le site nous
# a dit l'absence, pas celui où on a fini de le vérifier.
def test_the_second_concordant_sighting_records_the_first_date(session):
    listing = listed(session)
    gone(session, listing, NOW)
    assert gone(session, listing, LATER) == "recorded"
    assert listing.disappeared_at == NOW


def test_a_listing_already_recorded_is_left_alone(session):
    listing = listed(session, absent_since=NOW, disappeared_at=NOW)
    assert gone(session, listing, LATER) == "already"
    assert listing.disappeared_at == NOW


def test_an_unknown_listing_is_not_created(session):
    assert observe(session, "lbc", "9999999999", "absent", NOW) == "unknown"
    assert session.query(Listing).count() == 0


# Fait rougir `if evidence != WRITES` : une extraction qui échoue est une
# extraction qui échoue. `unreadable` est ce que rend un mur anti-bot ou un
# gabarit refondu, et `status:sold` une signature que le site énonce mais
# qu'aucune page n'a encore été vue porter — les deux se journalisent.
@pytest.mark.parametrize("evidence", ["unreadable", "status:sold", "status:deleted"])
def test_no_evidence_but_the_measured_one_ever_writes(session, evidence):
    listing = listed(session)
    assert gone(session, listing, NOW, evidence) == "logged"
    assert gone(session, listing, LATER, evidence) == "logged"
    assert (listing.absent_since, listing.disappeared_at) == (None, None)


# Fait rougir `gone` dans `fleet` : le jour où la signature elle-même se met à
# tirer juste — un incident backend qui rendrait charge vidée *et* libellé sur
# des annonces vivantes —, les trois premiers verrous laissent passer. Quarante
# fiches, le flux complet, et pas une date n'entre en base. Écrit contre la
# dernière ouverture (`absent_since >= last_revisit_at`), le numérateur
# s'effaçait ici : la file rouvre la fiche six heures plus tard, `last_revisit_at`
# passe devant `absent_since`, et les quarante disparitions s'écrivaient.
def test_a_signature_that_started_lying_suspends_the_whole_fleet(session):
    sleeping(session, FLEET, DOOMED)
    first = served(session, NOW)
    assert len(first) == FLEET
    assert {observe(session, "lbc", site_id, "absent", NOW) for site_id in first} == {"first"}
    session.commit()

    again = served(session, LATER)
    assert len(again) == FLEET
    assert {observe(session, "lbc", site_id, "absent", LATER) for site_id in again} == {"held"}
    assert written(session) == 0


# Fait rougir `gone` et le dénominateur ensemble : une flotte mixte est le cas
# réel, et c'est celui où le défaut se voyait le mieux. Soixante fiches revues
# vivantes, soixante dites absentes — une disparition pour deux, le double du
# seuil. Le pic se lit dès la première constatation ; il doit se lire encore six
# heures plus tard, au moment où l'écriture serait possible.
def test_a_mixed_fleet_still_reads_the_pic_when_the_write_comes_due(session):
    sleeping(session, 60, DOOMED)
    sleeping(session, 60, ALIVE)
    first = served(session, NOW)
    assert len(first) == 120
    for site_id in first:
        if site_id.startswith(DOOMED):
            assert observe(session, "lbc", site_id, "absent", NOW) == "first"
        else:
            alive(session, site_id, NOW)
    session.commit()

    # Les vivantes ne redeviennent pas dues : le bail de sept jours et le
    # silence exigé les tiennent toutes deux à l'écart. Elles restent pourtant
    # au dénominateur — c'est le sens même du garde-fou.
    again = served(session, LATER)
    assert len(again) == 60
    assert {observe(session, "lbc", site_id, "absent", LATER) for site_id in again} == {"held"}
    assert written(session) == 0


# Fait rougir `or_(gone, seen)` dans `fleet` : la nuit où le mur anti-bot tombe,
# le crawler prend deux cent trente fiches et n'en ouvre que trente. Compter les
# fiches servies plutôt que celles dont on sait quelque chose diviserait la
# proportion par le budget non consommé — et endormirait le garde-fou exactement
# quand il sert.
def test_claims_the_crawler_never_opened_do_not_dilute_the_guard(session):
    sleeping(session, GUARD_MIN, DOOMED)
    sleeping(session, 200, UNOPENED)
    first = served(session, NOW)
    assert len(first) == GUARD_MIN + 200
    for site_id in first:
        if site_id.startswith(DOOMED):
            assert observe(session, "lbc", site_id, "absent", NOW) == "first"
    session.commit()

    again = served(session, LATER)
    assert len(again) == GUARD_MIN
    assert {observe(session, "lbc", site_id, "absent", LATER) for site_id in again} == {"held"}


# Fait rougir la fenêtre du `where` : une fiche servie trente heures plus tôt,
# que le balayage a revue vivante depuis, n'appartient plus à la flotte du jour.
# La compter au dénominateur diluerait le pic dans tout l'historique de la file —
# deux cents suffisent à endormir le garde-fou sur quarante disparitions
# concordantes.
def test_a_serve_older_than_the_window_does_not_dilute_the_guard(session):
    sleeping(session, 200, STALE)
    stale = served(session, STALE_SERVE)
    assert len(stale) == 200
    for site_id in stale:
        alive(session, site_id, NOW)
    session.commit()

    # Posées après coup : la veille, elles n'existaient pas et la file ne les a
    # donc pas servies en même temps que les autres.
    sleeping(session, FLEET, DOOMED)
    first = served(session, NOW)
    assert len(first) == FLEET
    assert {observe(session, "lbc", site_id, "absent", NOW) for site_id in first} == {"first"}
    session.commit()

    again = served(session, LATER)
    assert {observe(session, "lbc", site_id, "absent", LATER) for site_id in again} == {"held"}
    assert written(session) == 0


# Fait rougir `gone` une seconde fois, et sur l'autre borne : une absence est un
# *état*, pas un événement daté. Borner le numérateur à la fenêtre le faisait
# expirer — la file rouvre la fiche au terme du bail de sept jours, l'absence
# constatée au premier jour tombe hors fenêtre, `gone` retombe à zéro et le pic
# qu'on venait de retenir s'écrit d'un coup. `observations.record` est ce qui
# rend la borne inutile : une annonce revue vivante n'a plus d'absence en cours.
def test_an_absence_still_pending_after_the_lease_still_counts(session):
    sleeping(session, FLEET, DOOMED)
    for at, verdict in ((NOW, "first"), (LATER, "held")):
        batch = served(session, at)
        assert len(batch) == FLEET
        assert {observe(session, "lbc", site_id, "absent", at)
                for site_id in batch} == {verdict}
    session.commit()

    again = served(session, MUCH_LATER)
    assert len(again) == FLEET
    assert {observe(session, "lbc", site_id, "absent", MUCH_LATER)
            for site_id in again} == {"held"}
    assert written(session) == 0


# Fait rougir le `where` lui-même : le garde-fou ne compte que ce que la file a
# servi. Une constatation venue d'un humain qui navigue laisse `last_revisit_at`
# nul — l'annonce n'est jamais passée par `due` — et n'entre ni au numérateur ni
# au dénominateur : quarante d'un coup s'écrivent sans que rien ne s'interrompe.
# Ce test dit un angle mort, pas une garantie ; il est là pour qu'on ne le
# redécouvre pas par surprise, et le rapport le porte en réserve.
def test_constatations_outside_the_queue_stay_invisible_to_the_guard(session):
    sleeping(session, FLEET, HUMAN)
    browsed = [f"{HUMAN}{index:04d}" for index in range(FLEET)]
    assert {observe(session, "lbc", site_id, "absent", NOW) for site_id in browsed} == {"first"}
    session.commit()
    assert {observe(session, "lbc", site_id, "absent", LATER)
            for site_id in browsed} == {"recorded"}
    assert written(session) == FLEET


# Fait rougir `seen` dans `fleet` : quarante disparitions ne sont un pic que
# rapportées à ce qui a répondu. Cent vingt fiches revues vivantes les ramènent
# à une pour quatre, et les quarante s'écrivent. Sans `seen` au dénominateur, le
# garde-fou ne verrait que des disparitions et se déclencherait sur un
# renouvellement de stock ordinaire — il ne serait plus qu'un interrupteur
# fermé. Le nombre de fiches disparues est le même que dans le test de signature
# menteuse : seule la flotte autour d'elles change, et c'est tout le propos.
def test_a_fleet_seen_alive_lets_the_write_through(session):
    sleeping(session, FLEET, DOOMED)
    sleeping(session, FLEET * 3, ALIVE)
    first = served(session, NOW)
    assert len(first) == FLEET * 4
    for site_id in first:
        if site_id.startswith(DOOMED):
            assert observe(session, "lbc", site_id, "absent", NOW) == "first"
        else:
            alive(session, site_id, NOW)
    session.commit()

    again = served(session, LATER)
    assert len(again) == FLEET
    assert {observe(session, "lbc", site_id, "absent", LATER) for site_id in again} == {"recorded"}
    assert written(session) == FLEET


def test_the_route_reports_the_verdict(client, key, session):
    listed(session)
    body = {"site": "lbc", "site_id": "3263259495", "evidence": "absent"}
    res = client.post("/v1/disappearances", json=body, headers=auth(key))
    assert res.status_code == 200
    assert res.json() == {"verdict": "first"}


# Fait rougir le `Literal` de `intake.Evidence` : la preuve vient d'une page
# tierce, elle ne peut être qu'un mot de la liste mesurée.
def test_the_route_refuses_an_evidence_it_has_never_measured(client, key, session):
    listed(session)
    body = {"site": "lbc", "site_id": "3263259495", "evidence": "vendue"}
    assert client.post("/v1/disappearances", json=body, headers=auth(key)).status_code == 422


def test_the_route_needs_a_license(client, session):
    body = {"site": "lbc", "site_id": "3263259495", "evidence": "absent"}
    assert client.post("/v1/disappearances", json=body).status_code == 401
