"""Le département : reçu directement, ou dérivé du code postal.

Un département envoyé tel quel doit ressembler à un département — deux ou
trois chiffres, ou 2A/2B pour la Corse — sinon il est ignoré, jamais deviné
d'une chaîne quelconque. Quand seul le code postal arrive, `of_postal_code`
applique la règle française usuelle : les deux premiers chiffres, sauf la
Corse (`20xxx`, sous 20200 c'est 2A, au-dessus 2B) et les DOM (`971xx` à
`976xx`, trois chiffres). Cette règle n'est pas vérifiée sur une annonce corse
ou domienne réelle des deux sites observés — voir
`.superpowers/recherche-lot2-api.md` — c'est la règle usuelle, posée en
attendant qu'une telle annonce soit croisée.

Un code postal n'est exploité que **complet** : cinq chiffres. Un fragment
(un département déjà réduit, envoyé par erreur sous le nom `postal_code`)
n'en est pas un, et le stocker comme tel désignerait une autre commune.
"""

import re

_CODE = re.compile(r"^(\d{2,3}|2[AB])$")
_DOM = re.compile(r"^97[1-6]")


def is_complete(postal_code) -> bool:
    return isinstance(postal_code, str) and len(postal_code) == 5 and postal_code.isdigit()


def normalize(value) -> str | None:
    """Le département tel qu'envoyé, validé — deux à trois chiffres, ou
    2A/2B. Ignoré (`None`) sinon, jamais tronqué : un département rogné en
    désignerait un autre."""
    if not isinstance(value, str):
        return None
    upper = value.strip().upper()
    return upper if _CODE.fullmatch(upper) else None


def of_postal_code(postal_code) -> str | None:
    """Le département dérivé d'un code postal complet. `None` si le code
    n'est pas exploitable."""
    if not is_complete(postal_code):
        return None
    if _DOM.match(postal_code):
        return postal_code[:3]
    if postal_code.startswith("20"):
        return "2A" if int(postal_code) < 20200 else "2B"
    return postal_code[:2]
