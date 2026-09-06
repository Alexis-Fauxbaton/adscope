from datetime import datetime, timedelta, timezone

from adscope_api.models import Listing, PricePoint
from adscope_api.sellers import stats_for

NOW = datetime(2026, 9, 6, 12, 0, tzinfo=timezone.utc)


def days(n):
    return NOW - timedelta(days=n)


def listing(session, site_id, published=10, seen=0, seller="76697703",
            name="CVD AUTOMOBILES", site="lbc", prices=()):
    row = Listing(
        site=site, site_id=site_id, first_seen=days(published), last_seen=days(seen),
        observations=1, seller_type="pro" if seller else "private",
        seller_id=seller, seller_name=name if seller else None,
        published_at=days(published),
    )
    row.prices = [
        PricePoint(observed_at=days(at), price=price, source="user")
        for at, price in prices
    ]
    session.add(row)
    session.flush()
    return row


def stats(session, seller="76697703", site="lbc"):
    return stats_for(session, site, seller, now=NOW)


def test_an_unknown_seller_has_no_statistics(session):
    assert stats(session) is None


def test_only_the_listings_of_that_seller_on_that_site_are_counted(session):
    listing(session, "1")
    listing(session, "2")
    listing(session, "3", seller="50089601", name="THYSSEN")
    listing(session, "4", site="lc")
    assert stats(session)["listings"] == 2


def test_the_trade_name_is_the_one_of_the_last_seen_listing(session):
    listing(session, "1", seen=9, name="CVD")
    listing(session, "2", seen=1, name="CVD AUTOMOBILES")
    assert stats(session)["seller_name"] == "CVD AUTOMOBILES"


# Un mois, la borne où l'affichage cesse de compter en jours (§ 10 quinquies).
def test_the_share_over_a_month_uses_the_same_threshold_as_the_badge(session):
    listing(session, "1", published=31)
    listing(session, "2", published=30)
    listing(session, "3", published=200)
    s = stats(session)
    assert (s["over_a_month"], s["over_a_month_share"]) == (2, 0.667)


def test_the_median_age_is_the_median_of_the_known_ages(session):
    for i, age in enumerate([5, 47, 300]):
        listing(session, str(i), published=age)
    assert stats(session)["median_age_days"] == 47


# Une annonce dont on ne connaît pas la date de publication ne fausse pas la
# médiane : elle sort de la population, et le compte le dit.
def test_a_listing_without_a_publication_date_leaves_the_median_alone(session):
    listing(session, "1", published=47)
    row = listing(session, "2")
    row.published_at = None
    assert stats(session)["median_age_days"] == 47
    assert (stats(session)["listings"], stats(session)["aged"]) == (2, 1)


# Sur un vendeur suivi deux jours, l'écart entre la première et la dernière
# observation ne mesurerait que notre propre fenêtre : le délai se compte donc
# depuis la publication — « ses annonces baissent au bout de N jours ».
def test_the_average_drop_is_taken_on_the_listings_that_dropped(session):
    listing(session, "1", published=60, prices=((2, 10000), (1, 9000)))
    listing(session, "2", published=40, prices=((2, 20000), (1, 19000)))
    listing(session, "3", published=10, prices=((2, 9000),))
    s = stats(session)
    assert s["price_drop_listings"] == 2
    assert s["price_changed_listings"] == 2
    assert s["price_drop_rate"] == -0.075
    assert s["price_drop_after_days"] == 49


def test_a_price_that_went_up_is_a_change_but_not_a_drop(session):
    listing(session, "1", published=60, prices=((2, 9000), (1, 9500)))
    s = stats(session)
    assert (s["price_changed_listings"], s["price_drop_listings"]) == (1, 0)
    assert s["price_drop_rate"] is None
    assert s["price_drop_after_days"] is None


# Une annonce revue par le premier et le dernier prix, pas point à point : un
# aller-retour 10 000 → 11 000 → 9 000 est une baisse de 10 %.
def test_the_drop_is_read_between_the_first_and_the_last_price(session):
    listing(session, "1", published=60, prices=((3, 10000), (2, 11000), (1, 9000)))
    assert stats(session)["price_drop_rate"] == -0.1


# Le stock en ligne, pas l'archive : une annonce que personne n'a revue depuis
# un mois a de fortes chances d'être partie — la durée de vie d'une annonce
# leboncoin est de soixante jours.
def test_a_listing_not_seen_for_a_month_leaves_the_population(session):
    listing(session, "1", published=100, seen=40)
    listing(session, "2", published=10, seen=1)
    assert stats(session)["listings"] == 1
