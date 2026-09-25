"""Le marqueur « à vérifier » — ce qu'un marchand a déclaré, en attendant que
le robot recoupe (lot Corpus, docs/roadmap.md § Lot Corpus).

Singulier : la mécanique. `divergence.py`, voisin et lui aussi au singulier,
décide *qui* appelle `mark` (une licence non automated) et *qui* vérifie (une
licence automated) — l'aiguillage n'est pas ici. Le sens des imports est
`recheck` → `revisit.ADDRESS`, jamais l'inverse : `revisit._marked` lit
`corpus_models.Recheck` directement, sans passer par ce module.
"""

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from .corpus_models import Recheck
from .models import PricePoint
from .revisit import ADDRESS

# Marque, modèle, année, kilométrage — la version n'y figure pas : c'est ce
# que compare le champ `vehicle` du journal (`divergence.py`).
VEHICLE_CLAIM_FIELDS = ("brand", "model", "year", "mileage")


def _claim(session, listing, field, license_, value, now) -> None:
    """Pose une réclamation, ou remplace la précédente de la même clé : c'est
    sa dernière déclaration qui sera jugée."""
    row = insert(Recheck).values(
        listing_id=listing.id, field=field, license_key_hash=license_.key_hash,
        merchant_value=value, observed_at=now,
    )
    session.execute(row.on_conflict_do_update(
        index_elements=["listing_id", "field", "license_key_hash"],
        set_={"merchant_value": value, "observed_at": now},
    ))


def mark(session, listing, observation, license_, now) -> None:
    """Ce qu'un marchand vient de déclarer, une ligne par réclamation.

    N'écrit rien pour un site absent de `revisit.ADDRESS` : une annonce
    marquée dont la file ne sert jamais le site ne serait jamais recoupée, et
    `rechecks` grossirait sans fin.
    """
    if observation.site not in ADDRESS:
        return
    claimed = False
    if listing.observations == 0:
        _claim(session, listing, "unknown_listing", license_, "créée", now)
        claimed = True
    if observation.price is not None:
        latest = session.scalar(
            select(PricePoint).where(PricePoint.listing_id == listing.id)
            .order_by(PricePoint.observed_at.desc(), PricePoint.id.desc()).limit(1)
        )
        if latest is None or latest.price != observation.price:
            _claim(session, listing, "price", license_, str(observation.price), now)
            claimed = True
    if (observation.published_at is not None and listing.published_at is not None
            and observation.published_at.date() != listing.published_at.date()):
        _claim(session, listing, "published", license_,
              observation.published_at.date().isoformat(), now)
        claimed = True
    if observation.bumped_at is not None and (
        listing.bumped_at is None or observation.bumped_at > listing.bumped_at
    ):
        _claim(session, listing, "bump", license_, observation.bumped_at.isoformat(), now)
        claimed = True
    # (f) : jamais seule — sans une autre réclamation, le robot n'aurait rien
    # d'autre à comparer que le véhicule lui-même.
    if claimed and any(getattr(observation, f) is not None for f in VEHICLE_CLAIM_FIELDS):
        brand = observation.brand or listing.brand
        model = observation.model or listing.model
        year = observation.year or listing.year
        mileage = observation.mileage or listing.mileage
        _claim(session, listing, "vehicle", license_,
              f"{brand} {model} {year} · {mileage} km"[:64], now)


def mark_absence(session, listing, license_, evidence, now) -> None:
    """Une absence déclarée par un marchand : la fiche est marquée, quel que
    soit le verdict de `disappearance.observe` — le robot ira voir."""
    if listing.site not in ADDRESS:
        return
    _claim(session, listing, "absence", license_, evidence, now)


def mark_revival(session, listing, license_, now) -> None:
    """Une résurrection déclarée par un marchand (`revival.apply`) : elle sera
    jugée comme les autres réclamations, au prochain passage du robot — sinon
    un marchand pourrait ressusciter en boucle l'annonce d'un concurrent."""
    if listing.site not in ADDRESS:
        return
    _claim(session, listing, "revived", license_, "revenue", now)


def clear(session, listing_id) -> None:
    """Lève le marqueur en entier : une observation automated a tranché."""
    session.execute(delete(Recheck).where(Recheck.listing_id == listing_id))
