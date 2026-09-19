"""Les filtres de famille et de texte de `/v1/market`, posés sur la couche
canonique de `taxonomy.py`.

`brand` et `model` restent des filtres **exacts** : un seau, pas une
ressemblance. Ils portent désormais sur `canon_brand` / `canon_model`, et la
saisie passe par la même `canonical` que l'écriture — `brand=RENAULT` et
`brand=Renault` désignent le même seau, `brand=Corvette` désigne les Chevrolet.
Le modèle ne se déduit jamais de la marque seule : `canonical` pose « Corvette »
en modèle quand on lui donne la marque « Corvette », mais on ne s'en sert que
si le client a lui-même demandé un modèle.

`q` est la recherche tolérante : la saisie est pliée (minuscules, sans
accents), découpée en mots, et **chaque mot** doit se retrouver dans
`search_text`, dans n'importe quel ordre. Un `LIKE` par mot, donc, et pas un
`LIKE` sur la phrase entière : « rover land » trouve autant que « land rover ».
`%` et `_` saisis sont du texte, pas des jokers — sans échappement, `?q=%`
rendrait la base entière.
"""

from .taxonomy import canonical, fold

_LIKE_SPECIALS = ("\\", "%", "_")


def _escaped(word) -> str:
    for char in _LIKE_SPECIALS:
        word = word.replace(char, "\\" + char)
    return word


def family(query, brand_column, model_column, brand, model):
    canon_brand, canon_model = canonical(brand, model)
    if brand:
        query = query.where(brand_column == canon_brand)
    if model:
        query = query.where(model_column == canon_model)
    return query


def text(query, column, q):
    for word in fold(q).split():
        query = query.where(column.like(f"%{_escaped(word)}%", escape="\\"))
    return query
