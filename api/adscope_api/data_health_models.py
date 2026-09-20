"""Deux sections du rapport de santé sur le **vocabulaire des modèles**, l'une
et l'autre de l'information, jamais une alerte.

Elles disent ce qu'il faudrait écrire dans `shared/vehicle-aliases.json` — et
elles ne l'écrivent pas. C'est la boucle que le lot 3b laisse derrière lui :
la liste des modèles créés s'est faite à la main sur une mesure, et le rapport
refait cette mesure à chaque passage pour que la liste ne vieillisse pas.

1. **Les têtes de version fréquentes parmi les « Autres » non résolues.** Une
   tête vue au moins cinq fois sous la même marque est un nom de modèle que
   les deux sites ignorent : « Range Rover Sport » l'a été 69 fois avant
   d'entrer dans le fichier.
2. **Les modèles d'un site dont le nom est le début d'un modèle de l'autre.**
   La Centrale écrit « 812 », leboncoin « 812 Superfast » : deux lignes dans
   un menu pour une seule voiture. Chaque paire est un candidat à
   `alias_modeles` — pas une faute, et pas toujours une fusion (« C3 » et
   « C3 Aircross » sont bien deux modèles).
"""

from collections import defaultdict

from sqlalchemy import func, select

from .models import Listing
from .spelling import fold
from .taxonomy import FROM_SITE, UNKNOWN
from .version_heads import head_phrase

MIN_HEAD_LISTINGS = 5
_UNKNOWN_KEY = fold(UNKNOWN)


def frequent_unresolved_heads(session, *, min_listings=MIN_HEAD_LISTINGS) -> list[dict]:
    """Les têtes de version qui reviennent parmi les annonces sans modèle.

    Sur `canon_model_source is NULL` — ni donné par le site, ni déduit : c'est
    exactement ce qui reste sur la table. La marque doit être connue, sans quoi
    le seau serait « Autres / Autres » et relèverait d'un vocabulaire de
    marques, pas de modèles.
    """
    rows = session.execute(
        select(Listing.canon_brand, Listing.version)
        .where(Listing.canon_model_source.is_(None),
               Listing.canon_brand.isnot(None),
               Listing.canon_brand != _UNKNOWN_KEY,
               Listing.version.isnot(None))
    ).all()
    counted: dict[tuple, dict] = {}
    for brand, version in rows:
        phrase = head_phrase(version)
        if not phrase:
            continue
        entry = counted.setdefault((brand, phrase),
                                   {"brand": brand, "head": phrase,
                                    "count": 0, "example": version})
        entry["count"] += 1
    return sorted(
        (e for e in counted.values() if e["count"] >= min_listings),
        key=lambda e: (-e["count"], e["brand"], e["head"]),
    )


def _declared_by_site(session) -> dict:
    """(marque, modèle) → {site: effectif}, sur les seuls modèles **donnés**
    par un site. Un modèle déduit n'a pas à proposer d'alias : il vient déjà
    du fichier."""
    rows = session.execute(
        select(Listing.canon_brand, Listing.canon_model, Listing.site,
               func.count(Listing.id))
        .where(Listing.canon_model_source == FROM_SITE,
               Listing.canon_brand.isnot(None), Listing.canon_model.isnot(None))
        .group_by(Listing.canon_brand, Listing.canon_model, Listing.site)
    ).all()
    out: dict = defaultdict(dict)
    for brand, model, site, count in rows:
        out[(brand, model)][site] = count
    return out


def cross_site_model_prefixes(session) -> list[dict]:
    """Les paires « un site dit le début de ce que l'autre dit en entier ».

    La comparaison porte sur des **mots entiers** — « c3 » commence bien
    « c3 aircross », mais pas « c30 ». Et les deux noms doivent venir de sites
    **différents et disjoints** : si les deux sites portent les deux
    écritures, ils sont d'accord pour en faire deux modèles, et il n'y a rien
    à trancher.
    """
    declared = _declared_by_site(session)
    by_brand: dict = defaultdict(list)
    for (brand, model), sites in declared.items():
        by_brand[brand].append((model, sites))
    out = []
    for brand, models in by_brand.items():
        for short, short_sites in models:
            words = short.split()
            for long, long_sites in models:
                if long == short or long.split()[:len(words)] != words:
                    continue
                if set(short_sites) & set(long_sites):
                    continue
                out.append({
                    "brand": brand, "short": short, "long": long,
                    "short_sites": dict(short_sites), "long_sites": dict(long_sites),
                    "count": sum(short_sites.values()) + sum(long_sites.values()),
                })
    return sorted(out, key=lambda r: (-r["count"], r["brand"], r["short"]))
