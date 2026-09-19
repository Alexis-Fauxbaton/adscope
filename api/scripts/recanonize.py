"""Recalcule la couche canonique des annonces déjà enregistrées.

    recanonize.py [--batch N] [--all]

Par défaut, ne reprend que les annonces dont `search_text` est vide — celles
que la migration 010 vient d'ouvrir, ou qu'une écriture n'a pas encore vues.
`--all` reprend tout : c'est ce qu'il faut après chaque évolution de
`shared/vehicle-aliases.json`, puisque les alias changent alors de résultat.

Rejouable dans les deux cas : la fonction est pure, réécrire la même valeur ne
coûte qu'un `UPDATE` de plus. Par lots parce que 52 925 lignes en une seule
transaction tiendraient le verrou bien plus longtemps que le crawl ne
l'accepte — chaque lot est commité pour lui-même, et une interruption laisse
le travail fait derrière elle.
"""
import sys

from sqlalchemy import select

from adscope_api.db import session_scope
from adscope_api.models import Listing
from adscope_api.taxonomy import derive


def recanonize(session, *, batch=2000, only_missing=True) -> int:
    """Rend le nombre de lignes effectivement changées.

    Le curseur avance sur `id` et non par `offset` : sous `--only-missing` les
    lignes traitées sortent du filtre à chaque lot, et un `offset` sauterait
    alors autant de lignes qu'il vient d'en réparer.
    """
    changed = 0
    last_id = 0
    while True:
        query = (
            select(Listing).where(Listing.id > last_id)
            .order_by(Listing.id).limit(batch)
        )
        if only_missing:
            query = query.where(Listing.search_text.is_(None))
        rows = session.scalars(query).all()
        if not rows:
            return changed
        for listing in rows:
            last_id = listing.id
            changed += derive(listing)
        session.commit()


if __name__ == "__main__":
    flags = sys.argv[1:]
    size = 2000
    if "--batch" in flags:
        size = int(flags[flags.index("--batch") + 1])
        flags = [f for f in flags if f != "--batch" and f != str(size)]
    if set(flags) - {"--all"}:
        sys.exit(__doc__)
    with session_scope() as session:
        total = recanonize(session, batch=size, only_missing="--all" not in flags)
    print(f"{total} annonces recanonisées")
