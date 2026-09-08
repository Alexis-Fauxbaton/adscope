from datetime import datetime, timedelta, timezone

from adscope_api.comparables import comparables_for
from adscope_api.models import Listing, PricePoint
from conftest import auth

NOW = datetime(2026, 9, 8, 12, 0, tzinfo=timezone.utc)

# Vingt comparables serrés : (q3 − q1) / médiane vaut 0,048, très en dessous du
# seuil. Les quinze premiers en font le plus petit segment jugeable.
TIGHT = list(range(20000, 22000, 100))
# Le même modèle, la même année, de 5 000 à 24 000 € : ce qu'est vraiment une
# Clio 2005 en base, et ce que le seuil de dispersion doit retenir.
WIDE = list(range(5000, 25000, 1000))
# Dispersion exactement de 30 % : q1 17 000, médiane 20 000, q3 23 000.
BORDERLINE = [17000] * 5 + [20000] * 5 + [23000] * 5 + [25000] * 5


def car(session, site_id, prices, brand="Renault", model="Clio", year=2015,
        version=None, site="lbc"):
    row = Listing(site=site, site_id=site_id, first_seen=NOW, last_seen=NOW,
                  observations=1, brand=brand, model=model, year=year,
                  version=version)
    row.prices = [
        PricePoint(observed_at=NOW - timedelta(days=len(prices) - rank),
                   price=price, source="user")
        for rank, price in enumerate(prices)
    ]
    session.add(row)
    session.flush()
    return row


def segment(session, prices, prefix="c", **kw):
    for rank, price in enumerate(prices):
        car(session, f"{prefix}{rank}", [price], **kw)


def test_the_segment_is_brand_model_and_year(session):
    segment(session, TIGHT)
    out = comparables_for(session, car(session, "mine", [21000]))
    assert out["segment"] == {"brand": "Renault", "model": "Clio", "year": 2015,
                              "version": None}
    assert (out["count"], out["min"], out["max"]) == (20, 20000, 21900)
    assert (out["q1"], out["median"], out["q3"]) == (20400, 20900, 21400)
    assert (out["dispersion"], out["percentile"]) == (0.05, 55)
    assert (out["comparable"], out["reason"]) == (True, None)


def test_another_year_another_model_another_brand_are_not_comparables(session):
    segment(session, TIGHT)
    segment(session, TIGHT, prefix="y", year=2016)
    segment(session, TIGHT, prefix="m", model="Megane")
    segment(session, TIGHT, prefix="b", brand="Dacia")
    assert comparables_for(session, car(session, "mine", [21000]))["count"] == 20


# L'annonce ouverte n'est pas son propre marché : comptée dedans, elle tirerait
# la médiane vers son propre prix et son rang vers le milieu.
def test_the_listing_is_not_its_own_comparable(session):
    segment(session, TIGHT[:15])
    assert comparables_for(session, car(session, "mine", [21000]))["count"] == 15


# Une annonce suivie depuis six mois pèse autant que celle vue hier : un prix
# par annonce, jamais un par relevé.
def test_a_listing_weighs_once_whatever_its_price_history(session):
    car(session, "old", [30000, 25000, 21000])
    assert comparables_for(session, car(session, "mine", [21000]))["count"] == 1


# Le segment est le marché, pas le catalogue d'un site : la même voiture au
# même âge vaut la même chose, quel que soit l'endroit où elle est proposée.
def test_the_market_does_not_stop_at_the_site(session):
    segment(session, TIGHT[:15])
    car(session, "ailleurs", [21000], site="lc")
    assert comparables_for(session, car(session, "mine", [21000]))["count"] == 16


def test_the_price_of_a_comparable_is_its_last_one(session):
    segment(session, TIGHT[:15])
    car(session, "dropped", [90000, 20000])
    out = comparables_for(session, car(session, "mine", [21000]))
    assert out["max"] == 21400


def test_the_listing_is_placed_by_its_own_last_price(session):
    segment(session, TIGHT[:15])
    mine = car(session, "mine", [30000, 20000])
    assert comparables_for(session, mine)["percentile"] == 7


