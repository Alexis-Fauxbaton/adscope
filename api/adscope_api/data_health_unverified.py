"""Deux sections d'information du rapport de santé — jamais une alerte,
`Report.alerts` n'en tient pas compte.

La première rappelle ce que le lot « recherche filtrée » a codé sans jamais
l'avoir vu sur une annonce réelle, faute d'en avoir croisé une
(`.superpowers/recherche-lot2-api.md`) : la règle Corse (code postal `20xxx`
→ 2A/2B) et, côté La Centrale, le repli de `vocab.canonical` sur `autre` pour
un carburant ou une boîte que ce site n'avait pas montré au moment du
codage. Plutôt que de compter sur la mémoire d'Alexis, le rapport dit combien
d'annonces permettraient enfin de vérifier chacune, et en donne trois en
exemple dès qu'il y en a.

La seconde — la part de `autre` par site pour le carburant — est le signal
qu'une de ces règles mérite d'être revue : une valeur qu'un site envoie sans
case dans le vocabulaire fermé y tombe (`vocab.canonical`), et un pic chez un
seul site trahit une correspondance manquante plutôt qu'une vraie rareté.
"""

from sqlalchemy import func, select

from .models import Listing
from .vocab import OTHER

_SAMPLE_SIZE = 3


def _rule(session, *where) -> dict:
    total = session.scalar(select(func.count(Listing.id)).where(*where)) or 0
    if not total:
        return {"count": 0, "examples": []}
    examples = session.execute(
        select(Listing.site, Listing.site_id).where(*where)
        .order_by(Listing.id).limit(_SAMPLE_SIZE)
    ).all()
    return {
        "count": total,
        "examples": [{"site": site, "site_id": site_id} for site, site_id in examples],
    }


def unverified_rules(session) -> dict:
    """Pour chacune des deux règles jamais vues sur une annonce réelle, le
    nombre d'annonces en base qui permettraient enfin de la vérifier."""
    return {
        "corsica": _rule(session, Listing.department.in_(("2A", "2B"))),
        "lacentrale_fuel": _rule(
            session, Listing.site == "lc", Listing.fuel.isnot(None),
            Listing.fuel.notin_(("essence", "diesel")),
        ),
        "lacentrale_gearbox": _rule(session, Listing.site == "lc", Listing.gearbox.isnot(None)),
    }


def fuel_other_share_by_site(session) -> list[dict]:
    """La part de `autre` par site, pour le carburant seul — sur les annonces
    qui en portent un, `None` ne comptant pour rien ni pour l'autre."""
    rows = session.execute(
        select(Listing.site, func.count(Listing.id),
               func.count(Listing.id).filter(Listing.fuel == OTHER))
        .where(Listing.fuel.isnot(None))
        .group_by(Listing.site)
    ).all()
    return sorted(
        (
            {"site": site, "total": total, "other": other,
             "rate": None if not total else other / total}
            for site, total, other in rows
        ),
        key=lambda row: row["site"],
    )
