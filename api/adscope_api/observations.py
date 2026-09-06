"""Ce qu'une observation apprend sur une annonce, écrit sous verrou.

Chaque valeur se calcule ici en Python sur ce qu'on vient de lire. Sans verrou,
l'intervalle entre la lecture et l'écriture appartient à qui passe en même
temps : dix marchands simultanés faisaient monter le compteur de 1 à 2, et la
borne basse se perdait dix fois sur douze. `_locked` ferme cet intervalle.

Les invariants tenus ici : `site_published_first` ne recule jamais — la
détection de republication en dépend tout entière ; `site_published_last`
n'avance jamais à rebours ; `published_at` ne recule jamais et `bumped_at`
n'avance jamais à rebours ; `observations` compte toutes les observations
reçues ; un point de prix par changement réel, un par semaine sans changement.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from .fingerprint import fingerprint
from .models import Listing, PricePoint
from .intake import ObservationIn
from .usage import bump

FINGERPRINT_FIELDS = ("brand", "model", "version", "year", "mileage")
VEHICLE_FIELDS = FINGERPRINT_FIELDS + ("postal_code", "seller_type")

# Un point de prix au changement seulement laissait entre deux points un
# intervalle qu'aucune relecture ne peut combler : entre le 1er juillet à
# 10 900 € et le 27 août à 9 900 €, le prix a pu descendre et remonter sans
# témoin. Passé ce délai sans point, l'annonce revue en produit un — inchangé,
# mais daté. C'est la distribution sur l'axe du temps qui manquait, et un point
# par semaine suffit : neuf au plus sur les soixante jours de vie d'une annonce.
CONFIRM_AFTER = timedelta(days=7)


def _locked(session, observation, now) -> Listing:
    """L'annonce, verrouillée jusqu'à la fin de la transaction.

    Le verrou porte sur une ligne, jamais sur la table : deux marchands qui
    observent deux annonces différentes ne s'attendent pas. Et il se tient
    pour toute la suite — c'est lui, et non l'ordre des instructions, qui rend
    justes le compteur, les bornes et la lecture du dernier prix.

    L'annonce inconnue s'insère avec `ON CONFLICT DO NOTHING`. Deux marchands
    ouvrant la même annonce neuve au même instant, c'est le scénario même de la
    mutualisation, et il rendait 500 : neuf erreurs sur dix créations
    simultanées. Qui perd la course attend, puis verrouille la ligne écrite.
    """
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
    # écritures le doublaient sans le dire, et aucun test ne le surveillait.
    if observation.price is not None:
        latest = session.scalar(
            select(PricePoint)
            .where(PricePoint.listing_id == listing.id)
            .order_by(PricePoint.observed_at.desc(), PricePoint.id.desc())
            .limit(1)
        )
        changed = latest is None or latest.price != observation.price
        due = latest is not None and now - latest.observed_at >= CONFIRM_AFTER
        if changed or due:
            # Qui a envoyé quoi : la seule mesure d'usage du produit, prise
            # sur ce qu'on enregistrait déjà.
            session.add(PricePoint(
                listing_id=listing.id, observed_at=now,
                price=observation.price, source=source,
                confirmation=not changed,
                license_key_hash=license_.key_hash if license_ is not None else None,
            ))

    for field in VEHICLE_FIELDS:
        value = getattr(observation, field)
        if value is not None:
            setattr(listing, field, value)

    # Le vendeur n'est retenu que pour les professionnels. `store_id` existe
    # aussi chez les particuliers — accompagné d'un prénom — et serait alors de
    # la donnée personnelle : le tri se fait sur le type, jamais sur la présence
    # du champ. Une observation muette sur le type n'apprend rien : elle laisse
    # en place ce qu'on savait.
    if observation.seller_type == "pro":
        if observation.seller_id is not None:
            listing.seller_id = observation.seller_id
            listing.seller_name = observation.seller_name
    elif observation.seller_type is not None:
        listing.seller_id = listing.seller_name = None

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

    # L'usage se compte ici, sur l'observation reçue, et non plus sur le point
    # de prix : celui-ci n'est écrit qu'en cas de changement, et un marchand qui
    # reparcourt des annonces stables paraissait alors inactif. `listing.id` est
    # acquis depuis `_locked` : plus de `flush` à placer au bon endroit.
    bump(session, license_, listing.id, now.date())

    return listing
