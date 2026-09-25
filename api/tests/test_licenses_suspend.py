"""Les deux routes de suspension (`licenses.py`), opérateur seulement
(`.superpowers/disparition-plan.md` §6). Même montage que `test_operator.py` :
un vrai client HTTP, `http://localhost` pour que le cookie porte.
"""

import pytest
from fastapi.testclient import TestClient

from adscope_api.auth import hash_key, new_key
from adscope_api.auth_models import Account
from adscope_api.db import get_session
from adscope_api.main import app
from adscope_api.models import License

from conftest import auth, sign_in

XA = {"X-Adscope": "1"}


@pytest.fixture
def browser(session):
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app, base_url="http://localhost") as opened:
        yield opened
    app.dependency_overrides.clear()


def enrolled(session, email):
    account = Account(email=email)
    session.add(account)
    session.flush()
    raw = new_key()
    session.add(License(key_hash=hash_key(raw), label=email, account_id=account.id))
    session.commit()
    return account


def bare_account(session, email):
    account = Account(email=email)
    session.add(account)
    session.commit()
    return account


def keyed(session, label="marchand", automated=False, account_id=None):
    raw = new_key()
    session.add(License(key_hash=hash_key(raw), label=label,
                        automated=automated, account_id=account_id))
    session.commit()
    return raw


def as_operator(browser, session, monkeypatch, clock, email="ops@adscope.fr"):
    monkeypatch.setenv("ADSCOPE_OPERATOR_EMAIL", email)
    account = enrolled(session, email)
    sign_in(browser, session, account.id, clock.now)
    return account


def suspend(browser, key_hash, headers=None):
    return browser.post(f"/v1/licenses/{key_hash}/suspend", headers={**XA, **(headers or {})})


def restore(browser, key_hash, headers=None):
    return browser.post(f"/v1/licenses/{key_hash}/restore", headers={**XA, **(headers or {})})


# Fait rougir `licenses.suspend`, `target.active = False`.
def test_the_operator_suspends_a_key(browser, session, clock, monkeypatch):
    as_operator(browser, session, monkeypatch, clock)
    raw = keyed(session)
    res = suspend(browser, hash_key(raw))
    assert res.status_code == 200
    assert res.json() == {"key_hash": hash_key(raw), "label": "marchand", "active": False}
    assert session.get(License, hash_key(raw)).active is False


# Fait rougir `auth.resolve`, `not license_.active` — existante, prouve la
# promesse du plan : la suspension est effective dès l'appel suivant, sans
# rien à propager.
def test_a_suspended_key_is_refused_everywhere(browser, session, clock, monkeypatch):
    as_operator(browser, session, monkeypatch, clock)
    raw = keyed(session)
    suspend(browser, hash_key(raw))
    res = browser.get("/v1/sweep", headers=auth(raw))
    assert res.status_code == 401


# Fait rougir la branche « licence suspendue » d'`auth.require_license`.
def test_a_suspended_key_is_told_it_is_suspended(browser, session, clock, monkeypatch):
    as_operator(browser, session, monkeypatch, clock)
    raw = keyed(session)
    suspend(browser, hash_key(raw))
    res = browser.post("/v1/disappearances",
                       json={"site": "lbc", "site_id": "1", "evidence": "absent"},
                       headers=auth(raw))
    assert res.status_code == 401
    assert res.json()["detail"] == "licence suspendue"


# Même garde côté cookie : un compte dont l'unique licence est suspendue.
def test_a_suspended_accounts_cookie_is_told_it_is_suspended(browser, session, clock, monkeypatch):
    as_operator(browser, session, monkeypatch, clock)
    account = bare_account(session, "marchand@garage.fr")
    raw = keyed(session, account_id=account.id)
    suspend(browser, hash_key(raw))
    other_client = TestClient(app, base_url="http://localhost")
    other_client.app.dependency_overrides[get_session] = lambda: session
    sign_in(other_client, session, account.id, clock.now)
    res = other_client.get("/v1/follows")
    assert res.status_code == 401
    assert res.json()["detail"] == "licence suspendue"


# Fait rougir `licenses.restore`, `target.active = True`.
def test_the_operator_restores_a_key(browser, session, clock, monkeypatch):
    as_operator(browser, session, monkeypatch, clock)
    raw = keyed(session)
    suspend(browser, hash_key(raw))
    res = restore(browser, hash_key(raw))
    assert res.status_code == 200
    assert res.json()["active"] is True
    assert session.get(License, hash_key(raw)).active is True


# Fait rougir l'absence de garde sur l'état d'avant : idempotence.
def test_suspending_twice_changes_nothing(browser, session, clock, monkeypatch):
    as_operator(browser, session, monkeypatch, clock)
    raw = keyed(session)
    first = suspend(browser, hash_key(raw))
    second = suspend(browser, hash_key(raw))
    assert (first.status_code, second.status_code) == (200, 200)
    assert second.json()["active"] is False


# Fait rougir `if target.automated: raise 403`.
def test_an_automated_license_is_never_suspended(browser, session, clock, monkeypatch):
    as_operator(browser, session, monkeypatch, clock)
    raw = keyed(session, label="crawler", automated=True)
    res = suspend(browser, hash_key(raw))
    assert res.status_code == 403
    assert res.json()["detail"] == "licence automatique"
    assert session.get(License, hash_key(raw)).active is True


# Fait rougir la comparaison `key_hash`/`account_id` avec l'appelant : ni sa
# propre clé, ni une autre clé de son compte.
def test_the_operator_cannot_suspend_itself(browser, session, clock, monkeypatch):
    account = as_operator(browser, session, monkeypatch, clock)
    operator_key_hash = session.query(License.key_hash).filter_by(account_id=account.id).scalar()
    res = suspend(browser, operator_key_hash)
    assert res.status_code == 403
    assert res.json()["detail"] == "licence de l'opérateur"

    other_key_hash = hash_key(keyed(session, label="ops-second", account_id=account.id))
    res = suspend(browser, other_key_hash)
    assert res.status_code == 403


# Fait rougir `if target is None: raise 404`.
def test_an_unknown_hash_is_a_404(browser, session, clock, monkeypatch):
    as_operator(browser, session, monkeypatch, clock)
    res = suspend(browser, "inconnue")
    assert res.status_code == 404
    assert res.json()["detail"] == "licence inconnue"


# Fait rougir `require_operator` sur les deux routes : un marchand ordinaire
# ne suspend personne.
def test_a_merchant_cannot_suspend_anyone(browser, session, clock, monkeypatch):
    monkeypatch.setenv("ADSCOPE_OPERATOR_EMAIL", "ops@adscope.fr")
    account = enrolled(session, "marchand@garage.fr")
    sign_in(browser, session, account.id, clock.now)
    raw = keyed(session)
    res = suspend(browser, hash_key(raw))
    assert res.status_code == 403


def test_the_routes_need_a_license_or_a_cookie(browser, session, clock):
    raw_hash = hash_key(keyed(session))
    assert suspend(browser, raw_hash).status_code == 401
    assert restore(browser, raw_hash).status_code == 401


# Fait rougir `session.get(License, key_hash)` : une clé en clair (jamais une
# empreinte) ne désigne aucune licence.
def test_the_route_refuses_a_raw_key_in_the_path(browser, session, clock, monkeypatch):
    as_operator(browser, session, monkeypatch, clock)
    raw = keyed(session)
    res = suspend(browser, raw)
    assert res.status_code == 404
