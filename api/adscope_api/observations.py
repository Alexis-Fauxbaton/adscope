"""Ce qu'une observation apprend sur une annonce, écrit sous verrou.

Chaque valeur se calcule ici en Python sur ce qu'on vient de lire. Sans verrou,
l'intervalle entre la lecture et l'écriture appartient à qui passe en même
temps : dix marchands simultanés faisaient monter le compteur de 1 à 2, et la
borne basse se perdait dix fois sur douze. `_locked` ferme cet intervalle.

Les invariants tenus ici : `site_published_first` ne recule jamais — la
détection de republication en dépend tout entière ; `site_published_last` et
`bumped_at` n'avancent jamais à rebours ; `published_at` ne recule jamais ;
`observations` compte toutes les observations reçues ; un point de prix par
changement réel, un par jour sans changement. Les colonnes canoniques
(`taxonomy.derive`) suivent, dérivées, ne faisant jamais foi."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from .fingerprint import fingerprint
from .models import Listing, PricePoint
from .intake import ObservationIn
from . import publication
from .model_vocabulary import CACHE
from .taxonomy import derive
from .usage import bump

FINGERPRINT_FIELDS = ("brand", "model", "version", "year", "mileage")
# `fuel`, `gearbox`, `department` suivent la même règle que `postal_code` :
# écrits quand l'observation les porte, jamais effacés par une observation
# muette sur eux. Hors empreinte véhicule (`shared/fingerprint.md`).
VEHICLE_FIELDS = FINGERPRINT_FIELDS + (
    "postal_code", "seller_type", "fuel", "gearbox", "department",
)

# Un point au changement seulement laissait entre deux points un intervalle
# qu'aucune relecture ne peut combler : entre le 1er juillet à 10 900 € et le
# 27 août à 9 900 €, le prix a pu descendre et remonter sans témoin. L'annonce
# revue un jour qui n'a pas encore son point en produit un — inchangé, mais
# daté. Le jour est calendaire et compté en UTC : un délai de vingt-quatre
# heures raterait un jour sur deux d'un relevé avancé de cinq minutes, et le
# fuseau local déplacerait la frontière deux fois l'an. `signals.thinned`
# éclaircit à la sortie ce que la lecture n'a pas à voir si fin.
def _utc_day(moment):
    return moment.astimezone(timezone.utc).date()


def _locked(session, observation, now) -> Listing:
    """L'annonce, verrouillée jusqu'à la fin de la transaction.

    Le verrou porte sur une ligne, jamais sur la table : deux marchands qui
    observent deux annonces différentes ne s'attendent pas. Et il se tient pour
    toute la suite — c'est lui, et non l'ordre des instructions, qui rend justes
    le compteur, les bornes et la lecture du dernier prix.

    L'annonce inconnue s'insère avec `ON CONFLICT DO NOTHING`. Deux marchands
    ouvrant la même annonce neuve au même instant, c'est le scénario même de la
    mutualisation, et il rendait 500 : neuf erreurs sur dix créations
    simultanées. Qui perd la course attend, puis verrouille la ligne écrite."""
    held = (
        select(Listing)
        .where(Listing.site == observation.site, Listing.site_id == observation.site_id)
        .with_for_update()
    )
    listing = session.scalar(held)
    if listing is None:
        session.execute(
            insert(Listing)
            .values(site=observation.site, site_id=observation.site_id,
                    first_seen=now, last_seen=now, observations=0)
            .on_conflict_do_nothing(index_elements=["site", "site_id"])
        )
        listing = session.scalar(held)
    return listing


def record(session, observation: ObservationIn, source: str, license_=None,
           now=None) -> Listing:
    if now is None:
        now = datetime.now(timezone.utc)

    listing = _locked(session, observation, now)

    # Un point par changement réel, lu et écrit avant toute autre écriture : le
    # verrou pris à l'instant est alors seul à le sérialiser. Plus bas, deux
    # écritures le doublaient sans le dire, sans test pour le surveiller.
    if observation.price is not None:
        latest = session.scalar(
            select(PricePoint)
            .where(PricePoint.listing_id == listing.id)
            .order_by(PricePoint.observed_at.desc(), PricePoint.id.desc())
            .limit(1)
        )
        changed = latest is None or latest.price != observation.price
        due = latest is not None and _utc_day(latest.observed_at) < _utc_day(now)
        if changed or due:
            session.add(PricePoint(
                listing_id=listing.id, observed_at=now, source=source,
                price=observation.price, confirmation=not changed,
                license_key_hash=license_.key_hash if license_ is not None else None,
            ))

    for field in VEHICLE_FIELDS:
        value = getattr(observation, field)
        if value is not None:
            setattr(listing, field, value)

    # Le vendeur n'est retenu que pour les professionnels. `store_id` existe
    # aussi chez les particuliers — accompagné d'un prénom — et serait alors de
    # la donnée personnelle : le tri se fait sur le type, jamais sur la présence
    # du champ. Muette sur le type, l'observation laisse ce qu'on savait.
    if observation.seller_type == "pro":
        if observation.seller_id is not None:
            listing.seller_id = observation.seller_id
            listing.seller_name = observation.seller_name
    elif observation.seller_type is not None:
        listing.seller_id = listing.seller_name = None

    details = [getattr(listing, field) for field in FINGERPRINT_FIELDS]
    if any(value is not None for value in details):
        listing.fingerprint = fingerprint(*details)
    # Sur ce que l'annonce porte *après* la mise à jour, non sur l'observation
    # seule : muette sur le modèle, elle garde celui qu'on savait. Le
    # vocabulaire des modèles connus vient du cache — une requête par
    # observation rejouerait un agrégat sur 53 000 lignes sept mille fois par
    # jour ; il se recharge au plus toutes les dix minutes.
    derive(listing, CACHE.get(session, now))

    listing.last_seen = max(listing.last_seen, now)
    listing.observations += 1
    listing.disappeared_at = listing.absent_since = None

    publication.apply(listing, observation, now)

    # L'usage se compte sur l'observation reçue, non sur le point de prix : un
    # marchand qui reparcourt des annonces confirmées du jour n'en produit aucun.
    # `listing.id` est acquis depuis `_locked`, sans `flush` à placer.
    bump(session, license_, listing.id, now.date())

    return listing
