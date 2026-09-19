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

from .inference import infer_model
from .mentions import version_confirms
from .spelling import ALIASES, brand as spelled_brand, fold, model as spelled_model

# Le seau « je ne sais pas » des sites. Il reste dans les colonnes canoniques —
# c'est un fait de classement, et 4 801 annonces le portent — mais il ne
# s'affiche jamais et ne se retire jamais d'une version.
UNKNOWN = "Autres"
NO_VEHICLE = "Véhicule non précisé"

# D'où vient `canon_model` (`listings.canon_model_source`) : du site, ou déduit
# de la version (`inference.py`). NULL = modèle non précisé, ni donné ni déduit.
FROM_SITE = "site"
FROM_VERSION = "version"


def canonical(brand, model, version=None):
    """(marque, modèle) sous l'écriture d'affichage, alias appliqués.

    L'alias remplace le modèle seulement quand le site n'en donne pas : une
    « Corvette / Autres » devient « Chevrolet / Corvette », une hypothétique
    « Corvette / Stingray » garderait son modèle. Quand le fichier marque
    l'alias `vers_modele_sous_reserve_de_version`, poser le modèle exige en
    plus que la version ne le contredise pas (`mentions.version_confirms`) : les
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
            if not conditional or version_confirms(version, posed_model):
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


def search_text(brand, model, version, inferred=None) -> str:
    """Les mots sur lesquels `?q=` cherche : observés *et* canoniques, pliés.

    Dédoublonnés dans l'ordre d'apparition — « Corvette / Autres » et
    « Chevrolet / Corvette » se retrouvent ainsi toutes deux sur `q=corvette`,
    et le modèle « Ds3 » sur `q=ds3` comme sur `q=ds 3`. Le modèle déduit s'y
    ajoute pour la même raison : la version porte bien ses mots, mais pas
    forcément son découpage — un modèle déduit « ds 3 » vient d'une version
    qui peut écrire « DS3 ».
    """
    canon_brand, canon_model = canonical(brand, model, version)
    words = {}
    for value in (brand, model, version, canon_brand, canon_model, inferred):
        # Le souligné de leboncoin est un séparateur de mots, comme dans
        # `naming._WORDS` : sans lui, 3 350 annonces porteraient « exclusive_c4 »
        # pour un mot, et `?q=_` en rendrait 3 350 au lieu de rien.
        for word in fold(value).replace("_", " ").split():
            words[word] = None
    return " ".join(words)


def inferred_model(canon_model, canon_model_source):
    """Le modèle **déduit** d'une annonce, ou `None` s'il vient du site.

    `market_items` et `feed_query` en ont besoin pour composer le libellé, et
    partent l'un d'une ligne SQL, l'autre d'un objet ORM : la condition tient
    ici plutôt qu'écrite deux fois.
    """
    return canon_model if canon_model_source == FROM_VERSION else None


def derive(listing, known=None) -> bool:
    """Pose les colonnes dérivées sur une annonce ; dit si ça a changé.

    Le seul endroit qui les écrit : `observations.record` à l'arrivée d'une
    observation, `scripts/recanonize.py` sur l'existant et à chaque évolution
    de la table. Ne connaît de l'annonce que six noms d'attributs — rien de
    l'ORM.

    La déduction ne comble que le vide : un modèle donné par le site (ou posé
    par un alias de marque) n'est jamais remplacé, et sans vocabulaire
    (`known is None`) rien n'est déduit du tout. Elle n'écrit que cette
    couche : `brand`, `model`, `version` et `fingerprint` ne bougent pas.
    """
    brand, model = key(listing.brand, listing.model, listing.version)
    source = None if model in (None, fold(UNKNOWN)) else FROM_SITE
    inferred = None
    if source is None and known is not None:
        inferred = infer_model(brand, listing.version, known)
        if inferred is not None:
            model, source = inferred, FROM_VERSION
    text = search_text(listing.brand, listing.model, listing.version, inferred)
    after = (brand, model, source, text)
    before = (listing.canon_brand, listing.canon_model,
              listing.canon_model_source, listing.search_text)
    (listing.canon_brand, listing.canon_model,
     listing.canon_model_source, listing.search_text) = after
    return before != after
