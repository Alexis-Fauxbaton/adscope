from datetime import datetime, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from adscope_api.models import Listing, PricePoint

NOW = datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)


def test_listing_roundtrip(session):
    session.add(Listing(site="lc", site_id="87103336930", first_seen=NOW, last_seen=NOW))
    session.commit()
    stored = session.query(Listing).one()
    assert stored.site_id == "87103336930"
    assert stored.observations == 0
    assert stored.disappeared_at is None


def test_site_and_site_id_are_unique_together(session):
    session.add(Listing(site="lc", site_id="1", first_seen=NOW, last_seen=NOW))
    session.commit()
    session.add(Listing(site="lc", site_id="1", first_seen=NOW, last_seen=NOW))
    with pytest.raises(IntegrityError):
        session.commit()


def test_same_site_id_on_another_site_is_allowed(session):
    session.add(Listing(site="lc", site_id="1", first_seen=NOW, last_seen=NOW))
    session.add(Listing(site="lbc", site_id="1", first_seen=NOW, last_seen=NOW))
    session.commit()
    assert session.query(Listing).count() == 2


def test_price_points_are_ordered_by_observation(session):
    listing = Listing(site="lc", site_id="1", first_seen=NOW, last_seen=NOW)
    session.add(listing)
    session.flush()
    session.add_all([
        PricePoint(listing_id=listing.id, observed_at=NOW, price=9900, source="user"),
        PricePoint(listing_id=listing.id, observed_at=NOW.replace(day=1), price=10900,
                   source="crawler"),
    ])
    session.commit()
    session.refresh(listing)
    assert [p.price for p in listing.prices] == [10900, 9900]
