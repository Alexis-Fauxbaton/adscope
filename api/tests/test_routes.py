from adscope_api.auth import hash_key
from adscope_api.models import PricePoint
from conftest import auth


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
    assert r.json() == {"accepted": 1, "refused": 0}


# Bout en bout, licence Bearer et vraie route HTTP (sur adscope_test, jamais
# la base réelle) : l'observation qui porte les trois champs du lot se
# retrouve servie par `/v1/market`, filtrable par eux.
def test_fuel_gearbox_department_travel_from_post_to_market(client, key):
    client.post(
        "/v1/observations",
        json={"items": [observation(fuel="diesel", gearbox="automatique",
                                    postal_code="75015")]},
        headers=auth(key),
    )
    body = client.get(
        "/v1/market", params={"fuel": "diesel", "gearbox": "automatique", "department": "75"},
        headers=auth(key),
    ).json()
    assert body["total"] == 1
    assert body["items"][0]["department"] == "75"


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


def test_batch_accepts_thirty_ids(client, key):
    r = client.post("/v1/listings/batch",
                    json={"site": "lc", "ids": [str(i) for i in range(30)]},
                    headers=auth(key))
    assert r.status_code == 200


def test_batch_rejects_more_than_thirty_ids(client, key):
    r = client.post("/v1/listings/batch",
                    json={"site": "lc", "ids": [str(i) for i in range(31)]},
                    headers=auth(key))
    assert r.status_code == 422


def test_me_reports_the_license(client, key):
    r = client.get("/v1/me", headers=auth(key))
    assert r.status_code == 200
    assert r.json()["label"] == "test"


# Ces deux valeurs faisaient répondre 422 pour le lot entier. Elles sont
# aberrantes, pas le lot : le champ est ignoré, l'annonce entre — le reste de
# l'observation, lui, est vrai. Voir `test_gauge.py`.
def test_a_negative_published_days_ago_is_ignored(client, key):
    r = client.post("/v1/observations",
                    json={"items": [observation(published_days_ago=-400)]}, headers=auth(key))
    assert r.status_code == 200
    assert client.get("/v1/listings/lc/1", headers=auth(key)).json()["real_age_days"] is None


def test_a_negative_price_is_ignored(client, key):
    r = client.post("/v1/observations",
                    json={"items": [observation(price=-1)]}, headers=auth(key))
    assert r.status_code == 200
    assert client.get("/v1/listings/lc/1", headers=auth(key)).json()["price"] is None


def test_same_observation_twice_keeps_one_price_point(client, key):
    for _ in range(2):
        client.post("/v1/observations", json={"items": [observation()]}, headers=auth(key))
    body = client.get("/v1/listings/lc/1", headers=auth(key)).json()
    assert body["observations"] == 2
    assert body["price_history"] == [
        {"at": body["price_history"][0]["at"], "price": 9900, "confirmation": False},
    ]
    # Deux passages dans la même seconde : rien à confirmer avant la semaine.
    assert (body["price_checks"], body["price_gap_days"]) == (0, 0)


def test_source_claimed_by_the_client_is_ignored(client, session, key):
    client.post("/v1/observations",
                json={"source": "crawler", "items": [observation()]}, headers=auth(key))
    assert session.query(PricePoint).one().source == "user"


def test_observations_are_attributed_to_the_calling_license(client, session, key):
    client.post("/v1/observations", json={"items": [observation()]}, headers=auth(key))
    assert session.query(PricePoint).one().license_key_hash == hash_key(key)


def pro(site_id, **kw):
    return observation(site_id=site_id, seller_type="pro", seller_id="76697703",
                       seller_name="CVD AUTOMOBILES", **kw)


def test_the_seller_route_aggregates_his_listings(client, key):
    client.post("/v1/observations",
                json={"items": [pro("1"), pro("2", published_days_ago=3)]},
                headers=auth(key))
    r = client.get("/v1/sellers/lc/76697703", headers=auth(key))
    assert r.status_code == 200
    body = r.json()
    assert body["seller_name"] == "CVD AUTOMOBILES"
    assert (body["listings"], body["over_a_month"]) == (2, 1)
    assert body["window_days"] == 30


def test_an_unknown_seller_returns_404(client, key):
    assert client.get("/v1/sellers/lc/inconnu", headers=auth(key)).status_code == 404


def test_the_seller_route_requires_a_license(client):
    assert client.get("/v1/sellers/lc/76697703").status_code == 401


# La popup interroge l'API : l'appel est le signal, et il est attribué comme
# les observations.
def test_a_private_seller_is_never_aggregated(client, key):
    client.post("/v1/observations",
                json={"items": [observation(seller_type="private",
                                            seller_id="27784407", seller_name="Fra")]},
                headers=auth(key))
    assert client.get("/v1/sellers/lc/27784407", headers=auth(key)).status_code == 404
