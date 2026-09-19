"""La couche canonique : ce que les sites écrivent, ramené à une écriture.

`brand`, `model`, `version` restent **tels qu'observés** — l'empreinte véhicule
en dépend (`fingerprint.py`, parité JS/Python) et les comparables aussi. Ce
module ajoute une forme canonique à côté, jamais à la place.

Trois fonctions pures, pilotées par `shared/vehicle-aliases.json` :
`canonical` ramène (marque, modèle) à une écriture unique, `label` compose le
nom propre du véhicule, `search_text` rassemble ce sur quoi `?q=` cherche.

**La casse est celle du corpus, pas une typographie inventée.** Mettre une
capitale à chaque mot était tentant — leboncoin écrit Title Case pour 99,9 %
des annonces — mais aurait rendu « Amg Gt » (66 annonces), « Gtc4Lusso » (20),
« Xceed » (6), « Cx-30 », « Sq5 ». Le fichier retient donc l'orthographe la
plus fréquente de chaque pli : « GT » parce que 42 annonces l'écrivent ainsi
contre 8 « Gt », mais « Tt » parce que 25 l'emportent sur 1 « TT ». Un pli
inconnu du fichier se rend tel qu'observé — d'où « Citroen Ds3 » : sans tréma
ni capitales, c'est ce que la base porte."""

import json
import re
import unicodedata
from pathlib import Path

TABLE = Path(__file__).resolve().parents[2] / "shared" / "vehicle-aliases.json"

# Le seau « je ne sais pas » des sites. Il reste dans les colonnes canoniques —
# c'est un fait de classement, et 4 753 annonces le portent — mais il ne
# s'affiche jamais et ne se retire jamais d'une version.
UNKNOWN = "Autres"
NO_VEHICLE = "Véhicule non précisé"

_SPACES = re.compile(r"\s+")
# 3 350 versions sur les 17 451 qui en portent une collent la finition au modèle
# par un souligné : « Exclusive_C4 Picasso BlueHDi 150ch Exclusive S&S ». C'est
# leur séparateur de mots ; sans lui la répétition resterait affichée.
_WORDS = re.compile(r"[\s_]+")


def _load():
    data = json.loads(TABLE.read_text(encoding="utf-8"))
    spellings = data["orthographes"]
    aliases = {entry["marque"]: entry for entry in data["alias"]}
    return spellings["marques"], spellings["modeles"], aliases


_BRANDS, _MODELS, _ALIASES = _load()


def fold(value) -> str:
    """Minuscules, sans accents, espaces resserrés : le pli d'un libellé.

    C'est la seule normalisation du lot. Pas d'`unaccent` ni de `pg_trgm` :
    Postgres ne voit que du texte déjà plié, écrit par Python.
    """
    text = "" if value is None else str(value)
    decomposed = unicodedata.normalize("NFD", text)
    without_marks = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return _SPACES.sub(" ", without_marks.lower()).strip()


def _spelled(table, value):
    if value is None or not value.strip():
        return None
    return table.get(fold(value), _SPACES.sub(" ", value.strip()))


def canonical(brand, model):
    """(marque, modèle) sous une écriture unique, alias appliqués.

    L'alias remplace le modèle seulement quand le site n'en donne pas : une
    « Corvette / Autres » devient « Chevrolet / Corvette », une hypothétique
    « Corvette / Stingray » garderait son modèle.
    """
    canon_brand = _spelled(_BRANDS, brand)
    canon_model = _spelled(_MODELS, model)
    rule = _ALIASES.get(fold(brand))
    if rule is not None:
        canon_brand = rule["vers_marque"]
        if rule["vers_modele"] and canon_model in (None, UNKNOWN):
            canon_model = rule["vers_modele"]
    return canon_brand, canon_model


def _phrases(*values):
    """Les suites de mots à retirer d'une version, la plus longue d'abord.

    Par suite entière, jamais mot à mot : « Land Rover » ne doit pas manger le
    « Rover » de « Range Rover Sport ».
    """
    plies = {tuple(fold(v).split()) for v in values if v and fold(v) != fold(UNKNOWN)}
    return sorted((p for p in plies if p), key=len, reverse=True)


def _trimmed(version, phrases) -> str:
    words = [w for w in _WORDS.split(version or "") if w]
    plies = [fold(w) for w in words]
    kept, i = [], 0
    while i < len(words):
        run = next((p for p in phrases if tuple(plies[i:i + len(p)]) == p), None)
        if run is None:
            kept.append(words[i])
            i += 1
        else:
            i += len(run)
    return " ".join(kept)


def label(brand, model, version) -> str:
    """Le nom propre du véhicule, composé à un seul endroit.

    Marque et modèle canoniques, puis la version débarrassée de ce qu'elle
    répète. « Autres » ne s'affiche pas ; marque == modèle ne se répète pas.
    """
    canon_brand, canon_model = canonical(brand, model)
    head = [p for p in (canon_brand, canon_model) if p and p != UNKNOWN]
    if len(head) == 2 and fold(head[0]) == fold(head[1]):
        head = head[:1]
    tail = _trimmed(version, _phrases(brand, model, canon_brand, canon_model))
    return " ".join(head + ([tail] if tail else [])) or NO_VEHICLE


def search_text(brand, model, version) -> str:
    """Les mots sur lesquels `?q=` cherche : observés *et* canoniques, pliés.

    Dédoublonnés dans l'ordre d'apparition — « Corvette / Autres » et
    « Chevrolet / Corvette » se retrouvent ainsi toutes deux sur `q=corvette`,
    et « Citroën C3 » sur `q=citroen` comme sur `q=citroën`.
    """
    canon_brand, canon_model = canonical(brand, model)
    words = {}
    for value in (brand, model, version, canon_brand, canon_model):
        for word in fold(value).split():
            words[word] = None
    return " ".join(words)


def derive(listing) -> bool:
    """Pose les trois colonnes dérivées sur une annonce ; dit si ça a changé.

    Le seul endroit qui les écrit : `observations.record` à l'arrivée d'une
    observation, `scripts/recanonize.py` sur l'existant et à chaque évolution
    de la table d'alias. Ne connaît de l'annonce que cinq noms d'attributs —
    rien de l'ORM.
    """
    brand, model = canonical(listing.brand, listing.model)
    text = search_text(listing.brand, listing.model, listing.version)
    before = (listing.canon_brand, listing.canon_model, listing.search_text)
    listing.canon_brand, listing.canon_model, listing.search_text = brand, model, text
    return before != (brand, model, text)
