"""Migrations de schéma.

`create_all` ne crée que ce qui manque : il ne touche jamais à une table déjà
présente. La base de développement porte des milliers d'annonces réelles, la
détruire pour la recréer n'est pas une option — d'où ce registre.

Chaque migration est une suite d'instructions idempotentes, appliquée une fois
et inscrite dans `schema_migrations`. Le double filet — instructions
idempotentes *et* registre — permet de rattraper une base déjà modifiée à la
main sans qu'elle diverge.

Le registre lui-même (`LEDGER`, `MIGRATIONS`) est dans `migration_registry` :
il grossit d'un lot à l'autre, et ne mérite pas de faire grossir avec lui la
logique d'application qui suit.
"""

from sqlalchemy import text

from .migration_registry import LEDGER, MIGRATIONS

__all__ = ["MIGRATIONS", "apply_migrations", "migrate"]


def apply_migrations(connection) -> list[str]:
    """Applique les migrations en attente ; rend celles qui l'ont été."""
    connection.execute(text(LEDGER))
    done = set(connection.scalars(text("SELECT name FROM schema_migrations")))
    applied = []
    for name, statements in MIGRATIONS:
        if name in done:
            continue
        for statement in statements:
            connection.execute(text(statement))
        connection.execute(
            text("INSERT INTO schema_migrations (name) VALUES (:name)"), {"name": name}
        )
        applied.append(name)
    return applied


def migrate(engine) -> list[str]:
    with engine.begin() as connection:
        return apply_migrations(connection)
