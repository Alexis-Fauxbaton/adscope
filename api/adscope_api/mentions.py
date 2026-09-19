"""Ce qu'une version **nomme** — en mots entiers, jamais en sous-chaîne.

Extrait de `taxonomy.py`, que la déduction du lot 3a faisait passer les 150
lignes. Deux clients, deux questions voisines : l'alias de marque demande si
la version *confirme* le modèle qu'il s'apprête à poser (`canonical`), et le
rapport de santé demande si elle en nomme un *autre* que celui déclaré
(`data_health_fields`).

La déduction du modèle, elle, ne passe pas par ici : elle n'accepte le modèle
qu'en tête de version, et c'est `inference.py` qui la porte.
"""

import re

from .spelling import fold

# Le souligné de leboncoin est un séparateur de mots, comme `naming._WORDS`.
_ALIAS_WORDS = re.compile(r"[\s_]+")


def _words(text) -> list[str]:
    return [fold(w) for w in _ALIAS_WORDS.split(text or "") if w]


def mentions(version, model) -> bool:
    """`version` nomme-t-elle `model`, en mots entiers (replié, souligné =
    espace), jamais une sous-chaîne — sinon « Corvette C6 » mordrait dans un
    modèle qui ne serait que « C6 »."""
    words, target = _words(version), _words(model)
    span = len(target)
    return any(words[i:i + span] == target for i in range(len(words) - span + 1))


def version_confirms(version, posed_model) -> bool:
    """La condition de `vers_modele_sous_reserve_de_version` : vide, ou
    `posed_model` présent en mots entiers.

    Une version qui ne dit rien ne contredit personne. Une version qui dit
    autre chose (« Camaro » pour l'alias qui pose « Corvette ») ne le confirme
    pas.
    """
    return not _words(version) or mentions(version, posed_model)


def version_names_model(version, model) -> bool:
    """`version` nomme-t-elle `model`, en mots entiers. Vide, elle ne nomme
    rien — à la différence de `version_confirms`, qui sert l'alias et laisse
    passer une version silencieuse. Sert
    `data_health_queries.version_names_another_model` : la version qui nomme
    un autre modèle connu de la marque que celui déclaré."""
    return bool(_words(version)) and mentions(version, model)
