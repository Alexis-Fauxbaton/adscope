from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from .fingerprint import fingerprint
from .models import Listing, PricePoint
from .schemas import ObservationIn

FINGERPRINT_FIELDS = ("brand", "model", "version", "year", "mileage")
VEHICLE_FIELDS = FINGERPRINT_FIELDS + ("postal_code", "seller_type")


def record(session, observation: ObservationIn, source: str, now=None) -> Listing:
    if now is None:
        now = datetime.now(timezone.utc)

    listing = session.scalar(
        select(Listing).where(
            Listing.site == observation.site, Listing.site_id == observation.site_id
        )
    )
    if listing is None:
        listing = Listing(
            site=observation.site, site_id=observation.site_id,
            first_seen=now, last_seen=now, observations=0,
        )
        session.add(listing)

    for field in VEHICLE_FIELDS:
        value = getattr(observation, field)
        if value is not None:
            setattr(listing, field, value)

    details = [getattr(listing, field) for field in FINGERPRINT_FIELDS]
    if any(value is not None for value in details):
        listing.fingerprint = fingerprint(*details)

    listing.last_seen = max(listing.last_seen, now)
    listing.observations += 1
    listing.disappeared_at = None

    # Un horodatage exact fait autorité ; les bornes inférées ne servent
    # qu'aux sites qui ne donnent qu'un libellé relatif.
    if observation.published_at is not None:
        listing.published_at = (
            observation.published_at
            if listing.published_at is None
            else min(listing.published_at, observation.published_at)
        )
    if observation.bumped_at is not None:
        listing.bumped_at = (
            observation.bumped_at
            if listing.bumped_at is None
            else max(listing.bumped_at, observation.bumped_at)
        )

    if observation.published_days_ago is not None:
        published = (now - timedelta(days=observation.published_days_ago)).date()
        first = listing.site_published_first
        last = listing.site_published_last
        listing.site_published_first = published if first is None else min(first, published)
        if observation.published_precision == "day":
            listing.site_published_last = published if last is None else max(last, published)

    if observation.price is not None:
        session.flush()
        latest = session.scalar(
            select(PricePoint)
            .where(PricePoint.listing_id == listing.id)
            .order_by(PricePoint.observed_at.desc(), PricePoint.id.desc())
            .limit(1)
        )
        if latest is None or latest.price != observation.price:
            session.add(PricePoint(
                listing_id=listing.id, observed_at=now,
                price=observation.price, source=source,
            ))

    return listing
