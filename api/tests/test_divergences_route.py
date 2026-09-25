from datetime import datetime, timedelta, timezone

import pytest

from adscope_api.auth import hash_key, new_key
from adscope_api.corpus_models import Divergence, Recheck
from adscope_api.models import License, Listing

from conftest import auth

NOW = datetime(2026, 9, 25, 12, 0, tzinfo=timezone.utc)


# `/v1/divergences` est derrière `require_operator` : seule une licence
# `automated` l'ouvre par Bearer (A1/AUTH-01/A4, audits d'accès et d'abus).
@pytest.fixture
def key(session):
    raw = new_key()
    session.add(License(key_hash=hash_key(raw), label="crawler", automated=True))
    session.commit()
    return raw


def merchant(session, label="marchand"):
    raw = new_key()
    key_hash = hash_key(raw)
    session.add(License(key_hash=key_hash, label=label))
    session.commit()
    return key_hash


def listed(session, site_id="3263259495"):
    listing = Listing(site="lbc", site_id=site_id, first_seen=NOW, last_seen=NOW,
                      observations=1)
    session.add(listing)
    session.commit()
    return listing


def divergence(session, listing_id, license_key_hash, verified_at=NOW, delay_seconds=3600,
               field="price"):
    row = Divergence(listing_id=listing_id, license_key_hash=license_key_hash, field=field,
                     merchant_value="9900", robot_value="12900",
                     observed_at=verified_at - timedelta(seconds=delay_seconds),
                     verified_at=verified_at, delay_seconds=delay_seconds, delta_pct=30.3)
    session.add(row)
    session.commit()
    return row


# Fait rougir `Depends(require_operator)`.
def test_the_route_is_reserved_to_the_operator(client, session):
    assert client.get("/v1/divergences").status_code == 401


# Fait rougir la clé de tri `(-count, min_delay_seconds, license_key_hash)`.
def test_the_keys_are_sorted_by_count_then_by_shortest_delay(client, key, session):
    listing = listed(session)
    busy = merchant(session, "clé bruyante")
    quiet = merchant(session, "clé rapide")
    divergence(session, listing.id, busy, delay_seconds=7200)
    divergence(session, listing.id, busy, delay_seconds=7200, field="published")
    divergence(session, listing.id, quiet, delay_seconds=600)
    res = client.get("/v1/divergences", headers=auth(key))
    labels = [row["label"] for row in res.json()["licenses"]]
    assert labels == ["clé bruyante", "clé rapide"]


# Fait rougir `Divergence.verified_at >= since`.
def test_the_window_holds_thirty_days(client, key, session):
    listing = listed(session)
    lic = merchant(session)
    divergence(session, listing.id, lic, verified_at=NOW - timedelta(days=40))
    res = client.get("/v1/divergences?days=30", headers=auth(key))
    assert res.json()["total"] == 0
    assert res.json()["licenses"] == []


# Fait rougir `having func.count() >= REPEAT`.
def test_the_header_counts_the_keys_with_three_or_more(client, key, session):
    listing = listed(session)
    busy = merchant(session, "clé bruyante")
    quiet = merchant(session, "clé calme")
    for field in ("price", "published", "bump"):
        divergence(session, listing.id, busy, field=field)
    divergence(session, listing.id, quiet)
    res = client.get("/v1/divergences", headers=auth(key)).json()
    assert res["total"] == 4
    assert res["keys"] == 2
    assert res["repeat_keys"] == 1


# Fait rougir la requête d'agrégat séparée de `MAX_ROWS`.
def test_the_header_stays_exact_when_the_rows_are_capped(client, key, session, monkeypatch):
    import adscope_api.divergences as divergences_module
    monkeypatch.setattr(divergences_module, "MAX_ROWS", 2)
    listing = listed(session)
    lic = merchant(session)
    for _ in range(3):
        divergence(session, listing.id, lic)
    res = client.get("/v1/divergences", headers=auth(key)).json()
    assert res["total"] == 3
    assert res["truncated"] is True
    assert sum(row["count"] for row in res["licenses"]) == 2


# Fait rougir le `pending` : sans lui, zéro écart ne dit rien du crawler.
def test_the_empty_page_still_says_how_many_wait_for_the_robot(client, key, session):
    listing = listed(session)
    session.add(Recheck(listing_id=listing.id, field="price",
                        license_key_hash=merchant(session), merchant_value="9900",
                        observed_at=NOW))
    session.commit()
    res = client.get("/v1/divergences", headers=auth(key)).json()
    assert res["total"] == 0
    assert res["licenses"] == []
    assert res["pending"] == 1
