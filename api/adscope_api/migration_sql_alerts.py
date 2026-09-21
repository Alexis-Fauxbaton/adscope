"""Le SQL de la migration 013 : les quatre tables des alertes.

Sorti de `migration_registry.py`, à sa limite de longueur — même raison que
`migration_sql.py` au lot 3a. Les colonnes suivent exactement `alert_models.py`
: `test_migrations.py` compare le schéma qu'elles produisent à celui de
`create_all`.
"""

ALERTS_TABLES = (
    "CREATE TABLE IF NOT EXISTS saved_searches ("
    " id serial PRIMARY KEY,"
    " account_id integer NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,"
    " name varchar(80) NOT NULL,"
    " query text NOT NULL,"
    " notify_drops boolean NOT NULL DEFAULT true,"
    " notify_new boolean NOT NULL DEFAULT false,"
    " min_age_days integer NOT NULL DEFAULT 30,"
    " min_drop_pct integer NOT NULL DEFAULT 3,"
    " paused boolean NOT NULL DEFAULT false,"
    " created_at timestamptz NOT NULL)",
    "CREATE INDEX IF NOT EXISTS ix_saved_searches_account"
    " ON saved_searches (account_id, id)",
    "CREATE TABLE IF NOT EXISTS account_settings ("
    " account_id integer PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,"
    " digest_enabled boolean NOT NULL DEFAULT true,"
    " include_follows boolean NOT NULL DEFAULT true,"
    " unsubscribe_token_hash varchar(64) NOT NULL UNIQUE,"
    " created_at timestamptz NOT NULL)",
    "CREATE TABLE IF NOT EXISTS alerts_sent ("
    " account_id integer NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,"
    " kind varchar(8) NOT NULL,"
    " listing_id integer NOT NULL REFERENCES listings (id) ON DELETE CASCADE,"
    " ref varchar(40) NOT NULL,"
    " sent_at timestamptz NOT NULL,"
    " PRIMARY KEY (account_id, kind, listing_id, ref))",
    "CREATE INDEX IF NOT EXISTS ix_alerts_sent_listing ON alerts_sent (listing_id)",
    "CREATE TABLE IF NOT EXISTS digests ("
    " id serial PRIMARY KEY,"
    " account_id integer NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,"
    " day date NOT NULL,"
    " token varchar(24) NOT NULL UNIQUE,"
    " subject varchar(200) NOT NULL,"
    " text text NOT NULL,"
    " html text NOT NULL,"
    " created_at timestamptz NOT NULL,"
    " visits integer NOT NULL DEFAULT 0,"
    " first_visit_at timestamptz,"
    " UNIQUE (account_id, day))",
    "CREATE INDEX IF NOT EXISTS ix_digests_account ON digests (account_id, created_at)",
)
