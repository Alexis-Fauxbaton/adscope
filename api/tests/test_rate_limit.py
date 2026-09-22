"""Le limiteur de débit : fenêtre glissante, horloge injectée."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from adscope_api.rate_limit import RATE_LIMITED, guard, limiter

NOW = datetime(2026, 9, 22, 12, 0, tzinfo=timezone.utc)


def request(ip="1.2.3.4"):
    return SimpleNamespace(client=SimpleNamespace(host=ip))


# Fait rougir `if len(recent) >= limit:` dans `Limiter.hit` : la limite
# `login` par email est 10 ; la dixième passe, la onzième non.
def test_the_tenth_login_attempt_passes_the_eleventh_does_not():
    for _ in range(10):
        guard("login", "karim@garage.fr", request(), NOW)
    with pytest.raises(HTTPException) as exc:
        guard("login", "karim@garage.fr", request(), NOW)
    assert exc.value.status_code == 429


# Fait rougir la purge `if now - seen < window` : la fenêtre écoulée rouvre
# le plafond plutôt que de l'accumuler pour toujours.
def test_an_elapsed_window_reopens_the_limit():
    for _ in range(10):
        guard("login", "karim@garage.fr", request(), NOW)
    later = NOW + timedelta(minutes=16)
    guard("login", "karim@garage.fr", request(), later)  # ne lève pas


# Fait rougir `f"email:{email}"` / `f"ip:{ip}"` : deux clés distinctes, sinon
# deux marchands sur la même IP se grillent le plafond l'un l'autre.
def test_email_and_ip_are_counted_separately():
    for _ in range(10):
        guard("login", "karim@garage.fr", request("1.1.1.1"), NOW)
    # Le plafond email est atteint, mais une autre adresse depuis la même IP
    # ne l'est pas tant que l'IP (30) n'est pas atteinte.
    guard("login", "autre@garage.fr", request("1.1.1.1"), NOW)


def test_the_ip_limit_still_applies_across_emails():
    for i in range(30):
        guard("login", f"marchand{i}@garage.fr", request("1.1.1.1"), NOW)
    with pytest.raises(HTTPException) as exc:
        guard("login", "encore-un-autre@garage.fr", request("1.1.1.1"), NOW)
    assert exc.value.status_code == 429


# Fait rougir `raise HTTPException(status_code=429, detail=RATE_LIMITED)` :
# le message doit être lisible pour Karim, pas une trace technique.
def test_the_429_carries_the_readable_message():
    for _ in range(10):
        guard("login", "karim@garage.fr", request(), NOW)
    with pytest.raises(HTTPException) as exc:
        guard("login", "karim@garage.fr", request(), NOW)
    assert exc.value.detail == RATE_LIMITED


# Un bucket sans plafond par email (`verify`, `reset`) ne compte que l'IP.
def test_a_bucket_without_an_email_limit_only_counts_the_ip():
    for _ in range(30):
        guard("verify", "karim@garage.fr", request("9.9.9.9"), NOW)
    with pytest.raises(HTTPException):
        guard("verify", "quelquun-dautre@garage.fr", request("9.9.9.9"), NOW)


def test_limiter_reset_clears_every_bucket():
    for _ in range(10):
        guard("login", "karim@garage.fr", request(), NOW)
    limiter.reset()
    guard("login", "karim@garage.fr", request(), NOW)  # ne lève pas
