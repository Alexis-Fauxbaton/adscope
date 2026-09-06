from datetime import datetime, timedelta, timezone

from sqlalchemy import select

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


def record(session, observation: ObservationIn, source: str, license_=None,
           now=None) -> Listing:
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

    session.flush()
    # L'usage se compte ici, sur l'observation reçue, et non plus sur le point
    # de prix : celui-ci n'est écrit qu'en cas de changement, et un marchand qui
    # reparcourt des annonces stables paraissait alors inactif.
    bump(session, license_, listing.id, now.date())

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

    return listing
