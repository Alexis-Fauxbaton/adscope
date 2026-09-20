"""Ce que `shared/vehicle-aliases.json` ajoute au vocabulaire des sites.

Le lot 3a ne savait déduire qu'un modèle qu'un site avait déjà classé
lui-même. C'était sa force — rien d'inventé — et sa limite : dans 1 219 cas
sur 1 361, la version nomme un modèle **réel** que ni leboncoin ni La Centrale
ne portent dans leur colonne modèle (« Range Rover Sport », « C5 Aircross »,
« GLE », « Grand Modus »). Le lot 3b les écrit dans le fichier partagé, relus
et chiffrés un par un, et ce module les verse dans le vocabulaire.

Trois apports, trois sections du fichier :

- **`modeles_crees`** — des modèles à part entière. Ils s'emploient exactement
  comme un modèle déclaré par un site : jamais à la place de celui-ci, jamais
  dans l'empreinte. `tete` dit la forme que la version écrit quand ce n'est pas
  le nom du modèle, `annee_max` pose une condition sur l'année du véhicule.
  Décision d'Alexis du 2026-09-20 : un mot **purement numérique** qui suit une
  de ces têtes la prolonge sans la changer (« XM 4.4 » reste XM) — restreint à
  ces têtes-ci, jamais au vocabulaire appris des sites (`numeric_heads`,
  `inference.infer_model`).
- **`carrosseries` et `finitions`** — les mots qui suivent un modèle sans en
  désigner un autre, là où la mesure du lot 3a ne les atteint pas (elle exige
  quatre couples marque/modèle, et « Spider » ne suit que la 488). Ils
  rejoignent les qualificatifs d'`inference.py`.
- **`alias_modeles`** — deux sites, deux noms pour la même voiture
  (« 812 Superfast » chez leboncoin, « 812 » chez La Centrale). Celui-là
  s'applique au modèle **déclaré**, dans `taxonomy.canonical`.

**Pas d'auto-renforcement** : ce fichier s'écrit à la main, à partir d'une
mesure, jamais à partir d'une déduction. Le rapport de santé propose les
candidats suivants (`data_health_models.frequent_unresolved_heads`), un humain
tranche.
"""

from collections import defaultdict

from .inference import KnownModels
from .spelling import DATA, fold


def _created():
    """(marque, tête) → (clé de modèle, année maximale) pour `modeles_crees`."""
    out = {}
    for brand, entries in DATA["modeles_crees"].items():
        for entry in entries:
            head = fold(entry.get("tete", entry["modele"]))
            out[(fold(brand), head)] = (fold(entry["modele"]), entry.get("annee_max"))
    return out


def _heads():
    """Clé de modèle → les têtes qui le nomment **autrement** que lui-même.

    « Xsara Picasso » s'écrit « Picasso » dans la version, « Fortwo » s'écrit
    « Smart ». `naming.label` en a besoin : sans elles, la version répéterait
    ce que le libellé vient de dire — « Citroën Xsara Picasso … Picasso 2.0
    HDi90 ».
    """
    out = {}
    for (_brand, head), (model, _limit) in _created().items():
        if head != model:
            out.setdefault(model, set()).add(head)
    return {model: frozenset(heads) for model, heads in out.items()}


def _words():
    return frozenset(
        fold(word) for section in ("carrosseries", "finitions") for word in DATA[section]
    )


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


CREATED = _created()
HEADS = _heads()
WORDS = _words()
MODEL_ALIASES = _model_aliases()
ALIAS_HEADS = _alias_heads()


def written_heads(model_key) -> frozenset:
    """Les autres écritures d'un modèle déduit, pour que `naming` les retire."""
    return HEADS.get(model_key, frozenset())


def with_catalog(known: KnownModels, *, created=None, words=None,
                  alias_heads=None) -> KnownModels:
    """Le vocabulaire des sites, augmenté du fichier. Rend un nouvel objet.

    Tenu à part de `model_vocabulary.vocabulary` — qui, lui, ne connaît que ce
    que les sites classent — pour que la frontière reste lisible : ce qui vient
    de la mesure d'un côté, ce qu'un humain a écrit de l'autre. Une tête déjà
    connue d'un site n'entre pas deux fois, mais son `tete`/`annee_max` compte
    quand même : « Picasso » **est** un modèle La Centrale, et c'est justement
    pour cela qu'il faut le renommer en « Xsara Picasso » sous condition
    d'année plutôt que le laisser voisiner avec le C4 Picasso.

    `alias_heads` (`_alias_heads`) rejoue la même mécanique pour la tête d'un
    `alias_modeles` : sans elle, un alias appliqué **avant** le comptage du
    vocabulaire (`model_vocabulary.load` passe par `taxonomy.key`) peut faire
    disparaître une tête à plusieurs mots que la déduction reconnaissait
    seule — jamais dans `numeric_heads`, la décision 1 ne vaut que pour
    `modeles_crees`.
    """
    created = CREATED if created is None else created
    words = WORDS if words is None else words
    alias_heads = ALIAS_HEADS if alias_heads is None else alias_heads
    by_brand = defaultdict(set)
    for brand, models in known.by_brand.items():
        by_brand[brand] |= set(models)
    renames, year_max = dict(known.renames), dict(known.year_max)
    for (brand, head), (model, limit) in {**alias_heads, **created}.items():
        by_brand[brand].add(head)
        if model != head:
            renames[(brand, head)] = model
        if limit is not None:
            year_max[(brand, head)] = limit
    return KnownModels(
        by_brand={brand: frozenset(models) for brand, models in by_brand.items()},
        qualifiers=known.qualifiers | words,
        renames=renames,
        year_max=year_max,
        numeric_heads=known.numeric_heads | frozenset(created.keys()),
    )
