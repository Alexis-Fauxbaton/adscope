"""La couche canonique : ce que les sites écrivent, ramené à une écriture.

`brand`, `model`, `version` restent **tels qu'observés** — l'empreinte véhicule
en dépend (`fingerprint.py`, parité JS/Python) et les comparables aussi. Ce
module ajoute une forme canonique à côté, jamais à la place.

Deux formes canoniques, et c'est la clé du lot : `canonical` donne
l'**orthographe d'affichage** (`spelling.py` : « Citroën », « DS 3 »), `key`
donne la **clé de rapprochement**, qui est cette orthographe **repliée**
(« citroen », « ds 3 »). Ce sont les clés qui vont en base et que les filtres
comparent, des deux côtés. Corriger une orthographe ne peut donc pas déplacer
une annonce : `fold("Citroën") == fold("Citroen")`, la clé ne bouge pas. Un
test le tient.

`search_text` rassemble ce sur quoi `?q=` cherche ; `naming.label` compose le
nom propre du véhicule.
"""

import re

from .spelling import ALIASES, brand as spelled_brand, fold, model as spelled_model

# Le seau « je ne sais pas » des sites. Il reste dans les colonnes canoniques —
# c'est un fait de classement, et 4 762 annonces le portent — mais il ne
# s'affiche jamais et ne se retire jamais d'une version.
UNKNOWN = "Autres"
NO_VEHICLE = "Véhicule non précisé"

# Le souligné de leboncoin est un séparateur de mots, comme `naming._WORDS`.
_ALIAS_WORDS = re.compile(r"[\s_]+")


def _version_confirms(version, posed_model) -> bool:
    """La condition de `vers_modele_sous_reserve_de_version` : vide, ou
    `posed_model` présent en mots entiers (replié, souligné = espace).

    Une version qui ne dit rien ne contredit personne. Une version qui dit
    autre chose (« Camaro » pour l'alias qui pose « Corvette ») ne le confirme
    pas — mots entiers, jamais une sous-chaîne, sinon « Corvette C6 » mordrait
    dans un modèle qui ne serait que « C6 ».
    """
    words = [fold(w) for w in _ALIAS_WORDS.split(version or "") if w]
    if not words:
        return True
    target = [fold(w) for w in _ALIAS_WORDS.split(posed_model) if w]
    span = len(target)
    return any(words[i:i + span] == target for i in range(len(words) - span + 1))


def canonical(brand, model, version=None):
    """(marque, modèle) sous l'écriture d'affichage, alias appliqués.

    L'alias remplace le modèle seulement quand le site n'en donne pas : une
    « Corvette / Autres » devient « Chevrolet / Corvette », une hypothétique
    « Corvette / Stingray » garderait son modèle. Quand le fichier marque
    l'alias `vers_modele_sous_reserve_de_version`, poser le modèle exige en
    plus que la version ne le contredise pas (`_version_confirms`) : les
    Camaro que leboncoin range aussi dans le seau « Corvette / Autres » gagnent
    la marque, jamais le modèle — un modèle faux est pire qu'un modèle absent.
    """
    canon_brand, canon_model = spelled_brand(brand), spelled_model(model)
    rule = ALIASES.get(fold(brand))
    if rule is not None:
        canon_brand = rule["vers_marque"]
        posed_model = rule.get("vers_modele")
        if posed_model and canon_model in (None, UNKNOWN):
            conditional = rule.get("vers_modele_sous_reserve_de_version", False)
            if not conditional or _version_confirms(version, posed_model):
                canon_model = posed_model
    return canon_brand, canon_model


def key(brand, model, version=None):
    """La clé de rapprochement : la forme canonique **repliée**.

    C'est ce que `listings.canon_brand` / `canon_model` portent et ce que
    `search.family` compare — insensible à la casse et aux accents des deux
    côtés. L'orthographe affichée ne se stocke pas : elle se recalcule par
    `naming.label`, et la changer ne change aucun seau.
    """
    return tuple(None if v is None else fold(v) for v in canonical(brand, model, version))


def search_text(brand, model, version) -> str:
    """Les mots sur lesquels `?q=` cherche : observés *et* canoniques, pliés.

    Dédoublonnés dans l'ordre d'apparition — « Corvette / Autres » et
    « Chevrolet / Corvette » se retrouvent ainsi toutes deux sur `q=corvette`,
    et le modèle « Ds3 » sur `q=ds3` comme sur `q=ds 3`.
    """
    canon_brand, canon_model = canonical(brand, model, version)
    words = {}
    for value in (brand, model, version, canon_brand, canon_model):
        # Le souligné de leboncoin est un séparateur de mots, comme dans
        # `naming._WORDS` : sans lui, 3 350 annonces porteraient « exclusive_c4 »
        # pour un mot, et `?q=_` en rendrait 3 350 au lieu de rien.
        for word in fold(value).replace("_", " ").split():
            words[word] = None
    return " ".join(words)


def derive(listing) -> bool:
    """Pose les trois colonnes dérivées sur une annonce ; dit si ça a changé.

    Le seul endroit qui les écrit : `observations.record` à l'arrivée d'une
    observation, `scripts/recanonize.py` sur l'existant et à chaque évolution
    de la table. Ne connaît de l'annonce que cinq noms d'attributs — rien de
    l'ORM.
    """
    brand, model = key(listing.brand, listing.model, listing.version)
    text = search_text(listing.brand, listing.model, listing.version)
    before = (listing.canon_brand, listing.canon_model, listing.search_text)
    listing.canon_brand, listing.canon_model, listing.search_text = brand, model, text
    return before != (brand, model, text)
