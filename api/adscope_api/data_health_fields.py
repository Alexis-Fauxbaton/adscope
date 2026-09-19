"""Deux sections du rapport de santé sur les trois champs du lot « carburant,
boîte, département » — extraites de `data_health_queries.py`, que ce lot
faisait passer les 150 lignes. Assemblées par `data_health.compute`, comme le
reste.
"""

from sqlalchemy import func, select

from .data_health_queries import KNOWN_MODEL_MIN_LISTINGS, _UNKNOWN_KEY
from .models import Listing
from .taxonomy import _words, version_names_model


def _rate(session, since=None, now=None) -> dict:
    query = select(
        func.count(Listing.id),
        func.count(Listing.id).filter(Listing.fuel.isnot(None)),
        func.count(Listing.id).filter(Listing.gearbox.isnot(None)),
        func.count(Listing.id).filter(Listing.department.isnot(None)),
    )
    if since is not None:
        query = query.where(Listing.last_seen >= since, Listing.last_seen < now)
    total, fuel, gearbox, department = session.execute(query).one()
    return {
        "total": total,
        "fuel_rate": None if not total else fuel / total,
        "gearbox_rate": None if not total else gearbox / total,
        "department_rate": None if not total else department / total,
    }


def field_fill_rate(session, since, now) -> dict:
    """Le taux de remplissage de `fuel`/`gearbox`/`department`, sur toute la
    base et sur les annonces *vues* dans la fenêtre (`last_seen`, pas
    `first_seen` : l'existant ne se remplit qu'au fil du balayage, une annonce
    ancienne revue cette semaine peut gagner ces champs sans être nouvelle)."""
    return {"overall": _rate(session), "window": _rate(session, since, now)}


def _is_bare_number(model) -> bool:
    """Un modèle réduit à un seul nombre (« 200 », « 300 ») est presque
    toujours un code de finition ou de motorisation mal extrait en modèle,
    pas un nom de modèle — mesuré sur la base réelle (2026-09-19) : sans ce
    filtre, trois plis Mercedes numériques suffisaient à eux seuls à
    multiplier par sept le compte, contre des versions qui portent leur
    propre motorisation en toutes lettres (« Classe C 200 »)."""
    words = _words(model)
    return len(words) == 1 and words[0].isdigit()


def _known_models_by_brand(session, *, min_listings) -> dict[str, set[str]]:
    rows = session.execute(
        select(Listing.canon_brand, Listing.canon_model, func.count(Listing.id))
        .where(Listing.canon_brand.isnot(None), Listing.canon_model.isnot(None),
               Listing.canon_model != _UNKNOWN_KEY)
        .group_by(Listing.canon_brand, Listing.canon_model)
        .having(func.count(Listing.id) >= min_listings)
    ).all()
    by_brand: dict[str, set[str]] = {}
    for brand, model, _count in rows:
        if not _is_bare_number(model):
            by_brand.setdefault(brand, set()).add(model)
    return by_brand


def _is_sub_model(other, model) -> bool:
    """`other` est-il la famille plus large de `model` — ses mots un
    sous-ensemble des siens (« c3 » dans « c3 aircross », « cherokee » dans
    « grand cherokee ») ? Ce n'est pas une contradiction, c'est la même
    famille dite plus précisément — et la version d'un modèle dérivé commence
    presque toujours par le nom du modèle de base."""
    other_words, model_words = set(_words(other)), set(_words(model))
    return bool(other_words) and other_words <= model_words


def version_names_another_model(session, *, min_listings=KNOWN_MODEL_MIN_LISTINGS) -> dict:
    """Le fait promis à Alexis : combien d'annonces portent, dans leur
    version, un autre modèle connu de la même marque que celui déclaré
    (« Mégane » vendue sous « Scénic », par ex.) — presque toujours légitime,
    jamais une alerte (voir `data_health.py`). Mesuré sur les annonces dont
    marque, modèle et version canoniques sont tous connus : la comparaison
    n'a de sens que là.
    """
    known = _known_models_by_brand(session, min_listings=min_listings)
    rows = session.execute(
        select(Listing.canon_brand, Listing.canon_model, Listing.version)
        .where(Listing.canon_brand.isnot(None), Listing.canon_model.isnot(None),
               Listing.canon_model != _UNKNOWN_KEY, Listing.version.isnot(None))
    ).all()
    population = len(rows)
    count = sum(
        1 for brand, model, version in rows
        if any(
            version_names_model(version, other)
            for other in known.get(brand, set()) - {model}
            if not _is_sub_model(other, model)
        )
    )
    return {
        "count": count, "population": population,
        "rate": None if not population else count / population,
    }
