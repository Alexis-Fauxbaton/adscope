"""L'orthographe d'affichage : ce que les sites écrivent, écrit correctement.

leboncoin met une capitale initiale à tout et n'accentue rien — « Bmw »,
« Citroen », « Ds », « Tt », « Serie 1 ». C'est sa typographie, pas le nom des
voitures. Ce module rend le nom : « BMW », « Citroën », « DS », « TT »,
« Série 1 ».

**Rien de ce qui s'écrit ici ne change un résultat.** L'orthographe est de
l'affichage ; la recherche et tout rapprochement comparent des formes repliées
(`fold`), et `fold("Citroën") == fold("Citroen")`. C'est ce qui permet de
corriger une écriture sans toucher à un seau — `taxonomy.key` le tient, un test
le prouve.

Deux mécaniques, pas une :

- les **marques** sont une liste fermée (83 plis en base, le site les sert en
  filtre), donc une table : `shared/vehicle-aliases.json`, section `marques` ;
- les **modèles** sont ouverts (709 et ce n'est pas fini), donc une **règle**
  déterministe — un mot qui contient un chiffre s'écrit en capitales : « C3 »,
  « SQ5 », « CX-30 », « 2CV », « XC90 » ; « 208 » reste « 208 » — et une liste
  d'**exceptions** versionnée pour ce que la règle ne sait pas : les sigles sans
  chiffre (« TT », « RCZ », « AX »), les accents (« Mégane », « Série 1 »), les
  espaces officiels (« DS 3 »), les casses mixtes (« GTC4Lusso », « MiTo ») et
  les minuscules officielles (« i30 », « ix20 »), que la règle mettrait en
  capitales.

Un modèle absent des exceptions et que la règle n'atteint pas se rend **tel
qu'observé** : mieux vaut la forme du site qu'une orthographe devinée.
"""

import json
import re
import unicodedata
from pathlib import Path

TABLE = Path(__file__).resolve().parents[2] / "shared" / "vehicle-aliases.json"

_SPACES = re.compile(r"\s+")
_DIGIT = re.compile(r"\d")


def _flattened(groups):
    """Les exceptions de modèle en une seule table.

    Le fichier les range par raison — dominance, accents, sigles, traits
    d'union, contre-la-règle — pour qu'on puisse les relire d'un coup d'œil.
    Les groupes n'ont pas de sens pour le code : il les aplatit. La clé « _ » de
    chaque groupe en est l'intertitre, jamais un pli.
    """
    return {
        ply: spelled
        for group in groups.values()
        for ply, spelled in group.items()
        if ply != "_"
    }


def _load():
    data = json.loads(TABLE.read_text(encoding="utf-8"))
    aliases = {entry["marque"]: entry for entry in data["alias"]}
    return data["marques"], _flattened(data["modeles"]), aliases


_BRANDS, _MODELS, ALIASES = _load()


def fold(value) -> str:
    """Minuscules, sans accents, espaces resserrés : le pli d'un libellé.

    C'est la seule normalisation du lot, et la seule forme sur laquelle on
    compare quoi que ce soit. Pas d'`unaccent` ni de `pg_trgm` : Postgres ne
    voit que du texte déjà plié, écrit par Python.
    """
    text = "" if value is None else str(value)
    decomposed = unicodedata.normalize("NFD", text)
    without_marks = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return _SPACES.sub(" ", without_marks.lower()).strip()


def _tidy(value):
    if value is None or not str(value).strip():
        return None
    return _SPACES.sub(" ", str(value).strip())


def brand(value):
    """La marque, écrite comme on l'écrit en France. Table, ou forme observée."""
    tidy = _tidy(value)
    return None if tidy is None else _BRANDS.get(fold(tidy), tidy)


def model(value):
    """Le modèle : l'exception si elle existe, sinon la règle du chiffre.

    La règle avant la forme observée et après les exceptions : « Ds3 » est une
    exception (« DS 3 », espace officiel), « Xc90 » relève de la règle
    (« XC90 »), « Captur » n'est ni l'un ni l'autre et reste « Captur ».
    """
    tidy = _tidy(value)
    if tidy is None:
        return None
    known = _MODELS.get(fold(tidy))
    if known is not None:
        return known
    return " ".join(w.upper() if _DIGIT.search(w) else w for w in tidy.split(" "))


def inferred(key):
    """L'écriture d'affichage d'un modèle **déduit** de la version.

    `model` rend la forme observée quand il ne connaît pas le pli — c'est la
    règle du lot 1, et elle suppose qu'on a une forme observée. D'un modèle
    déduit on n'a que la clé repliée (« auris », « classe c », « s-max ») :
    la rendre telle quelle mettrait « Toyota auris » en tête d'un libellé.
    D'où la capitale initiale de chaque mot **avant** de repasser par `model`,
    qui garde le dernier mot : l'exception du fichier si elle existe
    (« megane » → « Mégane », « s-max » → « S-Max »), sinon la règle du
    chiffre. `title()` et non `capitalize()`, pour que le trait d'union
    compte comme une frontière de mot.
    """
    return None if key is None else model(str(key).title())