# La version affine tant qu'il reste de quoi juger : seize comparables la
# gardent, et les autres finitions sortent du segment.
def test_the_version_refines_the_segment_when_it_holds(session):
    segment(session, TIGHT[:16], prefix="v", version="1.5 dCi 90")
    segment(session, [5000] * 5, prefix="o", version="2.0 RS")
    out = comparables_for(session, car(session, "mine", [21000], version="1.5 dCi 90"))
    assert out["segment"]["version"] == "1.5 dCi 90"
    assert out["count"] == 16


# En dessous de quinze la version coûte plus qu'elle ne précise : le segment
# recule sur marque + modèle + année, et le dit en ne se nommant pas.
def test_the_version_gives_way_below_fifteen(session):
    segment(session, [21000] * 5, prefix="v", version="1.5 dCi 90")
    segment(session, TIGHT, prefix="o")
    out = comparables_for(session, car(session, "mine", [21000], version="1.5 dCi 90"))
    assert out["segment"]["version"] is None
    assert out["count"] == 25


def test_a_segment_under_fifteen_is_not_comparable(session):
    segment(session, TIGHT[:14])
    out = comparables_for(session, car(session, "mine", [21000]))
    assert (out["comparable"], out["reason"]) == (False, "too_few")
    assert out["percentile"] is None


# Trop mince pour être jugé, assez pour être montré : les bornes restent
# servies tant que `percentile_disc` ne se contente pas de recopier des prix.
def test_the_bounds_survive_a_segment_too_small(session):
    segment(session, [10000, 11000, 12000, 13000])
    out = comparables_for(session, car(session, "mine", [21000]))
    assert (out["min"], out["q1"], out["median"], out["q3"], out["max"]) == (
        10000, 10000, 11000, 12000, 13000)
    assert out["reason"] == "too_few"


def test_under_four_comparables_no_bound_is_served(session):
    segment(session, [10000, 11000, 12000])
    out = comparables_for(session, car(session, "mine", [21000]))
    assert (out["count"], out["median"], out["dispersion"]) == (3, None, None)
    assert out["min"] is None and out["max"] is None


# Une Clio 2005 va de 5 000 à 24 000 € : l'année seule ne dit plus rien de
# l'état de la voiture, et on refuse de faire semblant.
def test_a_scattered_segment_is_not_comparable(session):
    segment(session, WIDE)
    out = comparables_for(session, car(session, "mine", [21000]))
    assert (out["comparable"], out["reason"]) == (False, "too_dispersed")
    assert (out["dispersion"], out["percentile"]) == (0.71, None)
    assert (out["median"], out["min"]) == (14000, 5000)


def test_a_dispersion_of_exactly_thirty_percent_still_holds(session):
    segment(session, BORDERLINE)
    out = comparables_for(session, car(session, "mine", [21000]))
    assert out["dispersion"] == 0.3
    assert (out["comparable"], out["reason"]) == (True, None)


def test_a_car_missing_brand_model_or_year_has_no_segment(session):
    segment(session, TIGHT)
    for site_id, missing in (("a", "brand"), ("b", "model"), ("c", "year")):
        out = comparables_for(session, car(session, site_id, [21000], **{missing: None}))
        assert (out["comparable"], out["reason"]) == (False, "no_segment")
        assert (out["count"], out["median"], out["percentile"]) == (0, None, None)
        assert out["segment"][missing] is None


def test_cheaper_than_all_of_them_sits_at_zero(session):
    segment(session, TIGHT[:15])
    assert comparables_for(session, car(session, "mine", [15000]))["percentile"] == 0


def test_dearer_than_all_of_them_sits_at_hundred(session):
    segment(session, TIGHT[:15])
    assert comparables_for(session, car(session, "mine", [30000]))["percentile"] == 100


def test_the_route_serves_the_segment(client, session, key):
    segment(session, TIGHT)
    car(session, "mine", [21000])
    session.commit()
    r = client.get("/v1/listings/lbc/mine/comparables", headers=auth(key))
    assert r.status_code == 200
    assert r.json()["median"] == 20900
    assert r.json()["percentile"] == 55


def test_the_route_404s_on_an_unknown_listing(client, key):
    r = client.get("/v1/listings/lbc/inconnue/comparables", headers=auth(key))
    assert r.status_code == 404


def test_the_route_requires_a_license(client):
    assert client.get("/v1/listings/lbc/mine/comparables").status_code == 401
