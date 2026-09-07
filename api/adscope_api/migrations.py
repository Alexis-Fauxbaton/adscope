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
    # Le vendeur professionnel : deux colonnes vides sur les annonces déjà
    # enregistrées, et l'index qui sert l'agrégation par boutique.
    ("002_listings_seller", (
        "ALTER TABLE listings ADD COLUMN IF NOT EXISTS seller_id varchar(32)",
        "ALTER TABLE listings ADD COLUMN IF NOT EXISTS seller_name varchar(128)",
        "CREATE INDEX IF NOT EXISTS ix_listings_seller ON listings (site, seller_id)",
    )),
    # Un émetteur automatique n'est pas un utilisateur. La colonne s'ajoute ;
    # qui elle marque ne se devine pas. Le libellé n'est pas une identité — la
    # base porte deux licences homonymes, et l'émetteur qui produit sept mille
    # lignes par jour ne s'appelle pas « crawler » : `UPDATE ... WHERE label =
    # 'crawler'` marquait au hasard. `scripts/mark_automated.py` la met sur une
    # licence désignée par sa clé.
    ("003_licenses_automated", (
        "ALTER TABLE licenses ADD COLUMN IF NOT EXISTS automated boolean"
        " NOT NULL DEFAULT false",
    )),
    # L'échantillonnage dans le temps : un point de prix peut désormais dire
    # « inchangé cette semaine ». Les 12 918 points déjà enregistrés l'ont tous
    # été sur un changement — le défaut les laisse tels quels.
    ("004_price_points_confirmation", (
        "ALTER TABLE price_points ADD COLUMN IF NOT EXISTS confirmation boolean"
        " NOT NULL DEFAULT false",
    )),
    # La revisite par fiche : deux colonnes vides sur les 43 457 annonces
    # enregistrées. `absent_since` porte la première constatation d'absence, en
    # attente de la seconde ; `last_revisit_at` dit quand la file a servi la
    # fiche, et c'est le dénominateur du garde-fou de flotte — sans lui, une
    # refonte de gabarit s'écrirait en base sans que rien ne la compte.
    ("005_listings_revisit", (
        "ALTER TABLE listings ADD COLUMN IF NOT EXISTS absent_since timestamptz",
        "ALTER TABLE listings ADD COLUMN IF NOT EXISTS last_revisit_at timestamptz",
        "CREATE INDEX IF NOT EXISTS ix_listings_revisit ON listings (last_revisit_at)",
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
