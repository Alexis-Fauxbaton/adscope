"""Statistiques d'un vendeur professionnel.

Ce que le marchand ne montre pas de lui-même : combien d'annonces il tient en
ligne, depuis combien de temps, et de combien il finit par baisser. Tout se
déduit de ses propres annonces, publiées volontairement — il ne peut pas le
masquer.

Les définitions comptent autant que les nombres, chacune est justifiée ici.
"""

from datetime import datetime, timedelta, timezone
from statistics import median

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from .models import Listing

# La population : le stock en ligne, pas l'archive. Une annonce leboncoin vit
# soixante jours ; celle que personne n'a revue depuis un mois a de fortes
# chances d'être partie, et la compter gonflerait le stock du marchand.
ONLINE_WINDOW_DAYS = 30

# Le seuil de l'affichage (§ 10 quinquies) : la borne où le libellé cesse de
# compter en jours et dit « 1 mois ». Un seul seuil dans tout le produit.
OLD_MIN_DAYS = 31


def age_days(listing, now) -> int | None:
    """Ancienneté réelle : l'horodatage exact d'abord, la borne inférée ensuite."""
    if listing.published_at is not None:
        return (now - listing.published_at).days
    if listing.site_published_first is not None:
        return (now.date() - listing.site_published_first).days
    return None


def _drop(listing) -> float | None:
    """Baisse relative entre le premier et le dernier prix connus.

    Premier contre dernier, pas point à point : un aller-retour reste jugé sur
    son résultat. Une hausse rend une valeur positive, écartée plus loin.
    """
    points = listing.prices
    if len(points) < 2 or not points[0].price:
        return None
    return (points[-1].price - points[0].price) / points[0].price


def stats_for(session, site: str, seller_id: str, now=None) -> dict | None:
    if now is None:
        now = datetime.now(timezone.utc)
    listings = session.scalars(
        select(Listing)
        .where(
            Listing.site == site,
            Listing.seller_id == seller_id,
            Listing.disappeared_at.is_(None),
            Listing.last_seen >= now - timedelta(days=ONLINE_WINDOW_DAYS),
        )
        .options(selectinload(Listing.prices))
        .order_by(Listing.last_seen)
    ).all()
    if not listings:
        return None

    ages = [(l, age_days(l, now)) for l in listings]
    known = [days for _, days in ages if days is not None]
    old = [days for days in known if days >= OLD_MIN_DAYS]

    changes = [(l, _drop(l)) for l in listings]
    changed = [(l, rate) for l, rate in changes if rate is not None]
    dropped = [(l, rate) for l, rate in changed if rate < 0]
    # Le délai se compte depuis la publication, pas depuis notre première
    # observation : la base ne suit ces annonces que depuis quelques jours,
    # tandis qu'elles sont en ligne depuis des mois. Mesuré sur notre fenêtre,
    # le délai ne dirait que la durée du suivi ; mesuré depuis la publication,
    # il dit « ses annonces baissent au bout de N jours en ligne ».
    delays = [
        (l.prices[-1].observed_at - l.published_at).days
        for l, _ in dropped
        if l.published_at is not None
    ]

    return {
        "site": site,
        "seller_id": seller_id,
        "seller_name": next(
            (l.seller_name for l in reversed(listings) if l.seller_name), None
        ),
        "listings": len(listings),
        # La part se rapporte aux annonces dont l'ancienneté est connue : une
        # annonce sans date de publication n'est ni jeune ni vieille.
        "aged": len(known),
        "over_a_month": len(old),
        "over_a_month_share": round(len(old) / len(known), 3) if known else None,
        "median_age_days": round(median(known)) if known else None,
        # Deux populations distinctes : celles dont le prix a bougé sous nos
        # yeux, et parmi elles celles qui ont baissé. La moyenne ne porte que
        # sur les secondes — mêlées aux hausses, elle ne dirait plus « il
        # baisse », mais « son catalogue bouge ».
        "price_changed_listings": len(changed),
        "price_drop_listings": len(dropped),
        "price_drop_rate": (
            round(sum(rate for _, rate in dropped) / len(dropped), 4) if dropped else None
        ),
        "price_drop_after_days": round(median(delays)) if delays else None,
    }
