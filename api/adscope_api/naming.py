"""Le nom propre d'un véhicule : « Citroën C4 Picasso BlueHDi 150ch Exclusive ».

Composé à un seul endroit, pour `/v1/market` comme pour `/v1/follows/feed`
(`market_items.py`). Marque et modèle dans leur orthographe d'affichage
(`spelling.py`), puis la version débarrassée de ce qu'elle répète.

Elle répète beaucoup : 15 523 versions sur 17 451 redisent le modèle, et
leboncoin y ajoute deux tours à lui. Il colle la finition devant la version par
un souligné et la redit à la fin — « Exclusive_C4 Picasso … Exclusive S&S ». Et
il écrit le modèle avec ou sans espace selon la colonne : modèle « Ds3 »,
version « DS 3 Crossback ». D'où deux règles au-delà du simple retrait de mots :
un préfixe de finition qui se répète s'en va (`_unglued`), et la comparaison
ignore les espaces (`_span`) — sans jamais couper ailleurs qu'entre deux mots,
faute de quoi « C3 » mordrait dans « C3500 ».
"""

import re

from .spelling import fold
from .taxonomy import NO_VEHICLE, UNKNOWN, canonical

# Le souligné de leboncoin est un séparateur de mots : 3 350 versions sur les
# 17 451 qui en portent une collent la finition au modèle par lui.
_WORDS = re.compile(r"[\s_]+")


def _phrases(*values):
    """Les suites de mots à retirer d'une version, la plus longue d'abord.

    Pliées et **sans leurs espaces** : le modèle « Ds3 » doit reconnaître le
    « DS 3 » de la version, et « Rav 4 » le « RAV4 ». Les plus longues d'abord,
    sinon « Land Rover » mangerait le « Rover » de « Range Rover Sport ».
    """
    plies = {fold(v).replace(" ", "") for v in values if v and fold(v) != fold(UNKNOWN)}
    return sorted((p for p in plies if p), key=len, reverse=True)


def _span(plies, start, phrases) -> int:
    """Combien de mots, à partir de `start`, forment une des suites à retirer.

    Les espaces ne comptent pas, mais les frontières de mots oui : on accumule
    des mots entiers jusqu'à peser autant que la suite cherchée, puis on exige
    l'égalité. Donc « DS 3 » se reconnaît en deux mots, et « C3 » ne mord pas
    dans « C3500 » — un mot qui dépasse ne peut plus égaler.
    """
    for phrase in phrases:
        run = ""
        for count, ply in enumerate(plies[start:], start=1):
            run += ply
            if len(run) >= len(phrase):
                if run == phrase:
                    return count
                break
    return 0


def _unglued(version):
    """« Finition_Modèle … Finition » : le préfixe s'en va s'il se répète.

    S'il reparaît tel quel plus loin dans la version, il n'ajoute rien et part.
    S'il ne reparaît pas (« Base_Camaro Coupé 6.2 V8 453ch 8AT »), il porte la
    seule finition qu'on ait et il reste — le souligné devient une espace dans
    `_trimmed`.
    """
    head, sep, rest = (version or "").partition("_")
    if not sep:
        return version
    prefix = fold(head).replace(" ", "")
    plies = [fold(w) for w in _WORDS.split(rest) if w]
    repeated = any(_span(plies, i, (prefix,)) for i in range(len(plies)))
    return rest if prefix and repeated else version


def _trimmed(version, phrases) -> str:
    words = [w for w in _WORDS.split(version or "") if w]
    plies = [fold(w) for w in words]
    kept, i = [], 0
    while i < len(words):
        run = _span(plies, i, phrases)
        if run:
            i += run
        else:
            kept.append(words[i])
            i += 1
    return " ".join(kept)


def _rebrand(canon_brand, canon_model):
    """Le modèle qui redit déjà la marque, ramené à un seul nom.

    « DS » + « DS 3 » perd sa marque en tête ; mesuré sur 52 957 annonces, 94
    la répètent ainsi (DS 68, McLaren 15, Abarth 11), zéro contre-exemple. La
    comparaison porte sur des mots entiers, jamais une sous-chaîne — sinon
    « Renault » mordrait dans « Renaultsport ». La marque garde sa propre
    orthographe (liste fermée, `spelling._BRANDS`) plutôt que celle du modèle
    (vocabulaire ouvert) : « McLaren » + « Mclaren 720S » rend « McLaren
    720S », jamais « Mclaren 720S ».
    """
    brand_words = [w for w in _WORDS.split(fold(canon_brand)) if w]
    model_words = [w for w in _WORDS.split(canon_model) if w]
    # Un modèle pas plus long que la marque ne peut jamais l'égaler ici : la
    # tranche prise sur lui est alors plus courte que `brand_words` et diffère
    # d'elle par construction — un seul test suffit, jamais deux.
    if [fold(w) for w in model_words[:len(brand_words)]] != brand_words:
        return None
    return " ".join([canon_brand, *model_words[len(brand_words):]])


def label(brand, model, version) -> str:
    """Marque, modèle, version — sans « Autres » et sans redite."""
    canon_brand, canon_model = canonical(brand, model)
    head = [p for p in (canon_brand, canon_model) if p and p != UNKNOWN]
    if len(head) == 2 and fold(head[0]) == fold(head[1]):
        head = head[:1]
    elif len(head) == 2:
        rebranded = _rebrand(canon_brand, canon_model)
        if rebranded is not None:
            head = [rebranded]
    tail = _trimmed(_unglued(version), _phrases(brand, model, canon_brand, canon_model))
    return " ".join(head + ([tail] if tail else [])) or NO_VEHICLE
