from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from adscope_api.auth import hash_key, new_key
from adscope_api.auth_models import Account
from adscope_api.db import get_session
from adscope_api.main import app
from adscope_api.models import License, Listing
from adscope_api.taxonomy import derive

from conftest import auth, sign_in

NOW = datetime(2026, 9, 18, 9, 0, tzinfo=timezone.utc)
XA = {"X-Adscope": "1"}

BODY = {
    "name": "Clio IV diesel 59-62", "query": "brand=Renault&department=59&department=62",
    "notify_drops": True, "notify_new": False, "min_age_days": 30, "min_drop_pct": 3,
    "paused": False,
}


def enrolled(session, email="pro@garage.fr", label="garage"):
    account = Account(email=email)
    session.add(account)
    session.flush()
    key = new_key()
    session.add(License(key_hash=hash_key(key), label=label, account_id=account.id))
    session.commit()
    return key


def headers(key):
    return {**auth(key), **XA}


# Même hôte que le cookie (`http://localhost`, jamais `testserver`) — voir
# `test_session_cookie.py`, qui pose ce fixture pour la même raison.
@pytest.fixture
def browser(session):
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app, base_url="http://localhost") as opened:
        yield opened
    app.dependency_overrides.clear()


def post(client, key, body=BODY):
    return client.post("/v1/searches", json=body, headers=headers(key))


# Fait rougir `SavedSearch.account_id == account_id` dans `get_searches` : la
# recherche créée se relit, avec sa `query` normalisée.
def test_creating_then_reading_a_search(client, session, clock):
    key = enrolled(session)
    created = post(client, key).json()
    assert created["query"] == "brand=Renault&department=59&department=62"
    got = client.get("/v1/searches", headers=auth(key)).json()
    assert [s["id"] for s in got] == [created["id"]]


# Fait rougir `row.account_id == account_id` dans `_owned` : la recherche
# d'un autre compte n'existe pas pour GET/PUT, y compris par identifiant.
def test_idor_get_and_put_are_404_for_someone_elses_search(client, session, clock):
    mine = enrolled(session, "moi@garage.fr")
    theirs = enrolled(session, "eux@garage.fr")
    search_id = post(client, theirs).json()["id"]
    assert client.get(f"/v1/searches/{search_id}", headers=auth(mine)).status_code == 404
    assert client.put(
        f"/v1/searches/{search_id}", json=BODY, headers=headers(mine)
    ).status_code == 404


# DELETE reste idempotent (même contrat que `follows.delete_follow`) : une
# ressource qu'on ne possède pas est traitée comme déjà absente, 204.
def test_deleting_someone_elses_search_is_a_no_op_204(client, session, clock):
    mine = enrolled(session, "moi@garage.fr")
    theirs = enrolled(session, "eux@garage.fr")
    search_id = post(client, theirs).json()["id"]
    assert client.delete(f"/v1/searches/{search_id}", headers=headers(mine)).status_code == 204
    assert client.get(f"/v1/searches/{search_id}", headers=auth(theirs)).status_code == 200


# Fait rougir `if license_.account_id is None: raise HTTPException(403, ...)`
# dans `auth.require_account` : une clé de machine, sans compte, n'entre pas.
def test_a_key_without_an_account_gets_403(client, session):
    raw = new_key()
    session.add(License(key_hash=hash_key(raw), label="crawler"))
    session.commit()
    assert client.get("/v1/searches", headers=auth(raw)).status_code == 403


# Fait rougir `sessions.check_csrf` : une écriture par cookie de session,
# sans l'en-tête, est refusée. (Une clé `Bearer` en est dispensée — rien
# d'ambiant ne l'authentifie, voir `sessions.check_csrf`.)
def test_post_by_cookie_without_x_adscope_header_is_403(browser, session, clock):
    account = Account(email="cookie@garage.fr")
    session.add(account)
    session.flush()
    session.add(License(key_hash=hash_key(new_key()), label="garage", account_id=account.id))
    session.commit()
    sign_in(browser, session, account.id, clock.now)
    resp = browser.post("/v1/searches", json=BODY)
    assert resp.status_code == 403


