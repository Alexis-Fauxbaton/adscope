from datetime import datetime, timedelta, timezone

import pytest

from adscope_api.disappearance import GUARD_MIN, observe
from adscope_api.models import Listing
from adscope_api.revisit import CONFIRM_DELAY

from conftest import auth

NOW = datetime(2026, 9, 7, 12, 0, tzinfo=timezone.utc)
LATER = NOW + CONFIRM_DELAY
SEEN = NOW - timedelta(days=10)


def listed(session, site_id="3263259495", site="lbc", last_seen=SEEN, **kw):
    listing = Listing(site=site, site_id=site_id, first_seen=SEEN, last_seen=last_seen,
                      observations=1, seller_type="pro", **kw)
    session.add(listing)
    session.commit()
    return listing


def gone(session, listing, at, evidence="absent"):
    return observe(session, listing.site, listing.site_id, evidence, at)


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


# Fait rougir le garde-fou de `observe` : une refonte de gabarit ou une bascule
# anti-bot se voit comme un pic global, et le pic se lit dès les *premières*
# constatations — six heures avant qu'une seule écriture soit possible. Aucune
# ne passe, et pas une seule date fausse n'entre en base. Les constatations,
# elles, restent prises : elles sont réversibles.
def test_a_fleetwide_pic_suspends_writing(session):
    doomed = []
    for index in range(GUARD_MIN):
        listing = listed(session, site_id=f"200000000{index:02d}",
                         last_revisit_at=NOW - timedelta(hours=1))
        doomed.append(listing)
    for listing in doomed:
        gone(session, listing, NOW)
    session.commit()
    assert {gone(session, listing, LATER) for listing in doomed} == {"held"}
    assert [l for l in doomed if l.disappeared_at is not None] == []
    assert doomed[-1].absent_since == NOW


# Fait rougir `or_(gone, seen)` dans `fleet` : la nuit où le mur anti-bot tombe,
# le crawler prend trente fiches et n'en ouvre que trois. Compter les fiches
# servies plutôt que les revisites abouties diviserait la proportion par le
# budget non consommé — et endormirait le garde-fou exactement quand il sert.
def test_claims_the_crawler_never_opened_do_not_dilute_the_guard(session):
    doomed = []
    for index in range(GUARD_MIN):
        doomed.append(listed(session, site_id=f"400000000{index:02d}",
                             last_revisit_at=NOW - timedelta(hours=1)))
    for index in range(200):
        listed(session, site_id=f"5000000{index:04d}",
               last_revisit_at=NOW - timedelta(hours=1))
    for listing in doomed:
        gone(session, listing, NOW)
    session.commit()
    assert {gone(session, listing, LATER) for listing in doomed} == {"held"}


# Fait rougir le dénominateur de `fleet` : une flotte majoritairement revue
# vivante n'est pas un pic, et le garde-fou ne doit pas s'y déclencher.
def test_a_fleet_seen_alive_lets_the_write_through(session):
    for index in range(GUARD_MIN * 3):
        listed(session, site_id=f"300000000{index:02d}", last_seen=NOW,
               last_revisit_at=NOW - timedelta(hours=1))
    listing = listed(session, last_revisit_at=NOW - timedelta(hours=1))
    gone(session, listing, NOW)
    assert gone(session, listing, LATER) == "recorded"


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
