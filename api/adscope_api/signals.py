from datetime import datetime, timezone

from .models import Listing

REPUBLICATION_THRESHOLD_DAYS = 7


def signals_for(session, listing: Listing, now=None) -> dict:
    now = now or datetime.now(timezone.utc)
    points = sorted(listing.prices, key=lambda p: p.observed_at)

    out = {
        "site": listing.site,
        "site_id": listing.site_id,
        "fingerprint": listing.fingerprint,
        "first_seen": listing.first_seen,
        "last_seen": listing.last_seen,
        "observations": listing.observations,
        "tracked_days": (now - listing.first_seen).days,
        "site_published_first": listing.site_published_first,
        "real_age_days": None,
        "republished": False,
        "republished_at": None,
        "price": None,
        "price_history": [],
        "price_delta": None,
        "price_delta_days": None,
        "stable_days": None,
    }

    first, last = listing.site_published_first, listing.site_published_last
    if first is not None:
        out["real_age_days"] = (now.date() - first).days
        if last is not None and (last - first).days > REPUBLICATION_THRESHOLD_DAYS:
            out["republished"] = True
            out["republished_at"] = last

    if points:
        out["price"] = points[-1].price
        out["price_history"] = [{"at": p.observed_at, "price": p.price} for p in points]
        out["stable_days"] = (now - points[-1].observed_at).days
        if len(points) > 1:
            out["price_delta"] = points[-1].price - points[0].price
            out["price_delta_days"] = (now - points[0].observed_at).days

    return out
