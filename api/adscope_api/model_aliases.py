"""La section `alias_modeles` de `shared/vehicle-aliases.json`.

Extrait de `model_catalog.py` (découpage mécanique, sans changement de
comportement) : deux sites, deux noms pour la même voiture (« 812 Superfast »
chez leboncoin, « 812 » chez La Centrale). `MODEL_ALIASES` s'applique au
modèle **déclaré**, dans `taxonomy.canonical` ; `ALIAS_HEADS` rejoue la même
mécanique côté tête de version, pour `model_catalog.with_catalog`.
"""

from .spelling import DATA, fold


def _model_aliases():
    """(marque canonique, modèle déclaré) → (écriture du modèle canonique,
    année maximale ou `None`).

    L'année maximale est la même condition que celle d'un modèle créé, posée
    sur un modèle **déclaré** cette fois : les 14 Citroën « Picasso » que La
    Centrale déclare ne deviennent des Xsara Picasso que jusqu'en 2010, pour
    la même raison qu'une tête « Picasso » déduite — au-delà, le C4 Picasso
    existe aussi. Absente du fichier, la condition vaut `None` : l'alias
    s'applique toujours, comme les trois autres du lot 3b.
    """
    return {(fold(rule["marque"]), fold(rule["de"])): (rule["vers"], rule.get("annee_max"))
            for rule in DATA["alias_modeles"]}


def _alias_heads():
    """(marque, tête déclarée repliée) → (modèle cible replié, année max),
    pour que la tête d'un alias de modèle reste une tête reconnue de la
    déduction.

    `model_vocabulary.load` bâtit le vocabulaire sur `taxonomy.key`, qui
    applique déjà `alias_modeles` : une fois « Grandland X » fondu dans le
    seau « Grandland », le mot « x » ne suit plus jamais « grandland » assez
    souvent pour rester un qualificatif mesuré, et la tête à deux mots
    « grandland x » disparaît du vocabulaire de la déduction — perdant la
    seule annonce « Autres » dont la version commence ainsi. La réinjecter ici
    restaure exactement le comportement d'avant l'alias. **Jamais** versée
    dans `numeric_heads` : la décision 1 ne vaut que pour `modeles_crees`.
    """
    return {(brand, head): (fold(model), limit)
            for (brand, head), (model, limit) in _model_aliases().items()}


MODEL_ALIASES = _model_aliases()
ALIAS_HEADS = _alias_heads()
