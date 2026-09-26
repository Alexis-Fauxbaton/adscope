"""Le SQL de la migration 018 : `digest_runs`, la mesure du planificateur
(`.superpowers/planificateur.md`).

Table neuve, rien des comptes ni des annonces touché. Les colonnes suivent
exactement `alert_models.DigestRun` : `test_migrations.py` compare le schéma
qu'elle produit à celui de `create_all`.
"""

DIGEST_RUNS_TABLE = (
    "CREATE TABLE IF NOT EXISTS digest_runs ("
    " day date PRIMARY KEY,"
    " due_at timestamptz NOT NULL,"
    " started_at timestamptz NOT NULL,"
    " finished_at timestamptz,"
    " accounts integer NOT NULL DEFAULT 0,"
    " sent integer,"
    " error text,"
    " trigger varchar(16) NOT NULL,"
    " attempts integer NOT NULL DEFAULT 0)",
)
