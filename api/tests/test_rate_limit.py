"""Le limiteur de débit : fenêtre glissante, horloge injectée."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from adscope_api import rate_limit
from adscope_api.rate_limit import RATE_LIMITED, client_ip, guard, limiter

NOW = datetime(2026, 9, 22, 12, 0, tzinfo=timezone.utc)


def request(ip="1.2.3.4", headers=None):
    return SimpleNamespace(client=SimpleNamespace(host=ip), headers=headers or {})


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


# Fait rougir le balayage `for dead in [...]: del _hits[dead]` dans
# `Limiter.hit` : une IP jamais revue ne doit pas rester dans `_hits`
# indéfiniment (croissance non bornée, revue de code).
def test_a_stale_entry_is_purged_after_the_widest_window():
    guard("signup", "jamais-revu@garage.fr", request("9.9.9.9"), NOW)
    assert ("signup", "ip:9.9.9.9") in rate_limit._hits
    later = NOW + rate_limit.MAX_WINDOW
    guard("login", "quelquun@garage.fr", request("1.1.1.1"), later)
    assert ("signup", "ip:9.9.9.9") not in rate_limit._hits


# `client_ip` : la porte de l'AUTH-06/C-1. Fait rougir
# `if trusted_proxy(): ... return request.client.host` : sans
# `ADSCOPE_TRUSTED_PROXY` posée, l'en-tête forgé ne doit jamais compter.
def test_client_ip_ignores_a_forged_header_without_a_trusted_proxy(monkeypatch):
    monkeypatch.delenv("ADSCOPE_TRUSTED_PROXY", raising=False)
    req = request("10.0.0.1", headers={"x-forwarded-for": "1.1.1.1"})
    assert client_ip(req) == "10.0.0.1"


# Fait rougir `last = forwarded.rsplit(",", 1)[-1].strip()` : avec la
# variable posée, c'est l'en-tête qui compte — le DERNIER élément, celui que
# le proxy de confiance a ajouté. `8.8.8.8` ne rejoue jamais `request.client`
# (`10.0.0.1`) : un simple retour à `request.client.host` passerait le test
# à tort.
def test_client_ip_honors_the_last_forwarded_hop_with_a_trusted_proxy(monkeypatch):
    monkeypatch.setenv("ADSCOPE_TRUSTED_PROXY", "1")
    req = request("10.0.0.1", headers={"x-forwarded-for": "1.1.1.1, 8.8.8.8"})
    assert client_ip(req) == "8.8.8.8"


# Le premier élément est celui que le client écrit lui-même : jamais celui
# qui compte, même avec un proxy de confiance.
def test_client_ip_never_trusts_the_first_forwarded_hop(monkeypatch):
    monkeypatch.setenv("ADSCOPE_TRUSTED_PROXY", "1")
    req = request("10.0.0.1", headers={"x-forwarded-for": "1.1.1.1, 2.2.2.2"})
    assert client_ip(req) == "2.2.2.2"


# `guard` lit maintenant `client_ip`, pas `request.client.host` en dur : deux
# marchands distincts derrière le MÊME proxy Render (même `request.client`,
# la seule chose qu'un revert vers `request.client.host` verrait) ne se
# grillent plus le plafond l'un l'autre (AUTH-06/C-1) — c'est le scénario
# exact de la trouvaille : « 30 connexions bidon interdisent la connexion à
# tous les marchands ».
def test_guard_does_not_share_the_cap_across_distinct_forwarded_ips_behind_the_same_proxy(
    monkeypatch,
):
    monkeypatch.setenv("ADSCOPE_TRUSTED_PROXY", "1")
    for i in range(30):
        guard("login", f"marchand{i}@garage.fr",
              request("10.0.0.1", headers={"x-forwarded-for": f"9.9.9.{i}"}), NOW)
    # Un 31e marchand, sa propre IP réelle, derrière le même proxy : ne lève pas.
    guard("login", "encore-un-autre@garage.fr",
          request("10.0.0.1", headers={"x-forwarded-for": "9.9.9.99"}), NOW)


# Le même en-tête, répété : c'est bien le plafond par IP réelle qui continue
# de s'appliquer, pas un renoncement à tout plafond.
def test_guard_still_caps_the_same_forwarded_ip_behind_a_trusted_proxy(monkeypatch):
    monkeypatch.setenv("ADSCOPE_TRUSTED_PROXY", "1")
    for i in range(30):
        guard("login", f"marchand{i}@garage.fr",
              request("10.0.0.1", headers={"x-forwarded-for": "9.9.9.9"}), NOW)
    with pytest.raises(HTTPException) as exc:
        guard("login", "encore-un-autre@garage.fr",
              request("10.0.0.1", headers={"x-forwarded-for": "9.9.9.9"}), NOW)
    assert exc.value.status_code == 429
