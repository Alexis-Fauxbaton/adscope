"""Mesure d'usage : combien de pages par jour, et pendant combien de jours.

Deux questions, une table. Le compteur est incrémenté à chaque observation
reçue — pas aux seuls changements de prix, qui ne mesuraient que le marché.
"""

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from .models import License, UsageDay


def bump(session, license_, listing_id, day) -> None:
    """Une observation de plus pour cette licence, ce jour, cette annonce."""
    if license_ is None:
        return
    row = insert(UsageDay).values(
        license_key_hash=license_.key_hash, day=day, listing_id=listing_id,
        observations=1,
    )
    session.execute(row.on_conflict_do_update(
        index_elements=["license_key_hash", "day", "listing_id"],
        set_={"observations": UsageDay.observations + 1},
    ))


def by_day(session, since=None) -> list[dict]:
    """Par licence et par jour : annonces distinctes et pages vues.

    Les licences automatiques sont écartées ici plutôt qu'à l'écriture : leur
    volume reste consultable, mais il ne se mêle pas à l'usage humain — un
    crawler local produit à lui seul plus de lignes que tous les utilisateurs.
    """
    query = (
        select(
            UsageDay.license_key_hash,
            License.label,
            UsageDay.day,
            func.count().label("listings"),
            func.sum(UsageDay.observations).label("observations"),
        )
        .join(License, License.key_hash == UsageDay.license_key_hash)
        .where(License.automated.is_(False))
        .group_by(UsageDay.license_key_hash, License.label, UsageDay.day)
        .order_by(UsageDay.day, License.label)
    )
    if since is not None:
        query = query.where(UsageDay.day >= since)
    return [
        {"license_key_hash": key, "label": label, "day": day,
         "listings": listings, "observations": int(observations)}
        for key, label, day, listings, observations in session.execute(query)
    ]
