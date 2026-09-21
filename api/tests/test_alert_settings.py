from datetime import datetime, timezone

from adscope_api.alert_models import AccountSettings
from adscope_api.auth import hash_key, new_key
from adscope_api.auth_models import Account
from adscope_api.models import License

from conftest import auth

NOW = datetime(2026, 9, 18, 12, 0, tzinfo=timezone.utc)
XA = {"X-Adscope": "1"}


def enrolled(session, email="pro@garage.fr"):
    account = Account(email=email)
    session.add(account)
    session.flush()
    key = new_key()
    session.add(License(key_hash=hash_key(key), label="garage", account_id=account.id))
    session.commit()
    return key


def headers(key):
    return {**auth(key), **XA}


# Fait rougir `settings_of` : le `GET` crée la ligne et frappe le jeton.
def test_get_creates_the_row_and_mints_a_token(client, session, clock):
    key = enrolled(session)
    resp = client.get("/v1/alerts/settings", headers=auth(key))
    assert resp.status_code == 200
    assert resp.json() == {"digest_enabled": True, "include_follows": True}
    row = session.get(AccountSettings, session.query(License).one().account_id)
    assert row is not None and row.unsubscribe_token_hash


# Le jeton n'est jamais rendu par la route de réglage.
def test_the_token_is_never_rendered_by_the_settings_route(client, session, clock):
    key = enrolled(session)
    resp = client.get("/v1/alerts/settings", headers=auth(key))
    assert "unsubscribe_token_hash" not in resp.json() and "token" not in resp.json()


# `PUT` pose les deux interrupteurs.
def test_put_updates_the_switches(client, session, clock):
    key = enrolled(session)
    resp = client.put(
        "/v1/alerts/settings", json={"digest_enabled": False, "include_follows": False},
        headers=headers(key),
    )
    assert resp.json() == {"digest_enabled": False, "include_follows": False}


def _token_of(session, account_id):
    return session.get(AccountSettings, account_id).unsubscribe_token_hash


# Fait rougir `row.digest_enabled = False` dans `unsubscribe` — et la route
# n'a besoin d'aucune session : un lien de messagerie n'en a pas.
def test_unsubscribe_with_a_valid_token_turns_off_the_digest(client, session, clock):
    key = enrolled(session)
    client.get("/v1/alerts/settings", headers=auth(key))
    account_id = session.query(License).one().account_id
    token = _token_of(session, account_id)
    resp = client.post("/v1/alerts/unsubscribe", json={"token": token}, headers=XA)
    assert resp.status_code == 200
    assert resp.json()["digest_enabled"] is False


# Fait rougir `if row is None: raise HTTPException(404, ...)` : un jeton
# inconnu ne modifie rien.
def test_unsubscribe_with_an_unknown_token_is_404(client, session):
    resp = client.post("/v1/alerts/unsubscribe", json={"token": "n'importe quoi"}, headers=XA)
    assert resp.status_code == 404


# Se réabonner avec le même jeton rallume.
def test_resubscribe_turns_the_digest_back_on(client, session, clock):
    key = enrolled(session)
    client.get("/v1/alerts/settings", headers=auth(key))
    account_id = session.query(License).one().account_id
    token = _token_of(session, account_id)
    client.post("/v1/alerts/unsubscribe", json={"token": token}, headers=XA)
    resp = client.post("/v1/alerts/resubscribe", json={"token": token}, headers=XA)
    assert resp.json()["digest_enabled"] is True


# Fait rougir `check_csrf(request)` dans `unsubscribe` : sans l'en-tête,
# distinguer un vrai clic d'une requête fabriquée par un intermédiaire.
def test_unsubscribe_without_x_adscope_header_is_403(client, session, clock):
    key = enrolled(session)
    client.get("/v1/alerts/settings", headers=auth(key))
    account_id = session.query(License).one().account_id
    token = _token_of(session, account_id)
    resp = client.post("/v1/alerts/unsubscribe", json={"token": token})
    assert resp.status_code == 403
