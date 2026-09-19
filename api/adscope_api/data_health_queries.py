"""Les quatre sections du rapport de santé, chacune une requête sur la base.

Séparé de `data_health.py` pour tenir sous 150 lignes ; c'est ce module que
`compute` assemble.
"""

from sqlalchemy import func, select

from .models import Listing
from .naming import label
from .spelling import _BRANDS, fold
from .taxonomy import UNKNOWN

MIN_WINDOW_LISTINGS = 50
NEW_MODEL_MIN_LISTINGS = 5
FRESHNESS_ALERT_BELOW = 0.90
FRESHNESS_BASELINE_ABOVE = 0.98
# Un modèle ne compte comme « connu de la marque » qu'avec assez d'annonces :
# en dessous, une orthographe rare ou une faute de saisie créerait un faux
# modèle, et une version qui le nommerait par hasard compterait comme
# contredite. Même seuil que `NEW_MODEL_MIN_LISTINGS`, même raison.
KNOWN_MODEL_MIN_LISTINGS = NEW_MODEL_MIN_LISTINGS

_UNKNOWN_KEY = fold(UNKNOWN)


def unknown_brands(session) -> list[dict]:
    """Les plis de marque absents de `shared/vehicle-aliases.json`.

    Groupé sur le pli, jamais sur l'écriture : « Wey » et « WEY » comptent pour
    une seule marque inconnue, avec l'écriture la plus fréquente des deux —
    celle qu'on recopierait dans le fichier.
    """
    rows = session.execute(
        select(Listing.brand, func.count(Listing.id))
        .where(Listing.brand.isnot(None))
        .group_by(Listing.brand)
    ).all()
    grouped: dict[str, dict] = {}
    for observed, count in rows:
        key = fold(observed)
        if not key or key in _BRANDS:
            continue
        entry = grouped.setdefault(key, {"brand": observed, "count": 0, "_best": 0})
        entry["count"] += count
        if count > entry["_best"]:
            entry["_best"], entry["brand"] = count, observed
    return sorted(
        ({"brand": v["brand"], "count": v["count"]} for v in grouped.values()),
        key=lambda r: (-r["count"], r["brand"]),
    )


def emerging_models(session, since, now, *, min_listings=NEW_MODEL_MIN_LISTINGS) -> list[dict]:
    """Les (marque, modèle) vus pour la première fois dans la fenêtre.

    Sur l'écriture observée, pas la forme canonique : c'est elle qu'on juge,
    avant de décider si elle mérite une exception dans
    `shared/vehicle-aliases.json`. `label` dit ce qu'on affiche déjà pour elle.
    """
    rows = session.execute(
        select(Listing.brand, Listing.model, func.count(Listing.id))
        .where(Listing.first_seen >= since, Listing.first_seen < now)
        .group_by(Listing.brand, Listing.model)
        .having(func.count(Listing.id) >= min_listings)
    ).all()
    return sorted(
        (
            {"brand": brand, "model": model, "count": count,
             "label": label(brand, model, None)}
            for brand, model, count in rows
        ),
        key=lambda r: -r["count"],
    )


def _unknown_counts(session, *, since=None, now=None) -> dict:
    query = select(
        func.count(Listing.id),
        func.count(Listing.id).filter(Listing.canon_model == _UNKNOWN_KEY),
        func.count(Listing.id).filter(
            Listing.canon_brand == _UNKNOWN_KEY, Listing.canon_model == _UNKNOWN_KEY
        ),
    )
    if since is not None:
        query = query.where(Listing.first_seen >= since, Listing.first_seen < now)
    total, model_unknown, both_unknown = session.execute(query).one()
    return {
        "total": total,
        "model_rate": None if not total else model_unknown / total,
        "brand_and_model_rate": None if not total else both_unknown / total,
    }


def unknown_share(session, since, now) -> dict:
    return {
        "overall": _unknown_counts(session),
        "window": _unknown_counts(session, since=since, now=now),
    }


def _freshness_window(session, since, now) -> dict:
    rows = session.execute(
        select(Listing.site, func.count(Listing.id),
               func.count(Listing.id).filter(Listing.published_at.isnot(None)))
        .where(Listing.first_seen >= since, Listing.first_seen < now)
        .group_by(Listing.site)
    ).all()
    return {site: {"new": new, "exact": exact} for site, new, exact in rows}


def publication_freshness(session, now, window,
                          *, min_listings=MIN_WINDOW_LISTINGS) -> list[dict]:
    """La fraîcheur de la date exacte, fenêtre contre fenêtre précédente.

    L'alerte ne se lève que si les deux fenêtres portent chacune assez de
    nouvelles annonces sur ce site : en dessous, une chute peut n'être que du
    bruit d'échantillon, jamais un signal.
    """
    current = _freshness_window(session, now - window, now)
    previous = _freshness_window(session, now - 2 * window, now - window)
    out = []
    for site in sorted(set(current) | set(previous)):
        cur = current.get(site, {"new": 0, "exact": 0})
        prev = previous.get(site, {"new": 0, "exact": 0})
        enough = cur["new"] >= min_listings and prev["new"] >= min_listings
        cur_ratio = None if not cur["new"] else cur["exact"] / cur["new"]
        prev_ratio = None if not prev["new"] else prev["exact"] / prev["new"]
        alert = bool(
            enough and cur_ratio is not None and prev_ratio is not None
            and cur_ratio < FRESHNESS_ALERT_BELOW and prev_ratio > FRESHNESS_BASELINE_ABOVE
        )
        out.append({
            "site": site, "current": cur, "previous": prev,
            "current_ratio": cur_ratio, "previous_ratio": prev_ratio,
            "enough_volume": enough, "alert": alert,
        })
    return out
