"""La mécanique de correspondance mot à mot d'`inference.infer_model`.

Extrait d'`inference.py` (découpage mécanique, sans changement de
comportement) : le découpage de la version en mots (`head`), la mesure d'une
tête reconnue (`span`) et la garde qui décide si le mot suivant prolonge un
modèle sans le changer (`_named`), qualificatif mesuré ou nombre pur d'une
tête de `modeles_crees` — décision d'Alexis du 2026-09-20.
"""

import re

from .spelling import fold

# Le souligné de leboncoin est un séparateur de mots, comme `naming._WORDS`.
_WORDS = re.compile(r"[\s_]+")
# Une cylindrée (« 4.4 », « 6.5 ») ou une puissance écrite en chiffres seuls
# (« 136 », « 350 ») — jamais un code moteur qui mêle lettres et chiffres
# (« 53e », « 218da »), celui-là reste hors de portée de cette règle.
_NUMERIC = re.compile(r"^\d+([.,]\d+)?$")


def head(version):
    """Les mots de la version, pliés, et l'indice où le modèle peut commencer.

    « Exclusive_C4 Picasso BlueHDi 150ch » : le modèle commence après le
    souligné, donc au mot 1. Sans souligné, au mot 0.
    """
    prefix, separator, _ = (version or "").partition("_")
    words = [fold(w) for w in _WORDS.split(version or "") if w]
    if not separator:
        return words, 0
    return words, len([w for w in _WORDS.split(prefix) if w])


def span(words, start, ply) -> int:
    """Combien de mots, à partir de `start`, forment exactement `ply`.

    `ply` est une clé de modèle privée de ses espaces. On accumule des mots
    entiers jusqu'à peser autant que lui, puis on exige l'égalité : « DS 3 »
    se reconnaît en deux mots, et « C3 » ne mord pas dans « C3500 » — un mot
    qui dépasse ne peut plus égaler. Même mécanique que `naming._span`, mais
    à une position imposée : ici le modèle est en tête ou n'est pas.
    """
    run = ""
    for count, word in enumerate(words[start:], start=1):
        run += word
        if len(run) >= len(ply):
            return count if run == ply else 0
    return 0


def _named(brand_key, words, start, known, known_models):
    """La tête reconnue à partir de `start`, ou `None` si rien n'est sûr.

    Tous les candidats partent du même mot : leurs plis sont donc préfixes
    l'un de l'autre, et le plus long les contient tous — « C3 Aircross »
    l'emporte sur « C3 » sans qu'aucune ambiguïté ne subsiste. Deux modèles
    distincts ne peuvent pas égaler la même suite de mots, la règle « s'il en
    reste deux, on renonce » n'a donc pas de cas à traiter ici.

    Le mot qui suit doit être un qualificatif mesuré — **sauf** s'il est
    purement numérique et que `best` est une tête de `modeles_crees` : décision
    d'Alexis du 2026-09-20, restreinte au fichier (`numeric_heads`). Le plus
    long l'ayant déjà emporté avant cette garde, un modèle numérique lui-même
    (« 512 ») ou dont un autre modèle du fichier commence par les mêmes mots
    (« Série 2 » / « Série 2 ActiveTourer ») n'en est jamais affecté.
    """
    spans = {m: n for m in known if (n := span(words, start, m.replace(" ", "")))}
    if not spans:
        return None
    best = max(spans, key=lambda m: spans[m])
    after = start + spans[best]
    after += span(words, after, best.replace(" ", ""))
    if after < len(words) and words[after] not in known_models.qualifiers:
        numeric_ok = ((brand_key, best) in known_models.numeric_heads
                      and _NUMERIC.match(words[after]))
        if not numeric_ok:
            return None
    return best
