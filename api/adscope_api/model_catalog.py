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
    """(marque canonique, modèle déclaré) → l'écriture du modèle canonique."""
    return {(fold(rule["marque"]), fold(rule["de"])): rule["vers"]
            for rule in DATA["alias_modeles"]}


CREATED = _created()
HEADS = _heads()
WORDS = _words()
MODEL_ALIASES = _model_aliases()


def written_heads(model_key) -> frozenset:
    """Les autres écritures d'un modèle déduit, pour que `naming` les retire."""
    return HEADS.get(model_key, frozenset())


def with_catalog(known: KnownModels, *, created=None, words=None) -> KnownModels:
    """Le vocabulaire des sites, augmenté du fichier. Rend un nouvel objet.

    Tenu à part de `model_vocabulary.vocabulary` — qui, lui, ne connaît que ce
    que les sites classent — pour que la frontière reste lisible : ce qui vient
    de la mesure d'un côté, ce qu'un humain a écrit de l'autre. Une tête déjà
    connue d'un site n'entre pas deux fois, mais son `tete`/`annee_max` compte
    quand même : « Picasso » **est** un modèle La Centrale, et c'est justement
    pour cela qu'il faut le renommer en « Xsara Picasso » sous condition
    d'année plutôt que le laisser voisiner avec le C4 Picasso.
    """
    created = CREATED if created is None else created
    words = WORDS if words is None else words
    by_brand = defaultdict(set)
    for brand, models in known.by_brand.items():
        by_brand[brand] |= set(models)
    renames, year_max = dict(known.renames), dict(known.year_max)
    for (brand, head), (model, limit) in created.items():
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
    )
