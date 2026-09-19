"""Le vocabulaire fermé de carburant et de boîte.

Deux emplois : `intake.py` y range toute valeur reçue — une valeur du
vocabulaire passe telle quelle, tout le reste (faute de frappe, code d'un site
qu'on n'a pas encore vu, type inattendu) devient `autre`, journalisé plutôt que
refusé. Refuser ferait perdre l'observation entière pour un fait secondaire.
`market.py` s'en sert dans l'autre sens : un filtre `fuel=`/`gearbox=` hors de
cette liste est un 422, jamais un seau muet qui ne rend jamais rien.

Établi sur pièce le 2026-09-19 (`.superpowers/recherche-lot2-api.md`) :
leboncoin sert neuf codes fuel, dont GNV et Hydrogène qui n'ont pas de case
dédiée ici et retombent sur `autre` — une perte d'information assumée en
attendant une décision d'Alexis. `gearbox` n'a que deux valeurs observées
(manuelle, automatique) sur les deux sites ; `autre` reste néanmoins la case de
repli, pour la même raison que côté fuel : une boîte non reconnue ne doit pas
faire échouer l'observation.
"""

import logging
from typing import Literal

log = logging.getLogger("adscope.vocab")

OTHER = "autre"

FUEL_VALUES = (
    "essence", "diesel", "hybride", "hybride_rechargeable", "electrique", "gpl", OTHER,
)
GEARBOX_VALUES = ("manuelle", "automatique", OTHER)

Fuel = Literal[
    "essence", "diesel", "hybride", "hybride_rechargeable", "electrique", "gpl", "autre",
]
Gearbox = Literal["manuelle", "automatique", "autre"]


def canonical(value, values: tuple[str, ...], field: str) -> str | None:
    """`value` ramenée au vocabulaire fermé : minuscules ASCII, et tout ce qui
    n'y figure pas devient `autre`, journalisé. `None` reste `None` — une
    observation muette sur le champ n'apprend rien, voir `observations.record`."""
    if value is None:
        return None
    folded = value.strip().lower() if isinstance(value, str) else None
    if folded in values:
        return folded
    log.warning("%s hors vocabulaire : %r rangé en %r", field, value, OTHER)
    return OTHER
