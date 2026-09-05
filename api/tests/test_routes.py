import pytest
from fastapi.testclient import TestClient

from adscope_api.auth import hash_key, new_key
from adscope_api.db import get_session
from adscope_api.main import app
from adscope_api.models import License


@pytest.fixture
def key(session):
    raw = new_key()
    session.add(License(key_hash=hash_key(raw), label="test"))
    session.commit()
    return raw


@pytest.fixture
def client(session):
    app.dependency_overrides[get_session] = lambda: session
    yield TestClient(app)
    app.dependency_overrides.clear()


def auth(key):
    return {"Authorization": f"Bearer {key}"}


def observation(**kw):
    base = dict(site="lc", site_id="1", price=9900, brand="PEUGEOT", model="308",
                version="1.2", year=2018, mileage=62686, published_days_ago=60)
    base.update(kw)
    return base


def test_observations_requires_a_license(client):
    r = client.post("/v1/observations", json={"items": [observation()]})
    assert r.status_code == 401


def test_observations_are_recorded(client, key):
    r = client.post("/v1/observations",
                    json={"source": "user", "items": [observation()]}, headers=auth(key))
    assert r.status_code == 200
    assert r.json() == {"accepted": 1}


def test_single_listing_returns_signals(client, key):
    client.post("/v1/observations", json={"items": [observation()]}, headers=auth(key))
    r = client.get("/v1/listings/lc/1", headers=auth(key))
    assert r.status_code == 200
    body = r.json()
    assert body["price"] == 9900
    assert body["real_age_days"] == 60
    assert body["fingerprint"] is not None


def test_unknown_listing_returns_404(client, key):
    assert client.get("/v1/listings/lc/inconnue", headers=auth(key)).status_code == 404


def test_batch_returns_only_known_listings(client, key):
    client.post("/v1/observations", json={"items": [observation()]}, headers=auth(key))
    r = client.post("/v1/listings/batch",
                    json={"site": "lc", "ids": ["1", "absente"]}, headers=auth(key))
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["site_id"] == "1"


def test_batch_rejects_more_than_thirty_ids(client, key):
    r = client.post("/v1/listings/batch",
                    json={"site": "lc", "ids": [str(i) for i in range(31)]},
                    headers=auth(key))
    assert r.status_code == 422


def test_me_reports_the_license(client, key):
    r = client.get("/v1/me", headers=auth(key))
    assert r.status_code == 200
    assert r.json()["label"] == "test"
