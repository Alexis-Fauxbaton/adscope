from datetime import datetime, timedelta, timezone

from adscope_api.auth import hash_key, resolve
from adscope_api.feed_query import feed_for
from adscope_api.follow_models import Follow
from adscope_api.models import Listing, PricePoint

from conftest import auth

NOW = datetime(2026, 9, 18, 9, 0, tzinfo=timezone.utc)


def car(session, site_id, *, brand="Renault", model="Clio", site="lbc",
        seller_type=None, seller_name=None, published=None, disappeared_at=None,
        prices=()):
    row = Listing(site=site, site_id=site_id, first_seen=NOW, last_seen=NOW,
                  observations=1, brand=brand, model=model, seller_type=seller_type,
                  seller_name=seller_name, published_at=published,
                  disappeared_at=disappeared_at)
    row.prices = [
        PricePoint(observed_at=at, price=price, source="user", confirmation=confirmation)
        for at, price, confirmation in prices
    ]
    session.add(row)
    session.commit()
    return row


def follow_it(session, key, listing, at=NOW):
    session.add(Follow(license_key_hash=hash_key(key), listing_id=listing.id, followed_at=at))
    session.commit()


def feed(session, key, since_days=7, now=NOW):
    return feed_for(session, resolve(session, key), since_days, now)


# Fait rougir le `.join(Follow, ...).where(Follow.license_key_hash == ...)`
# de `feed_query.feed_for` : le feed ne porte que ce que la licence suit.
def test_the_feed_only_carries_what_the_license_follows(session, key):
    watched = car(session, "watched")
    car(session, "not_followed")
    follow_it(session, key, watched)
    items = feed(session, key)
    assert [i["site_id"] for i in items] == ["watched"]
    assert (items[0]["followed"], items[0]["followed_at"]) == (True, NOW)


# Fait rougir `if cur.observed_at >= since` dans `feed_query._feed_item` :
# un changement plus vieux que la fenêtre n'y figure pas, même s'il a servi de
# point de départ au dernier changement retenu.
def test_changes_are_bounded_to_the_window(session, key):
    listing = car(session, "watched", prices=[
        (NOW - timedelta(days=10), 12000, False),
        (NOW - timedelta(days=8), 11000, False),
        (NOW - timedelta(days=2), 10000, False),
    ])
    follow_it(session, key, listing)
    items = feed(session, key, since_days=7)
    assert items[0]["changes"] == [
        {"at": NOW - timedelta(days=2), "from": 11000, "to": 10000},
    ]


# Fait rougir `before < t <= age_now` dans `feed_query._crossed`, à la
# frontière basse : 29 jours avant la fenêtre, 30 à la fin, ça franchit.
def test_crossing_29_to_30_is_reported(session, key):
    listing = car(session, "aging", published=NOW - timedelta(days=30))
    follow_it(session, key, listing)
    items = feed(session, key, since_days=1)
    assert items[0]["flags"]["crossed"] == 30


# La même frontière un jour plus tard : déjà à 30 la veille, 31 n'est pas un
# nouveau franchissement.
def test_already_past_30_the_day_before_is_not_a_new_crossing(session, key):
    listing = car(session, "already_old", published=NOW - timedelta(days=31))
    follow_it(session, key, listing)
    items = feed(session, key, since_days=1)
    assert items[0]["flags"]["crossed"] is None


# Une fenêtre de sept jours, pas d'un : le calcul de `before` doit suivre
# `since_days`, pas rester câblé sur un jour.
def test_crossing_within_a_seven_day_window(session, key):
    listing = car(session, "aging_week", published=NOW - timedelta(days=32))
    follow_it(session, key, listing)
    items = feed(session, key, since_days=7)
    assert items[0]["flags"]["crossed"] == 30


# Fait rougir `delta is not None and delta < 0` dans `flags.dropped`.
def test_flags_dropped_reflects_the_price_fall(session, key):
    listing = car(session, "cheaper", prices=[
        (NOW - timedelta(days=5), 12000, False), (NOW - timedelta(days=1), 11000, False),
    ])
    follow_it(session, key, listing)
    assert feed(session, key)[0]["flags"]["dropped"] is True


# Fait rougir `listing.disappeared_at >= since` : une disparition plus
# ancienne que la fenêtre ne s'y signale pas.
def test_flags_disappeared_only_within_the_window(session, key):
    recent = car(session, "gone_recent", disappeared_at=NOW - timedelta(days=2))
    long_ago = car(session, "gone_long_ago", disappeared_at=NOW - timedelta(days=10))
    follow_it(session, key, recent)
    follow_it(session, key, long_ago)
    items = {i["site_id"]: i for i in feed(session, key)}
    assert items["gone_recent"]["flags"]["disappeared"] is True
    assert items["gone_long_ago"]["flags"]["disappeared"] is False


# Fait rougir `key=lambda it: (not it["changes"], ...)` dans `feed_for` : ce
# qui a bougé passe devant ce qui n'a pas bougé.
def test_items_with_changes_come_first(session, key):
    moved = car(session, "moved", prices=[
        (NOW - timedelta(days=5), 12000, False), (NOW - timedelta(days=1), 11000, False),
    ])
    still = car(session, "still", prices=[(NOW - timedelta(days=10), 9000, False)])
    follow_it(session, key, still)
    follow_it(session, key, moved)
    assert [i["site_id"] for i in feed(session, key)] == ["moved", "still"]


# Le vendeur d'un particulier reste nul dans le feed aussi — c'est
# `feed_query._feed_item` qui construit l'item, pas `market_query.item_of`.
def test_the_feed_item_hides_a_private_seller_s_name(session, key):
    listing = car(session, "priv", seller_type="private", seller_name=None)
    follow_it(session, key, listing)
    assert feed(session, key)[0]["seller_name"] is None


def test_the_feed_route_needs_a_license(client, session):
    assert client.get("/v1/follows/feed").status_code == 401


# Fait rougir `if since_days not in (1, 7):` dans `market.get_feed`.
def test_since_days_only_accepts_one_or_seven(client, key):
    r = client.get("/v1/follows/feed", params={"since_days": 3}, headers=auth(key))
    assert r.status_code == 422


# Fait rougir la même ligne dans l'autre sens : `Literal[1, 7]` seul ne
# coercerait pas `?since_days=1` (chaîne) vers l'entier sous cette version de
# FastAPI, et rendrait 422 même sur une valeur valide — vérifié en le
# remettant en place.
def test_since_days_accepts_one_and_seven_through_the_route(client, key):
    for value in (1, 7):
        r = client.get("/v1/follows/feed", params={"since_days": value}, headers=auth(key))
        assert r.status_code == 200


def test_the_feed_route_serves_the_contract_shape(client, key, session):
    listing = car(session, "shape")
    follow_it(session, key, listing)
    body = client.get("/v1/follows/feed", headers=auth(key)).json()
    assert set(body.keys()) == {"items"}
    assert set(body["items"][0].keys()) == {
        "site", "site_id", "url", "brand", "model", "version", "year", "mileage",
        "price", "seller_type", "seller_name", "published_at", "age_days",
        "price_delta_since_first", "last_change_at", "followed", "disappeared_at",
        "followed_at", "changes", "flags",
    }
