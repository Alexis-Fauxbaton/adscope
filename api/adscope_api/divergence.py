"""Le journal des écarts (lot Corpus, docs/roadmap.md § Lot Corpus) : ce
qu'un marchand a déclaré contre ce que le robot a vu, avec son délai et son
ampleur. Ne juge jamais — la page opérateur classe.

Singulier, voisin de `recheck.py` (qui pose la réclamation) et de
`divergences.py` (la route, pluriel — même convention que `follows.py`).
`on_observation` est l'unique aiguillage automated/humain du lot :
`observations.py` n'appelle jamais `recheck` directement.
"""

from datetime import datetime

from sqlalchemy import select

from . import recheck
from .corpus_models import Divergence, Recheck
from .models import PricePoint
from .spelling import fold

NOTABLE_PCT = 5
MILEAGE_TOLERANCE = 1000


def on_observation(session, listing, observation, license_, now) -> None:
    if license_ is None:
        return
    if license_.automated:
        _verify(session, listing, observation, now)
    else:
        recheck.mark(session, listing, observation, license_, now)


def _explained(session, claim, now) -> bool:
    """Un autre relevé s'est glissé entre la déclaration et le passage du
    robot : le prix a bougé deux fois, la déclaration n'est plus la
    référence. `is_distinct_from`, pas `!=` — la moitié de l'historique porte
    `license_key_hash` nul, et `NULL != 'abc'` rend NULL, donc faux."""
    return session.scalar(
        select(1).where(
            PricePoint.listing_id == claim.listing_id,
            PricePoint.observed_at > claim.observed_at,
            PricePoint.observed_at < now,
            PricePoint.confirmation.is_(False),
            PricePoint.license_key_hash.is_distinct_from(claim.license_key_hash),
        ).limit(1)
    ) is not None


def _write(session, claim, robot_value, now, delta_pct=None) -> None:
    session.add(Divergence(
        listing_id=claim.listing_id, license_key_hash=claim.license_key_hash,
        field=claim.field, merchant_value=claim.merchant_value, robot_value=robot_value,
        observed_at=claim.observed_at, verified_at=now,
        delay_seconds=int((now - claim.observed_at).total_seconds()), delta_pct=delta_pct,
    ))


def _price(session, claim, observation, now) -> None:
    if observation.price is None or _explained(session, claim, now):
        return
    merchant_price = int(claim.merchant_value)
    delta = (observation.price - merchant_price) * 100 / merchant_price
    if abs(delta) > NOTABLE_PCT:
        _write(session, claim, str(observation.price), now, round(delta, 2))


def _published(session, claim, observation, now) -> None:
    if observation.published_at is None:
        return
    seen = observation.published_at.date().isoformat()
    if seen != claim.merchant_value:
        _write(session, claim, seen, now)


def _vehicle(session, claim, listing, observation, now) -> None:
    """Compare l'observation du robot à ce que `listing` porte encore : le
    marqueur s'accroche juste après `_locked`, avant que l'observation en
    cours n'écrive quoi que ce soit — `listing.brand`/`model`/`year`/`mileage`
    tiennent donc toujours la dernière déclaration du marchand."""
    for field in ("brand", "model"):
        merchant, robot = getattr(listing, field), getattr(observation, field)
        if merchant is not None and robot is not None and fold(merchant) != fold(robot):
            _write(session, claim, f"{listing.brand} {listing.model}", now)
            return
    if (listing.year is not None and observation.year is not None
            and listing.year != observation.year):
        _write(session, claim, str(observation.year), now)
        return
    if listing.mileage is not None and observation.mileage is not None:
        if abs(observation.mileage - listing.mileage) > MILEAGE_TOLERANCE:
            _write(session, claim, str(observation.mileage), now)


def _bump(session, claim, observation, now) -> None:
    if observation.bumped_at is None:
        _write(session, claim, "aucune", now)
        return
    declared = datetime.fromisoformat(claim.merchant_value)
    if observation.bumped_at < declared:
        _write(session, claim, observation.bumped_at.isoformat(), now)


_HANDLERS = {"published": _published, "bump": _bump}


def _verify(session, listing, observation, now) -> None:
    """Recoupe chaque réclamation en attente, puis lève le marqueur en
    entier — sinon la fiche resterait au rang 0 pour toujours."""
    claims = session.scalars(select(Recheck).where(Recheck.listing_id == listing.id)).all()
    for claim in claims:
        if claim.field == "price":
            _price(session, claim, observation, now)
        elif claim.field == "vehicle":
            _vehicle(session, claim, listing, observation, now)
        elif claim.field in _HANDLERS:
            _HANDLERS[claim.field](session, claim, observation, now)
        # `unknown_listing`/`revived` : jamais ici — le robot trouve l'annonce,
        # donc le marchand disait vrai. `on_absence`, plus bas, tranche les
        # deux. `absence` non plus : `revival.apply` en est l'unique auteur,
        # sinon la même contradiction produirait deux lignes du journal.
    recheck.clear(session, listing.id)


def on_absence(session, listing, now) -> None:
    """Le robot vient de confirmer la disparition (verdict `recorded`,
    licence automated) : les réclamations qu'il contredit sont
    `unknown_listing` — le marchand disait l'avoir créée, le robot ne l'a
    jamais retrouvée — et `revived` — un marchand disait l'avoir revue en
    ligne, le robot la retrouve absente."""
    claims = session.scalars(
        select(Recheck).where(Recheck.listing_id == listing.id,
                              Recheck.field.in_(("unknown_listing", "revived")))
    ).all()
    for claim in claims:
        _write(session, claim, "absente", now)
    recheck.clear(session, listing.id)
