"""Les deux fragments SQL que `migration_registry` ne peut pas écrire en une
ligne : le journal des migrations, et la clé étrangère de la 001.

Sortis du registre, qui passait les 150 lignes au lot 3a. Rien ici ne change
jamais — c'est justement pourquoi ces lignes n'ont pas à grossir avec la liste
des migrations.
"""

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
