"""Les facettes de `/v1/market/facets` : chacune groupée en SQL sur la
requête de `market_query.core` (agrégats, jamais les 56 000 annonces chargées
en Python), déjà privée de son propre filtre par l'appelant
(`market_facets.py`, `exclude={...}`).

`canon_brand`/`canon_model` sont les clés repliées que porte `listings` — le
libellé s'en déduit : `spelling.brand` pour la marque (table fermée),
`spelling.inferred` pour le modèle (même mécanique que pour un modèle déduit,
voir son commentaire : titre-casé puis passé par la règle/les exceptions de
`spelling.model`). Les régions n'ont pas de colonne : `region.of_department`
replie les comptes par département ; le nom d'un département vient de
`department_labels.py`.
"""

from sqlalchemy import func, select

from . import region as region_module
from .department_labels import label_of as department_label
from .region import REGIONS
from .spelling import brand as brand_label, inferred as model_label
from .taxonomy import UNKNOWN, fold
from .vocab import FUEL_LABELS, GEARBOX_LABELS

UNKNOWN_MODEL_KEY = "autres"
UNKNOWN_MODEL_LABEL = "Modèle non précisé"


def _counts(session, query, column_name):
    """`[(valeur, compte)]`, la plus grande d'abord — `None` inclus, à
    l'appelant de le compter à part ou de l'écarter."""
    sub = query.subquery()
    column = sub.c[column_name]
    # Le compte d'abord, la clé ensuite pour départager une égalité — sans
    # second critère, l'ordre d'une égalité n'est pas garanti par Postgres.
    return session.execute(
        select(column, func.count())
        .group_by(column).order_by(func.count().desc(), column.asc())
    ).all()


def total(session, query):
    return session.scalar(select(func.count()).select_from(query.subquery()))


def brands(session, query):
    rows = _counts(session, query, "canon_brand")
    return [{"key": k, "label": brand_label(k), "count": n} for k, n in rows if k is not None]


def models(session, query):
    """« Modèle non précisé » (clé `autres`) rassemble `NULL` et le seau
    « Autres » du site (`taxonomy.UNKNOWN`, replié) — placé en dernier, quel
    que soit son compte, jamais mêlé au tri par compte décroissant des
    modèles nommés."""
    rows = _counts(session, query, "canon_model")
    named = [
        {"key": k, "label": model_label(k), "count": n}
        for k, n in rows if k is not None and k != fold(UNKNOWN)
    ]
    unknown = sum(n for k, n in rows if k is None or k == fold(UNKNOWN))
    if unknown:
        named.append({"key": UNKNOWN_MODEL_KEY, "label": UNKNOWN_MODEL_LABEL, "count": unknown})
    return named


def fuel(session, query):
    rows = _counts(session, query, "fuel")
    named = [{"key": k, "label": FUEL_LABELS.get(k, k), "count": n} for k, n in rows if k]
    return named, sum(n for k, n in rows if not k)


def gearbox(session, query):
    rows = _counts(session, query, "gearbox")
    named = [{"key": k, "label": GEARBOX_LABELS.get(k, k), "count": n} for k, n in rows if k]
    return named, sum(n for k, n in rows if not k)


def seller_types(session, query):
    rows = _counts(session, query, "seller_type")
    return [{"key": k, "count": n} for k, n in rows if k]


def locations(session, query):
    """Régions et départements partagent une seule requête : la région n'est
    qu'un repli des comptes par département (`region.of_department`), jamais
    une colonne à elle — voir `region.py`."""
    rows = _counts(session, query, "department")
    departments = [
        {"key": k, "label": department_label(k), "count": n} for k, n in rows if k
    ]
    unknown = sum(n for k, n in rows if not k)
    by_region: dict[str, int] = {}
    for k, n in rows:
        name = region_module.of_department(k) if k else None
        if name:
            by_region[name] = by_region.get(name, 0) + n
    regions = sorted(
        ({"key": ident, "label": name, "count": by_region[name]}
         for ident, (name, _) in REGIONS.items() if name in by_region),
        key=lambda item: (-item["count"], item["key"]),
    )
    return regions, departments, unknown


def ranges(session, query, column_name):
    sub = query.subquery()
    column = sub.c[column_name]
    low, high = session.execute(select(func.min(column), func.max(column))).first()
    return {"min": low, "max": high}
