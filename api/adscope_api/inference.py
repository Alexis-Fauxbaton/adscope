"""Le modèle déduit de la version, quand le site n'en donne pas.

4 801 annonces (9,0 %) portent « Autres » pour modèle, dont 1 349 avec une
version. Cette version nomme souvent un modèle : « Land Rover / Autres /
Range Rover Evoque 2.0 D 150ch R-Dynamic ». Ce module le lit — sans jamais
toucher aux champs observés, sans jamais remplacer un modèle donné par le
site, et sans entrer dans l'empreinte véhicule.

**Un modèle faux est pire qu'un modèle absent.** Trois gardes, chacune posée
par la mesure et non par un avis (`.superpowers/recherche-lot3a.md`) :

1. **En tête.** leboncoin écrit « [Finition_]Modèle motorisation … » : le
   modèle est le premier nom de la version, après l'éventuel préfixe de
   finition collé par un souligné. Cherché n'importe où, « Mustang Fastback
   5.0 V8 421ch **GT** BVA6 » devenait une Ford « GT » et « **Grand** Scenic
   1.9 dCi » une Renault « Scenic » : 206 déductions de plus, presque toutes
   fausses. C'est aussi ce qui désamorce les modèles purement numériques —
   « Mercedes Classe C **200** CDI » ne peut plus devenir une « 200 ».
2. **Mots entiers, espaces ignorés.** « C3 » ne mord pas dans « C3500 », et le
   modèle « Ds3 » reconnaît le « DS 3 » d'une version.
3. **Le mot qui suit doit prolonger le modèle sans le changer.** « Classe C
   **Break** 220 CDI » reste une Classe C ; « Range Rover **Sport** 3.0 TDV6 »
   n'est pas une Range Rover. Ce qui sépare les deux n'est pas une liste
   écrite à la main mais une mesure : un mot qui suit au moins quatre couples
   (marque, modèle) différents dans les annonces classées **par le site** est
   une carrosserie ou une motorisation ; un mot attaché à un seul modèle est
   un nom de modèle composé que la taxonomie du site n'a pas, et il interdit
   la déduction. Sans cette garde, 147 des 263 déductions étaient fausses.

La fonction est **pure et déterministe** : même version + même vocabulaire →
même résultat. Le vocabulaire se bâtit dans `model_vocabulary.py`.
"""

import re
from dataclasses import dataclass

from .spelling import fold

# Le souligné de leboncoin est un séparateur de mots, comme `naming._WORDS`.
_WORDS = re.compile(r"[\s_]+")


@dataclass(frozen=True)
class KnownModels:
    """Ce qu'une marque a le droit de voir déduire, et ce qui prolonge un nom.

    `by_brand` : clé de marque → clés de modèle venues du site.
    `qualifiers` : les mots qui peuvent suivre un modèle sans en désigner un
    autre — communs à toutes les marques, mesurés sur tout le corpus.
    """

    by_brand: dict
    qualifiers: frozenset

    def of(self, brand_key) -> frozenset:
        return self.by_brand.get(brand_key, frozenset())


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


def infer_model(brand_key, version, known_models):
    """La clé du modèle que la version nomme, ou `None` si rien n'est sûr.

    Tous les candidats partent du même mot : leurs plis sont donc préfixes
    l'un de l'autre, et le plus long les contient tous — « C3 Aircross »
    l'emporte sur « C3 » sans qu'aucune ambiguïté ne subsiste. Deux modèles
    distincts ne peuvent pas égaler la même suite de mots, la règle « s'il en
    reste deux, on renonce » n'a donc pas de cas à traiter ici : c'est
    l'ancrage en tête qui l'a rendue sans objet.
    """
    words, start = head(version)
    known = known_models.of(brand_key)
    if start >= len(words) or not known:
        return None
    spans = {m: n for m in known if (n := span(words, start, m.replace(" ", "")))}
    if not spans:
        return None
    best = max(spans, key=lambda m: spans[m])
    after = start + spans[best]
    if after < len(words) and words[after] not in known_models.qualifiers:
        return None
    return best
