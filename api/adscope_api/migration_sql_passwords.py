"""Le SQL de la migration 014 : le compte avec mot de passe.

Sorti de `migration_registry.py`, à sa limite de longueur — même raison que
`migration_sql_alerts.py` au lot des alertes. Aucun `UPDATE`, aucun `DROP` :
rien n'est rétro-marqué vérifié, aucun compte existant (dont celui d'Alexis)
n'est touché. `purpose` a un défaut : les jetons en vol au moment de la
migration restent valides, comme des jetons de vérification.
"""

PASSWORDS_TABLES = (
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS password_hash varchar(128)",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS pending_password_hash varchar(128)",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email_verified_at timestamptz",
    "ALTER TABLE login_tokens ADD COLUMN IF NOT EXISTS purpose varchar(16)"
    " NOT NULL DEFAULT 'verify'",
    "CREATE TABLE IF NOT EXISTS mails ("
    " id serial PRIMARY KEY,"
    " account_id integer NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,"
    " kind varchar(16) NOT NULL,"
    " subject varchar(200) NOT NULL,"
    " text text NOT NULL,"
    " created_at timestamptz NOT NULL)",
    "CREATE INDEX IF NOT EXISTS ix_mails_account ON mails (account_id, created_at)",
)
