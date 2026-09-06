"""Migrations de schéma.

`create_all` ne crée que ce qui manque : il ne touche jamais à une table déjà
présente. La base de développement porte des milliers d'annonces réelles, la
détruire pour la recréer n'est pas une option — d'où ce registre.

Chaque migration est une suite d'instructions idempotentes, appliquée une fois
et inscrite dans `schema_migrations`. Le double filet — instructions
idempotentes *et* registre — permet de rattraper une base déjà modifiée à la
main sans qu'elle diverge.
"""

from sqlalchemy import text

LEDGER = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    name       varchar(64) PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
)
"""

# La clé étrangère ne s'ajoute pas en `IF NOT EXISTS` : on absorbe le doublon.
ADD_LICENSE_FK = """
DO $$ BEGIN
    ALTER TABLE price_points
        ADD CONSTRAINT price_points_license_key_hash_fkey
        FOREIGN KEY (license_key_hash) REFERENCES licenses (key_hash)
        ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
"""

MIGRATIONS = (
    ("001_price_points_license", (
        "ALTER TABLE price_points ADD COLUMN IF NOT EXISTS license_key_hash varchar(64)",
        ADD_LICENSE_FK,
        "CREATE INDEX IF NOT EXISTS ix_price_points_license"
        " ON price_points (license_key_hash, observed_at)",
    )),
)


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
