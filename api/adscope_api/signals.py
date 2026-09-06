from datetime import datetime, timezone

from .models import Listing

REPUBLICATION_THRESHOLD_DAYS = 7

# En dessous, republier et réindexer à quelques heures d'écart est le
# fonctionnement normal d'un site, pas une remontée.
BUMP_MIN_DAYS = 1


def utc(moment):
    """Ramène un horodatage à UTC avant toute soustraction.

    Deux dates tirées de la même base portent le même fuseau, et Python
    soustrait alors les heures murales sans consulter le décalage : à la
    bascule de l'heure d'été l'écart perd une heure, et `.days` un jour entier.
    """
    return moment.astimezone(timezone.utc)


def signals_for(listing: Listing, now=None) -> dict:
    if now is None:
        now = datetime.now(timezone.utc)
    points = listing.prices

    out = {
        "site": listing.site,
        "site_id": listing.site_id,
        "fingerprint": listing.fingerprint,
        "first_seen": listing.first_seen,
        "last_seen": listing.last_seen,
        "observations": listing.observations,
        "tracked_days": (now - listing.first_seen).days,
        "seller_type": listing.seller_type,
        "site_published_first": listing.site_published_first,
        "published_at": listing.published_at,
        "bumped_at": listing.bumped_at,
        "real_age_days": None,
        "age_source": None,
        "republished": False,
        "republished_at": None,
        "price": None,
        "price_history": [],
        "price_delta_since_first": None,
        "price_delta_days_since_first": None,
        "stable_days": None,
        "price_checks": None,
        "price_gap_days": None,
    }

    # Un horodatage exact rend la republication observée plutôt que déduite :
    # ni seuil de tolérance, ni faux positif possible.
    if listing.published_at is not None:
        out["age_source"] = "exact"
        out["real_age_days"] = (now - listing.published_at).days
        bumped = listing.bumped_at
        if bumped is not None and (
            utc(bumped) - utc(listing.published_at)
        ).days >= BUMP_MIN_DAYS:
            out["republished"] = True
            out["republished_at"] = bumped.date()
    else:
        first, last = listing.site_published_first, listing.site_published_last
        if first is not None:
            out["age_source"] = "inferred"
            out["real_age_days"] = (now.date() - first).days
            if last is not None and (last - first).days > REPUBLICATION_THRESHOLD_DAYS:
                out["republished"] = True
                out["republished_at"] = last

    if points:
        # Les changements seuls portent la variation : une confirmation dit que
        # le prix n'a pas bougé, la compter reviendrait à mesurer une baisse de
        # zéro et à faire repartir « stable depuis » chaque semaine.
        changes = [p for p in points if not p.confirmation] or points
        last = changes[-1]
        checks = points[points.index(last) + 1:]

        out["price"] = points[-1].price
        out["price_history"] = [
            {"at": p.observed_at, "price": p.price, "confirmation": p.confirmation}
            for p in points
        ]
        out["stable_days"] = (now - last.observed_at).days
        out["price_checks"] = len(checks)
        # Le plus long intervalle sans regarder le prix depuis ce changement,
        # la période courante comprise. C'est lui qui sépare un prix stable
        # vérifié chaque semaine d'un prix que personne n'a revu depuis deux
        # mois : dans ce trou, il a pu bouger et revenir sans témoin.
        moments = [
            utc(last.observed_at), *(utc(p.observed_at) for p in checks), utc(now),
        ]
        out["price_gap_days"] = max(
            (b - a).days for a, b in zip(moments, moments[1:])
        )
        if len(changes) > 1:
            out["price_delta_since_first"] = last.price - changes[0].price
            out["price_delta_days_since_first"] = (now - changes[0].observed_at).days

    return out
