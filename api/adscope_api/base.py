"""La racine des tables, à part.

`models` porte l'annonce et ce qui en dépend ; les tables de la mesure d'usage
suivent leur propre module. Les deux ont besoin de la même racine, et un fichier
de tables qui la prendrait sur l'autre les rendrait circulaires.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
