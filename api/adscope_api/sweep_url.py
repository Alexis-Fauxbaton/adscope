"""Traduction d'une recherche adscope en URL de résultats leboncoin — la
partie du balayage (lot F2) qui ne visite jamais une page pour se vérifier :
marque, modèle, `fuel`, `gearbox`, `regdate`, `mileage` et `locations` ont
tous été relevés le 2026-09-22 sur des URL fabriquées par le site lui-même
(`regdate=2023-2025&mileage=1000-20000&gearbox=2&fuel=4&locations=d_77`).
Restent supposés : `price=0-max` quand aucune borne n'est posée, et les
bornes ouvertes `-max` / `1900-`. La vérification réelle est au runbook
(`crawler/RUNBOOK-balayage.md`) : la session cowork compare le `total` lu
dans `__NEXT_DATA__` de la page 1 à l'`expected_total` que `sweep.py` calcule,
et journalise l'écart.

Une seule fonction publique : `translate(session, params)`.
"""

from urllib.parse import quote, urlencode

from sqlalchemy import func, select

from .market_filters import combined as combined_departments
from .models import Listing
from .taxonomy import key as canon_key

CATEGORY = "2"

# Table inverse de `extension/src/sites/leboncoin.js:FUEL`, relevée sur pièce
# le 2026-09-19. `autre` (code 5, seau fourre-tout) et `ethanol` (aucun code
# connu, `vocab.py`) en sont absents exprès : un carburant qui n'y figure pas
# fait sortir le paramètre `fuel` entier de l'URL plutôt que de filtrer plus
# étroit que ce que la recherche demande (§1.6 du plan).
FUEL_CODES = {
    "essence": "1", "diesel": "2", "gpl": "3", "electrique": "4",
    "hybride": "6", "gnv": "7", "hybride_rechargeable": "8", "hydrogene": "9",
}
GEARBOX_CODES = {"manuelle": "1", "automatique": "2"}


def _site_spelling(session, canon_brand, canon_model):
    """L'écriture leboncoin la plus fréquente pour ce couple canonique, lue
    sur les lignes plutôt que sur le filtre : la base porte 17 lignes
    `RENAULT` contre 4 723 `Renault`, et c'est la majorité qui doit trancher
    l'URL, pas la première rencontrée."""
    return session.execute(
        select(Listing.brand, Listing.model)
        .where(Listing.site == "lbc", Listing.canon_brand == canon_brand,
               Listing.canon_model == canon_model, Listing.brand.is_not(None))
        .group_by(Listing.brand, Listing.model)
        .order_by(func.count().desc())
        .limit(1)
    ).first()


def _mapped_codes(values, table):
    """`None` dès qu'une valeur n'a pas de code — un seau `unmapped` plutôt
    qu'un filtre qui en retiendrait moins que demandé."""
    codes = [table[v] for v in values if v in table]
    return codes if len(codes) == len(values) else None


def translate(session, params):
    """`(url, unmapped, skip_reason, missing)`. `skip_reason` est `None` en
    cas de succès ; `missing` ne porte que les champs absents à l'origine
    d'un `trop_large` de marque/modèle."""
    if params.q:
        return None, [], "texte_libre", []

    missing = [name for name in ("brand", "model") if not getattr(params, name)]
    if missing:
        return None, [], "trop_large", missing

    canon_brand, canon_model = canon_key(params.brand, params.model)
    spelling = _site_spelling(session, canon_brand, canon_model)
    if spelling is None:
        return None, [], "trop_large", []
    brand, model = spelling

    price_min = params.price_min if params.price_min is not None else 0
    price_max = params.price_max if params.price_max is not None else "max"
    pairs = [("category", CATEGORY), ("price", f"{price_min}-{price_max}")]
    if params.seller_type:
        pairs.append(("owner_type", params.seller_type))
    pairs += [("sort", "price"), ("order", "asc"), ("page", "1")]
    # Relevé par Alexis sur une URL fabriquée par le site (2026-09-22) :
    # `u_car_brand=Tesla,TESLA&u_car_model=TESLA_Model%20Y` — la marque sous
    # ses deux écritures, le modèle préfixé de la marque en capitales, l'espace
    # encodé `%20` (jamais `+` : avec `Tesla_Model+Y`, zéro résultat).
    pairs.append(("u_car_brand", f"{brand},{brand.upper()}"))
    pairs.append(("u_car_model", f"{brand.upper()}_{model}"))

    unmapped = []
    fuel_codes = _mapped_codes(params.fuel, FUEL_CODES)
    if params.fuel and fuel_codes is None:
        unmapped.append("fuel")
    elif fuel_codes:
        pairs.append(("fuel", ",".join(sorted(fuel_codes))))

    gearbox_codes = _mapped_codes(params.gearbox, GEARBOX_CODES)
    if params.gearbox and gearbox_codes is None:
        unmapped.append("gearbox")
    elif gearbox_codes:
        pairs.append(("gearbox", ",".join(sorted(gearbox_codes))))

    if params.year_min is not None or params.year_max is not None:
        year_min = params.year_min if params.year_min is not None else 1900
        pairs.append(("regdate", f"{year_min}-{params.year_max or 'max'}"))
    if params.mileage_min is not None or params.mileage_max is not None:
        mileage_min = params.mileage_min if params.mileage_min is not None else 0
        pairs.append(("mileage", f"{mileage_min}-{params.mileage_max or 'max'}"))

    departments = combined_departments(params.department or None, params.region or None)
    if departments:
        pairs.append(("locations", ",".join(f"d_{d}" for d in departments)))

    url = "https://www.leboncoin.fr/recherche?" + urlencode(pairs, safe=",", quote_via=quote)
    return url, unmapped, None, []
