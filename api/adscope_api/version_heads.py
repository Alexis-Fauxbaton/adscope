"""La **tête** d'une version : ce qui précède la motorisation.

« Sport_Série 2 Gran Tourer 218dA 150ch Sport » a pour tête « série 2 gran
tourer ». C'est le nom que le vendeur donne à sa voiture, et quand le site ne
classe l'annonce nulle part, c'est le seul candidat de modèle qu'on ait.

Ce module ne déduit rien — `inference.py` s'en charge, et lui n'accepte qu'un
modèle déjà connu. Celui-ci sert le **rapport de santé** : les têtes fréquentes
parmi les annonces que la déduction n'a pas su résoudre sont exactement la
liste des modèles à ajouter à `shared/vehicle-aliases.json`. C'est ainsi que la
liste se maintient sans qu'on relise 55 000 versions à la main — et c'est un
humain, pas ce module, qui décide ce qui y entre.

La frontière est une heuristique, écrite et vérifiée sur les 93 candidats du
lot 3b : cylindrée, puissance, capacité de batterie, sigle moteur, code moteur
alphanumérique, ou un nombre qui n'est pas le premier mot de la tête (« Classe
R **280** » s'arrête à « Classe R », « Série **2** Gran Tourer » ne s'arrête
pas). Elle a le droit de se tromper : elle ne propose, elle ne pose rien.
"""

import re

from .model_matching import head

# Les sigles moteur relevés sur le corpus. Une liste, parce que rien ne les
# distingue d'un nom de modèle par leur forme seule — « TCe » et « Ceed » se
# ressemblent autant que deux mots de quatre lettres peuvent le faire.
ENGINE_WORDS = frozenset("""
tdi hdi dci tce vti puretech bluehdi tfsi tsi cdi cdti crdi multijet jtd jtdm
bluetec tdci ecoblue dohc thp vvti mjet sd4 sd6 sd8 td4 td6 tdv6 tdv8 d4d d-4d
skyactiv hybrid hybride e-tech gpl gdi tgdi t-gdi vvt-i e-hdi i-dtec cgi
kompressor biturbo electrique electric v6 v8 v10 v12 w12
""".split())

_DECIMAL = re.compile(r"^\d+[.,]\d+[a-z]{0,3}$")      # 2.0, 1.6i, 3.0d
_POWER = re.compile(r"^\d{2,4}(ch|cv|hp|kw)$")        # 150ch, 90cv
_BATTERY = re.compile(r"^\d{2,3}kwh$")
_ENGINE_CODE = re.compile(r"^\d{2,3}[a-z]{1,2}$")     # 218da, 320d
_NUMBER = re.compile(r"^\d{2,}$")
MAX_WORDS = 6


def _is_boundary(word, rank) -> bool:
    """`rank` est la place du mot dans la tête : le premier a le droit d'être
    un nombre (« 2008 », « 911 », « 500X »), les suivants non."""
    if _DECIMAL.match(word) or _POWER.match(word) or _BATTERY.match(word):
        return True
    if word in ENGINE_WORDS:
        return True
    return rank > 0 and bool(_ENGINE_CODE.match(word) or _NUMBER.match(word))


def head_phrase(version) -> str:
    """Les mots de tête, pliés et recollés, ou `""` si la version n'en a pas.

    Vide aussi quand la motorisation arrive tout de suite (« 2.0 HDi 110ch
    Pack » ne nomme aucun modèle) ou quand aucune frontière n'apparaît en six
    mots — au-delà, on juge la version illisible plutôt que de deviner.
    """
    words, start = head(version)
    tail = words[start:]
    for rank, word in enumerate(tail):
        if _is_boundary(word, rank):
            return " ".join(tail[:rank])
    return " ".join(tail) if 0 < len(tail) <= MAX_WORDS else ""
