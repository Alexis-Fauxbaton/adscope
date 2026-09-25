"""Qui compte comme une voix pour une disparition, et ce qu'elle a le droit
de voir ou de faire taire. Seul module du dépôt qui décide ce qu'est « un
compte » pour cette règle (`.superpowers/disparition-plan.md` §3) :
`disappearance.py`, `market_query.py`, `alert_rules.py` et `revival.py` lui
délèguent la question plutôt que de la refaire chacun à sa façon.
"""

from sqlalchemy import delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert

from .absence_models import AbsenceReport
from .models import Listing

# La licence nulle : le crawler d'avant la colonne `automated`, qui fait foi
# aussi (`alert_rules.py`, « licence nulle = le crawler d'avant la colonne »).
LEGACY = "robot:legacy"


def actor_of(license_) -> str:
    """Une voix. Trois cas, dans cet ordre — et l'ordre est la règle :
    `automated` d'abord, avant le compte. Sans lui, le crawler d'Alexis
    rattaché à son propre compte (`auth.of_account` le permet) fusionnerait
    avec sa clé d'extension : une seule voix, plus aucune disparition ferme
    ne s'écrirait jamais. Le compte ensuite : deux clés d'un même compte sont
    la même voix. La clé enfin : une clé sans compte compte pour elle-même.
    """
    if license_ is None:
        return LEGACY
    if license_.automated or license_.account_id is None:
        return f"key:{license_.key_hash}"
    return f"acct:{license_.account_id}"


def report(session, listing, license_, evidence, now) -> int:
    """Enregistre la constatation de cet acteur ; rend le nombre d'acteurs
    distincts sur l'annonce. `first_at` ne bouge jamais après sa pose — c'est
    la date que `disappeared_at`/`probably_gone_at` porteront."""
    row = insert(AbsenceReport).values(
        listing_id=listing.id, actor=actor_of(license_),
        license_key_hash=license_.key_hash if license_ is not None else None,
        automated=license_ is None or license_.automated,
        evidence=evidence, first_at=now, last_at=now,
    )
    session.execute(row.on_conflict_do_update(
        index_elements=["listing_id", "actor"], set_={"last_at": now},
    ))
    return count_actors(session, listing.id)


def count_actors(session, listing_id) -> int:
    return session.scalar(
        select(func.count()).where(AbsenceReport.listing_id == listing_id)
    )


def reports_of(session, listing_id) -> list[AbsenceReport]:
    return session.scalars(
        select(AbsenceReport).where(AbsenceReport.listing_id == listing_id)
    ).all()


def clear(session, listing_id) -> None:
    session.execute(delete(AbsenceReport).where(AbsenceReport.listing_id == listing_id))


def visible(license_):
    """Ce qu'une licence a le droit de voir sur le marché : jamais une
    ferme, jamais une probable qu'elle a elle-même déclarée."""
    mine = (
        select(1)
        .where(AbsenceReport.listing_id == Listing.id, AbsenceReport.actor == actor_of(license_))
        .exists()
    )
    return (Listing.disappeared_at.is_(None), or_(Listing.probably_gone_at.is_(None), ~mine))


def quiet_for(license_):
    """Ce sur quoi on n'alerte pas ce compte : ce qu'il a constaté absent, et
    ce que le robot a constaté absent — lui fait foi pour tout le monde."""
    hush = (
        select(1)
        .where(
            AbsenceReport.listing_id == Listing.id,
            or_(AbsenceReport.actor == actor_of(license_), AbsenceReport.automated.is_(True)),
        )
        .exists()
    )
    return (~hush,)
