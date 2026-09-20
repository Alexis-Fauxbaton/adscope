"""Les filtres de famille et de texte de `/v1/market`, posés sur la couche
canonique de `taxonomy.py`.

`brand` et `model` restent des filtres **exacts** : un seau, pas une
ressemblance. Mais l'égalité porte sur la **clé** canonique — l'écriture
canonique repliée, `taxonomy.key` — et la saisie passe par la même fonction que
l'écriture. Donc les deux côtés sont pliés : `brand=RENAULT`, `brand=Renault`,
`brand=renault` désignent le même seau, `brand=Citroen` et `brand=Citroën` aussi
— y compris pour les milliers de modèles qui ne figurent dans aucune table
(`model=captur` sert les « Captur »), et y compris après une correction
d'orthographe, qui ne déplace aucune clé. `brand=Corvette` désigne les
Chevrolet, par l'alias. Le modèle ne se déduit jamais de la marque seule :
`canonical` pose « Corvette » en modèle quand on lui donne la marque
« Corvette », mais on ne s'en sert que si le client a lui-même demandé un
modèle.

`q` est la recherche tolérante : la saisie est pliée (minuscules, sans
accents), découpée en mots, et **chaque mot** doit se retrouver dans
`search_text`, dans n'importe quel ordre. Un `LIKE` par mot, donc, et pas un
`LIKE` sur la phrase entière : « rover land » trouve autant que « land rover ».
`%` et `_` saisis sont du texte, pas des jokers — sans échappement, `?q=%`
rendrait la base entière.
"""

from .taxonomy import fold, key

_LIKE_SPECIALS = ("\\", "%", "_")


def _escaped(word) -> str:
    for char in _LIKE_SPECIALS:
        word = word.replace(char, "\\" + char)
    return word


def family(query, brand_column, model_column, brand, model, exclude=frozenset()):
    """`exclude` saute l'un des deux filtres sans changer la clé qu'on en
    tire : `facet_query.py` s'en sert pour compter la facette « brands » sans
    son propre filtre `brand`, tout en gardant `model` s'il est posé."""
    brand_key, model_key = key(brand, model)
    if brand and "brand" not in exclude:
        query = query.where(brand_column == brand_key)
    if model and "model" not in exclude:
        query = query.where(model_column == model_key)
    return query


def text(query, column, q):
    for word in fold(q).split():
        query = query.where(column.like(f"%{_escaped(word)}%", escape="\\"))
    return query
