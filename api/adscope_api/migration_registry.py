"""Le registre des migrations : une suite d'instructions SQL par nom.

Extrait de `migrations.py`, que ce registre faisait grossir d'un lot à
l'autre — `apply_migrations` et `migrate` restent seuls dans ce dernier, avec
le journal (`LEDGER`) qui inscrit ce qui a été appliqué.
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
    # Le segment des comparables balaie `listings` sur marque + modèle + année :
    # un `Seq Scan` à 14,9 ms sur 46 000 lignes, mesuré avant l'index. Avec lui,
    # 0,8 ms — à 500 000 annonces le balayage seul aurait coûté 150 ms.
    ("006_listings_brand_model_year", (
        "CREATE INDEX IF NOT EXISTS ix_listings_brand_model_year"
        " ON listings (brand, model, year)",
    )),
    # Ce que le marchand suit, et le périmètre qu'il surveille. Deux tables
    # neuves : rien des 46 857 annonces enregistrées n'est touché. La cascade
    # part de la licence — un suivi n'a de sens que pour celui qui l'a posé —
    # et de l'annonce. L'index sur `listing_id` porte la colonne qui référence,
    # que Postgres n'indexe pas de lui-même : sans lui, supprimer une annonce
    # balaie `follows` en entier pour honorer la cascade.
    ("007_follows_and_families", (
        "CREATE TABLE IF NOT EXISTS follows ("
        " license_key_hash varchar(64) NOT NULL"
        "   REFERENCES licenses (key_hash) ON DELETE CASCADE,"
        " listing_id integer NOT NULL"
        "   REFERENCES listings (id) ON DELETE CASCADE,"
        " followed_at timestamptz NOT NULL,"
        " PRIMARY KEY (license_key_hash, listing_id))",
        "CREATE INDEX IF NOT EXISTS ix_follows_listing ON follows (listing_id)",
        "CREATE TABLE IF NOT EXISTS tracked_families ("
        " license_key_hash varchar(64) NOT NULL"
        "   REFERENCES licenses (key_hash) ON DELETE CASCADE,"
        " brand varchar(64) NOT NULL,"
        " model varchar(128) NOT NULL,"
        " PRIMARY KEY (license_key_hash, brand, model))",
    )),
    # Le compte, et de quoi s'y connecter sans jamais voir de clé. Trois tables
    # neuves et une colonne vide sur les quatre licences : les clés continuent
    # de passer, une licence sans compte reste une licence — c'est ce que porte
    # une machine. La migration ne rattache rien, un libellé n'est pas une
    # adresse : `scripts/attach_account.py` le fait. `SET NULL` sur la licence
    # parce que fermer un compte ne doit pas emporter l'historique de marché
    # qu'elle a produit. Les deux index portent une colonne qui référence, que
    # Postgres n'indexe pas seul : le plafond des liens, la cascade d'un compte.
    ("009_accounts", (
        "CREATE TABLE IF NOT EXISTS accounts (id serial PRIMARY KEY,"
        " email varchar(254) NOT NULL UNIQUE,"
        " created_at timestamptz NOT NULL DEFAULT now())",
        "ALTER TABLE licenses ADD COLUMN IF NOT EXISTS account_id integer"
        " REFERENCES accounts (id) ON DELETE SET NULL",
        "CREATE INDEX IF NOT EXISTS ix_licenses_account ON licenses (account_id)",
        "CREATE TABLE IF NOT EXISTS login_tokens (token_hash varchar(64) PRIMARY KEY,"
        " account_id integer NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,"
        " expires_at timestamptz NOT NULL, used_at timestamptz)",
        "CREATE INDEX IF NOT EXISTS ix_login_tokens_account"
        " ON login_tokens (account_id, expires_at)",
        "CREATE TABLE IF NOT EXISTS sessions (token_hash varchar(64) PRIMARY KEY,"
        " account_id integer NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,"
        " created_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL,"
        " expires_at timestamptz NOT NULL)",
        "CREATE INDEX IF NOT EXISTS ix_sessions_account ON sessions (account_id)",
    )),
    # La couche canonique, à côté des formes observées qui ne bougent pas :
    # trois colonnes vides sur les 52 925 annonces enregistrées, et l'index qui
    # sert le découpage par famille du site. La migration ne remplit rien — un
    # `UPDATE` de 52 925 lignes n'a pas sa place dans une transaction de
    # démarrage, et la table d'alias évoluera plus souvent que le schéma :
    # `scripts/recanonize.py` les remplit, par lots et autant de fois qu'on
    # veut. `search_text` est du `text` et non du `varchar` : marque + modèle +
    # version, observées et canoniques, n'ont pas de longueur utile à borner.
    ("010_listings_canonical", (
        "ALTER TABLE listings ADD COLUMN IF NOT EXISTS canon_brand varchar(64)",
        "ALTER TABLE listings ADD COLUMN IF NOT EXISTS canon_model varchar(128)",
        "ALTER TABLE listings ADD COLUMN IF NOT EXISTS search_text text",
        "CREATE INDEX IF NOT EXISTS ix_listings_canon"
        " ON listings (canon_brand, canon_model)",
    )),
)