# Fait rougir `notify_new: Mapped[bool] = mapped_column(..., default=False)` :
# la valeur par défaut de la table (et du modèle Pydantic) est fausse.
def test_notify_new_defaults_to_false(client, session, clock):
    key = enrolled(session)
    body = {k: v for k, v in BODY.items() if k != "notify_new"}
    assert post(client, key, body).json()["notify_new"] is False


# Fait rougir `if count >= MAX_SEARCHES: raise HTTPException(409, ...)`.
def test_the_51st_search_is_a_409(client, session, clock):
    key = enrolled(session)
    for i in range(50):
        assert post(client, key, {**BODY, "name": f"s{i}"}).status_code == 201
    assert post(client, key, {**BODY, "name": "s50"}).status_code == 409


# Fait rougir `market_ranges.parse` (via `MarketParams.core_kwargs`) : une
# fourchette à l'envers dans `query` est un 422.
def test_a_reversed_range_in_the_query_is_a_422(client, session, clock):
    key = enrolled(session)
    body = {**BODY, "query": "price_min=20000&price_max=10000"}
    assert post(client, key, body).status_code == 422


# Un nom vide (une fois rogné) est rejeté avant d'atteindre la base.
def test_a_blank_name_is_rejected(client, session, clock):
    key = enrolled(session)
    assert post(client, key, {**BODY, "name": "   "}).status_code == 422


# Fait rougir `SavedSearch.created_at` : c'est l'horloge injectée, jamais
# `datetime.now()`, qui pose le point de départ des alertes.
def test_created_at_is_the_injected_clock(client, session, clock):
    key = enrolled(session)
    created = post(client, key).json()
    assert created["created_at"].startswith("2026-09-18T12:00:00")


# `PUT` remplace l'objet entier : une deuxième écriture avec une autre
# `query` la renormalise à nouveau, et les autres champs suivent le corps
# envoyé plutôt que de garder les anciens.
def test_put_replaces_the_whole_search(client, session, clock):
    key = enrolled(session)
    search_id = post(client, key).json()["id"]
    updated = client.put(
        f"/v1/searches/{search_id}",
        json={**BODY, "name": "Renouvelée", "paused": True},
        headers=headers(key),
    ).json()
    assert (updated["name"], updated["paused"]) == ("Renouvelée", True)


def test_the_search_routes_need_a_license(client, session):
    assert client.get("/v1/searches").status_code == 401


# Une annonce du périmètre de `BODY` (Renault, département 59) : les tests
# de couverture ci-dessous la comparent au défaut de `SearchOut` (`0`).
def _renault_59(session, clock):
    row = Listing(site="lbc", site_id="1", first_seen=clock.now, last_seen=clock.now,
                  observations=1, brand="Renault", department="59")
    derive(row)
    session.add(row)
    session.commit()


# Fait rougir `with_coverage` sur la route liste (lot F2) : sans lui, la
# recherche relue afficherait le défaut de `SearchOut` (`seen_total == 0`)
# plutôt que le compte réel de son périmètre.
def test_get_searches_carries_the_coverage_fields(client, session, clock):
    _renault_59(session, clock)
    key = enrolled(session)
    post(client, key)
    got = client.get("/v1/searches", headers=auth(key)).json()
    assert got[0]["seen_total"] == 1


# `BODY` ("brand=Renault&department=…") n'a pas de modèle : trop large pour
# le balayage. Fait rougir le report de `sweep_url.translate` dans
# `with_coverage`.
def test_a_search_without_a_model_is_too_wide_for_the_sweep(client, session, clock):
    key = enrolled(session)
    created = post(client, key).json()
    assert created["sweep_status"] == "trop_large"


# Fait rougir `with_coverage` sur la route de création : sans lui, `POST`
# rendrait les valeurs par défaut de `SearchOut` (`seen_total == 0`) plutôt
# que le compte réel.
def test_post_search_already_renders_coverage(client, session, clock):
    _renault_59(session, clock)
    key = enrolled(session)
    created = post(client, key).json()
    assert created["seen_total"] == 1
