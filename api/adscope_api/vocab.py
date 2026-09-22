"""Le vocabulaire fermé de carburant et de boîte.

Deux emplois : `intake.py` y range toute valeur reçue — une valeur du
vocabulaire passe telle quelle, tout le reste (faute de frappe, code d'un site
qu'on n'a pas encore vu, type inattendu) devient `autre`, journalisé plutôt que
refusé. Refuser ferait perdre l'observation entière pour un fait secondaire.
`market.py` s'en sert dans l'autre sens : un filtre `fuel=`/`gearbox=` hors de
cette liste est un 422, jamais un seau muet qui ne rend jamais rien.

Établi sur pièce le 2026-09-19 (`.superpowers/recherche-lot2-api.md`) :
leboncoin sert neuf codes fuel. Sept avaient une case ; GNV (code 7, 600 à 700
annonces) et Hydrogène (code 9, une trentaine) n'en avaient pas et retombaient
sur `autre` — ajoutés au vocabulaire le même jour, sur le même relevé, `autre`
ne gardant plus que le code 5 (« Autre »). `ethanol` (E85) entre à son tour
(lot F2) pour la Centrale (`BICARBURATION_ESSENCE_BIOETHANOL`) : la table
`FUEL` 1..9 de leboncoin n'a aucun code pour lui, et on n'en invente pas —
`sweep_url.translate` retire le paramètre `fuel` entier plutôt que de filtrer
plus étroit qu'une recherche qui le demande. `gearbox` n'a que deux valeurs
observées (manuelle, automatique) sur les deux sites ; `autre` reste néanmoins
la case de repli, pour la même raison que côté fuel : une boîte non reconnue
ne doit pas faire échouer l'observation.

Ce vocabulaire est dupliqué côté extension (`extension/src/sites/leboncoin.js`,
table `FUEL`) faute d'un fichier `shared/` commun pour ce genre de liste
aujourd'hui (il en existe un pour l'empreinte véhicule,
`shared/fingerprint-vectors.json` — rien d'équivalent pour le vocabulaire
fuel/gearbox). Chaque côté fige donc sa propre liste dans un test
(`test_vocab.py` ici, `vehicle-fields.test.mjs` côté extension) pour qu'un
écart se voie au diff plutôt qu'en silence.
"""

import logging
from typing import Literal

log = logging.getLogger("adscope.vocab")

OTHER = "autre"

FUEL_VALUES = (
    "essence", "diesel", "hybride", "hybride_rechargeable", "electrique", "gpl",
    "gnv", "hydrogene", "ethanol", OTHER,
)
GEARBOX_VALUES = ("manuelle", "automatique", OTHER)

Fuel = Literal[
    "essence", "diesel", "hybride", "hybride_rechargeable", "electrique", "gpl",
    "gnv", "hydrogene", "ethanol", "autre",
]
Gearbox = Literal["manuelle", "automatique", "autre"]

# L'écriture d'affichage, pour `facet_query.py` — jamais utilisée pour
# comparer ou stocker : les clés ci-dessus restent la seule forme qui va en
# base et dans les filtres.
FUEL_LABELS = {
    "essence": "Essence", "diesel": "Diesel", "hybride": "Hybride",
    "hybride_rechargeable": "Hybride rechargeable", "electrique": "Électrique",
    "gpl": "GPL", "gnv": "GNV", "hydrogene": "Hydrogène", "ethanol": "Éthanol",
    OTHER: "Autre",
}
GEARBOX_LABELS = {"manuelle": "Manuelle", "automatique": "Automatique", OTHER: "Autre"}


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
