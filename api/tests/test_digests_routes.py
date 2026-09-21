from datetime import datetime, timezone

from adscope_api.alert_models import Digest
from adscope_api.auth import hash_key, new_key
from adscope_api.auth_models import Account
from adscope_api.models import License

from conftest import auth

NOW = datetime(2026, 9, 18, 7, 0, tzinfo=timezone.utc)
XA = {"X-Adscope": "1"}


def enrolled(session, email="pro@garage.fr"):
    account = Account(email=email)
    session.add(account)
    session.flush()
    key = new_key()
    session.add(License(key_hash=hash_key(key), label="garage", account_id=account.id))
    session.commit()
    return account, key


def digest(session, account_id, token="tok123456789012345678", day=None):
    row = Digest(
        account_id=account_id, day=day or NOW.date(), token=token, subject="adscope — 1 baisse",
        text="corps texte", html="<p>corps html</p>", created_at=NOW, visits=0,
    )
    session.add(row)
    session.commit()
    return row


# Fait rougir la liste des colonnes du `select` de `get_digests` : la liste
# ne porte pas les corps.
def test_the_list_does_not_carry_the_bodies(client, session, clock):
    account, key = enrolled(session)
    digest(session, account.id)
    resp = client.get("/v1/digests", headers=auth(key))
    assert resp.status_code == 200
    assert "text" not in resp.json()[0] and "html" not in resp.json()[0]


def test_reading_one_digest_carries_its_bodies(client, session, clock):
    account, key = enrolled(session)
    d = digest(session, account.id)
    resp = client.get(f"/v1/digests/{d.id}", headers=auth(key))
    assert resp.json()["html"] == "<p>corps html</p>"


# Fait rougir `row.account_id != account_id` dans `get_digest` : l'email
# d'un autre compte est un 404.
def test_someone_elses_digest_is_404(client, session, clock):
    mine, mine_key = enrolled(session, "moi@garage.fr")
    theirs, _ = enrolled(session, "eux@garage.fr")
    d = digest(session, theirs.id)
    assert client.get(f"/v1/digests/{d.id}", headers=auth(mine_key)).status_code == 404


# Fait rougir `row.visits += 1` puis `if row.first_visit_at is None`.
def test_a_visit_increments_and_the_second_does_not_overwrite_first_visit(client, session, clock):
    account, _ = enrolled(session)
    d = digest(session, account.id)
    r1 = client.post("/v1/digests/visit", json={"token": d.token}, headers=XA)
    assert r1.status_code == 204
    first_at = session.get(Digest, d.id).first_visit_at
    clock.now = NOW.replace(hour=8)
    client.post("/v1/digests/visit", json={"token": d.token}, headers=XA)
    row = session.get(Digest, d.id)
    assert row.visits == 2 and row.first_visit_at == first_at


def test_an_unknown_visit_token_is_404(client, session):
    assert client.post("/v1/digests/visit", json={"token": "n'importe quoi"}, headers=XA).status_code == 404


def test_the_digest_routes_need_a_license(client, session):
    assert client.get("/v1/digests").status_code == 401
