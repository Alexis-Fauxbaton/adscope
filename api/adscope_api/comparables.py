"""Le segment d'une annonce, et où elle s'y place dedans.

Ce que la fiche ne dit jamais : ce que le marché demande pour la même voiture.
Le segment se lit sur les annonces que nos utilisateurs ont déjà rencontrées,
et rien d'autre n'en sort — ni prix cible, ni verdict : cinq bornes, la
dispersion qui dit ce qu'elles valent, et le rang de l'annonce parmi elles.

Quatre seuils portent tout le reste, chacun mesuré sur la base réelle :

- `MIN_COUNT`, quinze comparables. En dessous, les quartiles sont du bruit.
  Marque + modèle + année les atteint sur 63 % des annonces ; la version,
  renseignée sur 31 % d'entre elles seulement, ne les atteint presque jamais —
  d'où le repli plutôt que le refus.
- `MAX_DISPERSION`, trente pour cent. La dispersion médiane s'effondre avec
  l'âge : 63 % avant 2006, 60 % de 2006 à 2011, 23 % de 2012 à 2017, 8 % au
  delà. Le seuil laisse passer le récent et retient l'ancien, où l'année seule
  ne dit plus rien de l'état de la voiture.
- `MIN_QUARTILES`, quatre. Un segment trop mince pour être jugé garde ses
  bornes si elles ont un sens — sous quatre annonces, `percentile_disc` ne
  fait que recopier les prix qu'on lui donne.
- `DECOY_RATIO`, dix pour cent. Un comparable sous 10 % de la médiane du
  segment est une annonce-appât (1 €, 100 €…), pas un prix de marché : 32 des
  285 Peugeot 207 de 2008 sous 1 000 € en base tirent `q1` et gonflent la
  dispersion. La médiane sert deux fois, l'une et l'autre en SQL : sur tout
  le segment pour situer le seuil, puis sur ce qu'il en reste pour juger.
"""

from sqlalchemy import func, null, select

from .models import Listing, PricePoint

MIN_COUNT = 15
MAX_DISPERSION = 0.30
MIN_QUARTILES = 4
DECOY_RATIO = 0.10


def _last_prices(listing, versioned):
    """Le dernier prix connu de chaque annonce du segment, celle-ci exclue.

    Un prix par annonce, pas un par relevé : sans le `DISTINCT ON`, une annonce
    suivie depuis six mois pèserait cent fois celle vue hier.
    """
    where = [
        Listing.brand == listing.brand,
        Listing.model == listing.model,
        Listing.year == listing.year,
        Listing.id != listing.id,
    ]
    if versioned:
        where.append(Listing.version == listing.version)
    return (
        select(PricePoint.price)
        .join(Listing, Listing.id == PricePoint.listing_id)
        .where(*where)
        .distinct(PricePoint.listing_id)
        .order_by(PricePoint.listing_id, PricePoint.observed_at.desc(),
                  PricePoint.id.desc())
        .subquery()
    )


def _without_decoys(session, prices):
    """Écarte les annonces-appâts : la médiane d'abord sur tout, le filtre
    ensuite — deux agrégats, aucun en mémoire. Sans prix, rien à comparer."""
    query = select(func.percentile_disc(0.5).within_group(prices.c.price))
    median = session.scalar(query.select_from(prices))
    if median is None:
        return prices
    return select(prices.c.price).where(
        prices.c.price >= median * DECOY_RATIO).subquery()


def _measure(session, listing, price, versioned):
    """Les bornes du segment, comptées par Postgres et jamais en mémoire."""
    prices = _without_decoys(session, _last_prices(listing, versioned))
    column = prices.c.price
    # Une annonce sans prix ne se compare à rien : `prix <= NULL` ne compte
    # aucune ligne et la ferait passer pour la moins chère du segment.
    below = func.count().filter(column <= price) if price is not None else null()
    return session.execute(
        select(
            func.count().label("total"),
            func.min(column).label("low"),
            func.percentile_disc(0.25).within_group(column).label("q1"),
            func.percentile_disc(0.5).within_group(column).label("median"),
            func.percentile_disc(0.75).within_group(column).label("q3"),
            func.max(column).label("high"),
            below.label("below"),
        ).select_from(prices)
    ).one()


def _own_price(session, listing):
    return session.scalar(
        select(PricePoint.price)
        .where(PricePoint.listing_id == listing.id)
        .order_by(PricePoint.observed_at.desc(), PricePoint.id.desc())
        .limit(1)
    )


def comparables_for(session, listing) -> dict:
    segment = {"brand": listing.brand, "model": listing.model,
               "year": listing.year, "version": None}
    if listing.brand is None or listing.model is None or listing.year is None:
        return {"segment": segment, "count": 0, "min": None, "q1": None,
                "median": None, "q3": None, "max": None, "dispersion": None,
                "percentile": None, "comparable": False, "reason": "no_segment"}

    price = _own_price(session, listing)
    row = _measure(session, listing, price, versioned=listing.version is not None)
    # La version affine le segment tant qu'il en reste de quoi le juger. En
    # dessous, elle coûte plus qu'elle ne précise : le repli est silencieux,
    # `segment.version` reste nul et dit lequel des deux a servi.
    if listing.version is not None:
        if row.total >= MIN_COUNT:
            segment["version"] = listing.version
        else:
            row = _measure(session, listing, price, versioned=False)

    quartiles = row.total >= MIN_QUARTILES
    median = row.median if quartiles else None
    # Arrondie avant d'être jugée : le nombre servi et le verdict qu'il porte
    # ne peuvent pas se contredire à la troisième décimale.
    dispersion = round((row.q3 - row.q1) / median, 2) if median else None
    reason = (
        "too_few" if row.total < MIN_COUNT
        else "too_dispersed" if dispersion is None or dispersion > MAX_DISPERSION
        else None
    )
    return {
        "segment": segment,
        "count": row.total,
        "min": row.low if quartiles else None,
        "q1": row.q1 if quartiles else None,
        "median": median,
        "q3": row.q3 if quartiles else None,
        "max": row.high if quartiles else None,
        "dispersion": dispersion,
        "percentile": (
            None if reason is not None or row.below is None
            else round(100 * row.below / row.total)
        ),
        "comparable": reason is None,
        "reason": reason,
    }
