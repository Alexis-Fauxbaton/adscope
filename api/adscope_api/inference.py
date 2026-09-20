"""Le modèle déduit de la version, quand le site n'en donne pas.

4 875 annonces portent « Autres » pour modèle, dont 1 219 avec une version que
le lot 3a n'a pas su lire. Cette version nomme presque toujours un modèle réel
— « Land Rover / Autres / Range Rover Evoque 2.0 D 150ch R-Dynamic » —, mais un
modèle que **ni leboncoin ni La Centrale ne portent dans leur colonne modèle**.
Ce module le lit, sans jamais toucher aux champs observés, sans jamais
remplacer un modèle donné par le site, et sans entrer dans l'empreinte.

**Un modèle faux est pire qu'un modèle absent.** Les gardes, chacune posée par
la mesure (`.superpowers/recherche-lot3a.md`, `-lot3b.md`) :

1. **En tête.** leboncoin écrit « [Finition_]Modèle motorisation … ». Cherché
   n'importe où, « Mustang Fastback 5.0 V8 421ch **GT** BVA6 » devenait une
   Ford « GT » : 206 déductions de plus, presque toutes fausses. C'est aussi ce
   qui désamorce les modèles purement numériques — « Classe C **200** CDI » ne
   peut pas devenir une « 200 ».
2. **Mots entiers, espaces ignorés.** « C3 » ne mord pas dans « C3500 », et le
   modèle « Ds3 » reconnaît le « DS 3 » d'une version.
3. **Le mot qui suit doit prolonger le modèle sans le changer.** « Classe C
   **Break** 220 CDI » reste une Classe C ; « Range Rover **Sport** 3.0 TDV6 »
   n'est pas une Range Rover. Ces mots-là — les qualificatifs — viennent d'une
   mesure (un mot qui suit au moins quatre couples marque/modèle décrit une
   carrosserie) **et** du fichier partagé, qui y ajoute à la main ce que la
   mesure n'atteint pas : Spider, Roadster, Volante, GTC, Base.
4. **Un millésime devant la version n'est pas un modèle**, et **une version qui
   redit le modèle ne le change pas** : « 1973 Challenger Challenger » nomme
   une Challenger. Les deux règles sont étroites et mesurées — 94 versions
   commencent par un millésime, dont 81 Peugeot **2008** que la garde 1 trouve
   d'abord (le saut ne joue que si rien n'a été reconnu en tête) ; et aucune
   version du corpus ne redit un modèle déjà connu.
5. **Un mot purement numérique après un modèle du fichier le prolonge sans le
   changer** — décision d'Alexis du 2026-09-20 : « XM **4.4** V8 748ch »,
   « Purosangue **6.5** V12 » restent XM et Purosangue. Restreint aux modèles
   de `modeles_crees` (`known_models.numeric_heads`) : le vocabulaire *appris*
   des sites n'y a pas droit, c'est là que la mesure plaçait le risque
   (`.superpowers/recherche-lot3b.md`, §6.1). Une cylindrée ou une puissance
   s'écrit en chiffres seuls (« 4.4 », « 350 ») ; un code moteur qui mêle
   lettres et chiffres (« 53e », « 218da ») n'est pas concerné, et reste refusé
   comme avant.

La fonction est **pure et déterministe** : mêmes version, année et vocabulaire
→ même résultat. Le vocabulaire se bâtit dans `model_vocabulary.py`.
"""

import re
from dataclasses import dataclass, field

from .spelling import fold

# Le souligné de leboncoin est un séparateur de mots, comme `naming._WORDS`.
_WORDS = re.compile(r"[\s_]+")
_MODEL_YEAR = re.compile(r"^(19|20)\d\d$")
# Une cylindrée (« 4.4 », « 6.5 ») ou une puissance écrite en chiffres seuls
# (« 136 », « 350 ») — jamais un code moteur qui mêle lettres et chiffres
# (« 53e », « 218da »), celui-là reste hors de portée de cette règle.
_NUMERIC = re.compile(r"^\d+([.,]\d+)?$")


@dataclass(frozen=True)
class KnownModels:
    """Ce qu'une marque a le droit de voir déduire, et ce qui prolonge un nom.

    `by_brand` : clé de marque → **têtes** de version reconnues, celles que les
    sites déclarent comme celles que `shared/vehicle-aliases.json` crée.
    `qualifiers` : les mots qui peuvent suivre un modèle sans en désigner un
    autre — communs à toutes les marques.
    `renames` : (marque, tête) → le modèle que cette tête nomme vraiment, quand
    ce n'est pas elle-même (« Picasso » → « xsara picasso », « Smart » →
    « fortwo »).
    `year_max` : (marque, tête) → l'année au-delà de laquelle la tête ne prouve
    plus rien. Un Xsara Picasso ne se vend pas neuf après 2010, et « Picasso »
    seul redeviendrait ambigu avec le C4 Picasso.
    `numeric_heads` : (marque, tête) présentes ici ont le droit de voir un mot
    purement numérique les suivre sans que ce mot ne les change — seules les
    têtes de `modeles_crees` y entrent (`model_catalog.with_catalog`), jamais
    celles apprises des sites.
    """

    by_brand: dict
    qualifiers: frozenset
    renames: dict = field(default_factory=dict)
    year_max: dict = field(default_factory=dict)
    numeric_heads: frozenset = field(default_factory=frozenset)

    def of(self, brand_key) -> frozenset:
        return self.by_brand.get(brand_key, frozenset())

    def resolved(self, brand_key, head_key, year):
        """Le modèle qu'une tête reconnue nomme, ou `None` si sa condition
        n'est pas remplie. **Une année manquante ne remplit aucune
        condition** : mieux vaut ne rien poser que de parier sur l'âge."""
        limit = self.year_max.get((brand_key, head_key))
        if limit is not None and (year is None or year > limit):
            return None
        return self.renames.get((brand_key, head_key), head_key)


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


def infer_model(brand_key, version, known_models, year=None):
    """La clé du modèle que la version nomme, ou `None` si rien n'est sûr."""
    words, start = head(version)
    known = known_models.of(brand_key)
    if start >= len(words) or not known:
        return None
    found = _named(brand_key, words, start, known, known_models)
    if found is None and _MODEL_YEAR.match(words[start]) and start + 1 < len(words):
        found = _named(brand_key, words, start + 1, known, known_models)
    if found is None:
        return None
    return known_models.resolved(brand_key, found, year)
