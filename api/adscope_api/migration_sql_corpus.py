"""Le SQL de la migration 016 : le lot Corpus, deux tables neuves.

Sorti de `migration_registry.py`, à sa limite de longueur — même raison que
`migration_sql_alerts.py` au lot F1. Les colonnes suivent exactement
`corpus_models.py` : `test_migrations.py` compare le schéma qu'elles
produisent à celui de `create_all`.
"""

CORPUS_TABLES = (
    # Le marqueur « à vérifier », transitoire : une observation automated le
    # lève pour l'annonce (`recheck.clear`). La clé primaire à trois colonnes
    # fait qu'un même champ réclamé par deux marchands les juge tous les deux.
    "CREATE TABLE IF NOT EXISTS rechecks ("
    " listing_id integer NOT NULL REFERENCES listings (id) ON DELETE CASCADE,"
    " field varchar(16) NOT NULL,"
    " license_key_hash varchar(64) NOT NULL"
    "   REFERENCES licenses (key_hash) ON DELETE CASCADE,"
    " merchant_value varchar(64),"
    " observed_at timestamptz NOT NULL,"
    " PRIMARY KEY (listing_id, field, license_key_hash))",
    # Le journal, qui se garde sans borne. `ON DELETE SET NULL` sur la licence,
    # comme `price_points` : supprimer un compte n'efface pas la preuve qu'il
    # a produite.
    "CREATE TABLE IF NOT EXISTS divergences ("
    " id serial PRIMARY KEY,"
    " listing_id integer NOT NULL REFERENCES listings (id) ON DELETE CASCADE,"
    " license_key_hash varchar(64) REFERENCES licenses (key_hash) ON DELETE SET NULL,"
    " field varchar(16) NOT NULL,"
    " merchant_value varchar(64),"
    " robot_value varchar(64),"
    " observed_at timestamptz NOT NULL,"
    " verified_at timestamptz NOT NULL,"
    " delay_seconds integer NOT NULL,"
    " delta_pct numeric(6,2))",
    "CREATE INDEX IF NOT EXISTS ix_divergences_license"
    " ON divergences (license_key_hash, verified_at)",
    "CREATE INDEX IF NOT EXISTS ix_divergences_listing ON divergences (listing_id)",
)
