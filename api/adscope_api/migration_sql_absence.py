"""Le SQL de la migration 017 : le registre des voix qui ont constaté une
absence (`.superpowers/disparition-plan.md` §2).

Non destructive, comme les précédentes : aucun `UPDATE`, aucun `DROP`, aucun
`NOT NULL` ajouté à une colonne existante. Les `disappeared_at` déjà écrits
restent — ils ne sont ni relus, ni annulés, ni rétro-comptés. Les colonnes
suivent exactement `absence_models.AbsenceReport` :
`test_migrations.py` compare le schéma qu'elles produisent à celui de
`create_all`.
"""

ABSENCE_REPORTS = (
    # Le doute, à la différence du fait (`listings.disappeared_at`) : une
    # seule voix l'a constatée. Index partiel — la population est minuscule
    # et transitoire — pour que `absence_scope.visible` reste gratuit.
    "ALTER TABLE listings ADD COLUMN IF NOT EXISTS probably_gone_at timestamptz",
    "CREATE INDEX IF NOT EXISTS ix_listings_probable"
    " ON listings (probably_gone_at) WHERE probably_gone_at IS NOT NULL",
    "CREATE TABLE IF NOT EXISTS absence_reports ("
    " listing_id integer NOT NULL REFERENCES listings (id) ON DELETE CASCADE,"
    " actor varchar(72) NOT NULL,"
    " license_key_hash varchar(64) REFERENCES licenses (key_hash) ON DELETE SET NULL,"
    " automated boolean NOT NULL DEFAULT false,"
    " evidence varchar(16) NOT NULL,"
    " first_at timestamptz NOT NULL,"
    " last_at timestamptz NOT NULL,"
    " PRIMARY KEY (listing_id, actor))",
    "CREATE INDEX IF NOT EXISTS ix_absence_reports_actor ON absence_reports (actor, listing_id)",
)
