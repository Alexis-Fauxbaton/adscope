"""Deux marchands qui observent la même annonce en même temps.

Ces tests ouvrent de vraies connexions distinctes et les lâchent sur une
barrière : une simulation séquentielle ne provoque pas la collision et ne
prouverait rien. Ils tiennent les invariants écrits dans `observations`.

Chacun rougit quand on retire du code une ligne nommée — la démonstration est
tenue dans `.superpowers/tests-discriminants.md` et
`.superpowers/concurrence-solde.md`. Le point de prix unique en fait désormais
partie : la lecture du dernier prix a été remontée juste après le verrou, où
plus rien d'autre ne la sérialise, et le test ci-dessous rougit quand on retire
`.with_for_update()`. Il ne le pouvait pas tant qu'elle se lisait plus bas.
"""

import threading
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from adscope_api.auth import hash_key
from adscope_api.intake import ObservationIn, ObservationsIn
from adscope_api.main import post_observations
from adscope_api.models import License, Listing, PricePoint
from adscope_api.observations import record

NOW = datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)
WRITERS = 10


def obs(**kw):
    base = dict(site="lc", site_id="87103336930", price=9900)
    base.update(kw)
    return ObservationIn(**base)


def count(session, model):
    return session.scalar(select(func.count()).select_from(model))


def test_the_counter_holds_under_ten_simultaneous_writers(session, concurrently):
    record(session, obs(), source="user", now=NOW)
    session.commit()
    errors = concurrently(WRITERS, lambda i, s: record(s, obs(), source="user", now=NOW))
    assert errors == []
    assert session.scalar(select(Listing.observations)) == WRITERS + 1


# La borne basse est l'invariant sur lequel repose la détection de
# republication : elle ne recule jamais. Une fiche annonce soixante jours, une
# carte de résultats deux — c'est le cas normal, pas le cas tordu.
def test_the_lower_bound_survives_two_ages_observed_at_once(session, concurrently):
    record(session, obs(), source="user", now=NOW)
    session.commit()
    ages = [60] + [2] * (WRITERS - 1)
    errors = concurrently(
        WRITERS,
        lambda i, s: record(s, obs(published_days_ago=ages[i]), source="user", now=NOW),
    )
    assert errors == []
    assert session.scalar(select(Listing.site_published_first)) == (
        NOW - timedelta(days=60)
    ).date()
    assert session.scalar(select(Listing.site_published_last)) == (
        NOW - timedelta(days=2)
    ).date()


# Deux marchands ouvrant la même annonce neuve : le scénario que la spec met en
# avant pour justifier la mutualisation, et celui qui rendait 500.
def test_ten_simultaneous_creations_of_an_unknown_listing(session, concurrently):
    errors = concurrently(WRITERS, lambda i, s: record(s, obs(), source="user", now=NOW))
    assert errors == []
    assert count(session, Listing) == 1
    assert session.scalar(select(Listing.observations)) == WRITERS


# Le verrou se prend par annonce : deux marchands sur deux annonces
# différentes ne s'attendent pas. Le fil qui tient la première ne rend la main
# qu'après le second — s'ils se sérialisaient, ce test resterait bloqué.
def test_two_listings_do_not_wait_for_each_other(sessions):
    holding, finished = threading.Event(), threading.Event()

    def hold():
        with sessions() as s:
            record(s, obs(site_id="1"), source="user", now=NOW)
            holding.set()
            finished.wait(timeout=10)
            s.commit()

    def other():
        with sessions() as s:
            record(s, obs(site_id="2"), source="user", now=NOW)
            s.commit()
            finished.set()

    keeper = threading.Thread(target=hold)
    keeper.start()
    holding.wait(timeout=10)
    runner = threading.Thread(target=other)
    runner.start()
    runner.join(timeout=10)
    assert finished.is_set(), "une écriture sur une autre annonce a attendu"
    keeper.join(timeout=10)


# Cent observations restent un lot : rien n'est visible du dehors avant le
# commit unique. Le correctif ne doit pas transformer une requête en cent
# transactions.
def test_a_batch_of_a_hundred_stays_one_transaction(session, sessions):
    for n in range(100):
        record(session, obs(site_id=str(n)), source="user", now=NOW)
    with sessions() as outside:
        assert count(outside, Listing) == 0
    session.commit()
    assert count(session, Listing) == 100


# Deux lots qui portent les deux mêmes annonces en sens inverse s'attendent
# l'un l'autre : Postgres en tue un. L'ordre commun ôte le cycle, mais il ne
# vaut que là où l'entrée le pose : ce test passe par `post_observations` et
# non par `ordered` appelé à la main, qui n'éprouverait que le trieur. Rendez
# `main` à `for item in payload.items` et il rend `DeadlockDetected`.
def test_two_crossed_batches_do_not_deadlock(session, concurrently):
    license_ = License(key_hash=hash_key("crossed"), label="crossed")
    session.add(license_)
    session.commit()
    ids = [str(n) for n in range(20)]
    batches = [
        ObservationsIn(items=[obs(site_id=i).model_dump() for i in ids]),
        ObservationsIn(items=[obs(site_id=i).model_dump() for i in reversed(ids)]),
    ]

    def send(index, s):
        post_observations(batches[index], session=s, license_=license_)

    assert concurrently(2, send) == []


# La lecture du dernier prix ne tient que par le verrou, et seulement parce
# qu'elle est la première instruction qui suit sa prise. Dix marchands qui
# voient ensemble la même baisse n'écrivent qu'un point ; sans le verrou ils en
# écrivent dix, chacun ayant lu l'ancien prix avant que quiconque écrive.
def test_a_single_price_point_for_a_single_change(session, concurrently):
    record(session, obs(), source="user", now=NOW)
    session.commit()
    later = NOW + timedelta(hours=1)
    errors = concurrently(
        WRITERS, lambda i, s: record(s, obs(price=8900), source="user", now=later)
    )
    assert errors == []
    assert session.scalars(
        select(PricePoint.price).order_by(PricePoint.id)
    ).all() == [9900, 8900]
