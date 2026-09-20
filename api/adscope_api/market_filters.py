"""`department` et `region`, combinés en une seule liste de départements —
extrait de `market.py` pour être partagé avec `facet_query.py`, qui doit
pouvoir compter les facettes « regions » et « departments » sans ce filtre
(`exclude={"location"}` dans `market_query.core`).

`department` n'est pas un vocabulaire fermé (une centaine de codes, plus les
DOM et la Corse) : validé au format, jamais deviné — une valeur qui n'y
ressemble pas est un 422, jamais un filtre muet qui ne rend jamais rien.
`region`, à l'inverse, *est* un vocabulaire fermé (les dix-huit de
`region.REGIONS`) : un identifiant qui n'y figure pas est un 422 aussi.

Les deux ensemble filtrent en « et » : seuls les départements demandés qui
tombent aussi dans une région demandée passent. Aucun des deux donné : pas de
filtre (`None`). Un seul donné : lui seul. Les deux, sans recoupement : liste
vide — `market_query.core` doit alors ne rien rendre plutôt que d'ignorer le
filtre (jamais `if department:`, toujours `if department is not None:`)."""

from fastapi import HTTPException

from .department import normalize as normalize_department
from .region import departments_of as region_departments_of


def departments(values: list[str] | None) -> list[str] | None:
    if values is None:
        return None
    normalized = [normalize_department(v) for v in values]
    if None in normalized:
        raise HTTPException(status_code=422, detail="department inconnu")
    return normalized


def region_departments(values: list[str] | None) -> list[str] | None:
    if values is None:
        return None
    found_departments: set[str] = set()
    for value in values:
        found = region_departments_of(value)
        if found is None:
            raise HTTPException(status_code=422, detail="région inconnue")
        found_departments.update(found)
    return sorted(found_departments)


def combined(department: list[str] | None, region: list[str] | None) -> list[str] | None:
    dept = departments(department)
    reg = region_departments(region)
    if dept is None:
        return reg
    if reg is None:
        return dept
    return sorted(set(dept) & set(reg))
