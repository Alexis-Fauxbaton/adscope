from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from adscope_api.auth import hash_key, new_key
from adscope_api.models import License, Listing, UsageDay
from adscope_api import quota

from conftest import auth

NOW = datetime(2026, 9, 25, 12, 0, tzinfo=timezone.utc)


@pytest.fixture
def human(session):
    raw = new_key()
    key_hash = hash_key(raw)
    session.add(License(key_hash=key_hash, label="marchand"))
    session.commit()
    return raw, key_hash


@pytest.fixture
def robot(session):
    raw = new_key()
    key_hash = hash_key(raw)
    session.add(License(key_hash=key_hash, label="crawler", automated=True))
    session.commit()
    return raw, key_hash


def license_of(session, key_hash):
    return session.get(License, key_hash)


_listing_seq = 0


def used(session, key_hash, day, n):
    """Une journée d'usage pour une annonce neuve — `UsageDay.listing_id`
    référence `listings`, une par appel plutôt que partagée entre les tests."""
    global _listing_seq
    _listing_seq += 1
    listing = Listing(site="lbc", site_id=str(1000000 + _listing_seq), first_seen=NOW,
                      last_seen=NOW, observations=n)
    session.add(listing)
    session.commit()
    session.add(UsageDay(license_key_hash=key_hash, day=day, listing_id=listing.id,
                         observations=n))
    session.commit()


# Fait rougir `if used >= limit: raise HTTPException(429…)`.
def test_a_key_past_its_daily_quota_is_refused(session, human, monkeypatch):
    monkeypatch.setenv("ADSCOPE_OBSERVATIONS_PER_DAY", "10")
    _, key_hash = human
    used(session, key_hash, NOW.date(), 10)
    with pytest.raises(Exception) as exc:
        quota.guard(session, license_of(session, key_hash), NOW)
    assert exc.value.status_code == 429


# Fait rougir `if license_ is None or license_.automated: return`.
def test_the_automated_license_has_no_quota(session, robot, monkeypatch):
    monkeypatch.setenv("ADSCOPE_OBSERVATIONS_PER_DAY", "1")
    _, key_hash = robot
    used(session, key_hash, NOW.date(), 100)
    quota.guard(session, license_of(session, key_hash), NOW)  # ne lève pas


# Fait rougir `UsageDay.day == now.date()` : une observation d'hier ne compte
# pas dans le quota d'aujourd'hui.
def test_the_quota_counts_the_utc_day_only(session, human, monkeypatch):
    monkeypatch.setenv("ADSCOPE_OBSERVATIONS_PER_DAY", "10")
    _, key_hash = human
    used(session, key_hash, (NOW - timedelta(days=1)).date(), 50)
    quota.guard(session, license_of(session, key_hash), NOW)  # ne lève pas


# Fait rougir `func.sum(UsageDay.observations)` : deux annonces différentes le
# même jour s'additionnent, un `count()` des lignes les compterait à tort.
def test_the_quota_sums_every_listing_of_the_day(session, human, monkeypatch):
    monkeypatch.setenv("ADSCOPE_OBSERVATIONS_PER_DAY", "10")
    _, key_hash = human
    used(session, key_hash, NOW.date(), 6)
    used(session, key_hash, NOW.date(), 6)
    with pytest.raises(Exception) as exc:
        quota.guard(session, license_of(session, key_hash), NOW)
    assert exc.value.status_code == 429


# Fait rougir le texte du `detail`.
def test_the_refusal_says_the_ceiling_and_when_it_repeats(session, human, monkeypatch):
    monkeypatch.setenv("ADSCOPE_OBSERVATIONS_PER_DAY", "10")
    _, key_hash = human
    used(session, key_hash, NOW.date(), 10)
    with pytest.raises(Exception) as exc:
        quota.guard(session, license_of(session, key_hash), NOW)
    assert "10" in exc.value.detail
    assert "minuit" in exc.value.detail


# Fait rougir l'appel `quota.guard(...)` dans `post_observations` : sans lui,
# la route accepterait et écrirait au-delà du quota. Le refus lui-même est
# simulé (`monkeypatch` sur `quota.guard`) pour ne dépendre d'aucune horloge —
# c'est l'existence de l'appel qu'on éprouve, pas l'arithmétique du quota,
# déjà couverte ci-dessus.
def test_the_route_answers_429_and_writes_nothing(client, session, human, monkeypatch):
    raw, _ = human

    def refuse(*_args, **_kwargs):
        raise HTTPException(status_code=429, detail="quota")

    monkeypatch.setattr(quota, "guard", refuse)
    res = client.post("/v1/observations", json={
        "items": [{"site": "lbc", "site_id": "3263259495", "price": 9900}],
    }, headers=auth(raw))
    assert res.status_code == 429
    assert session.query(Listing).filter_by(site_id="3263259495").count() == 0


# Fait rougir `config.observations_per_day` : le plafond se lit dans
# l'environnement à chaque appel, pas figé au démarrage.
def test_the_ceiling_comes_from_the_environment(session, human, monkeypatch):
    monkeypatch.setenv("ADSCOPE_OBSERVATIONS_PER_DAY", "3")
    _, key_hash = human
    used(session, key_hash, NOW.date(), 3)
    with pytest.raises(Exception) as exc:
        quota.guard(session, license_of(session, key_hash), NOW)
    assert "3" in exc.value.detail
