import inspect
from datetime import datetime, timezone

from adscope_api import market
from adscope_api.market_params import MarketParams
from adscope_api.models import Listing

from conftest import auth

ROUTE_ONLY = {"session", "license_", "sort", "limit", "offset"}
NOW = datetime(2026, 9, 18, 9, 0, tzinfo=timezone.utc)


# Fait rougir `MarketParams.core_kwargs` — la ligne
# `department=combined_departments(...)` : une chaîne enregistrée rejoue vers
# les mêmes arguments que la route construit à la main.
def test_core_kwargs_matches_what_the_route_builds():
    params = MarketParams.from_query("brand=Renault&department=75&department=92")
    kwargs = params.core_kwargs()
    assert kwargs["brand"] == "Renault"
    assert kwargs["department"] == ["75", "92"]


# Garde de dérive : un filtre ajouté à `/v1/market` et oublié dans
# `MarketParams` serait ignoré en silence par les alertes.
def test_market_params_matches_the_route_signature():
    names = set(inspect.signature(market.get_market).parameters) - ROUTE_ONLY
    assert names == set(MarketParams.model_fields)


# Fait rougir `if name not in FIELDS: raise HTTPException(422, ...)`.
def test_an_unknown_parameter_is_a_422():
    try:
        MarketParams.from_query("kerosene=1")
        assert False, "aurait dû lever"
    except Exception as error:
        assert getattr(error, "status_code", None) == 422


# Fait rougir `sorted(value)` dans `to_query` : deux écritures du même filtre
# (ordre différent des départements) rendent la même chaîne canonique.
def test_to_query_is_canonical():
    a = MarketParams.from_query("department=92&department=75&brand=Renault")
    b = MarketParams.from_query("brand=Renault&department=75&department=92")
    assert a.to_query() == b.to_query()
    assert a.to_query() == "brand=Renault&department=75&department=92"


# Fait rougir la liste des colonnes de `market_items.ItemOut` : `/v1/market`
# ne rend toujours pas d'`id`, même si `market_query.core` le sélectionne
# désormais pour joindre les points de prix (`alert_rules.py`).
def test_the_market_route_still_does_not_render_an_id(client, key, session):
    session.add(Listing(site="lbc", site_id="1", first_seen=NOW, last_seen=NOW,
                        observations=1, brand="Renault", model="Clio"))
    session.commit()
    resp = client.get("/v1/market", headers=auth(key))
    assert resp.status_code == 200
    assert "id" not in resp.json()["items"][0]
