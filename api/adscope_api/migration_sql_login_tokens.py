"""Le SQL de la migration 015 : le mot de passe voyage sur le jeton.

Une seule colonne, nullable : `login_tokens.pending_password_hash` porte
l'empreinte du mot de passe que CE jeton promeut, plutôt que
`accounts.pending_password_hash` — une case unique que plusieurs jetons en
vol pouvaient se disputer (revue de code, lot comptes-avec-mot-de-passe).
`accounts.pending_password_hash` reste en base, vide, jamais lu ni écrit : la
supprimer demanderait un `DROP COLUMN`, hors de portée d'une migration qui ne
doit rien détruire.
"""

LOGIN_TOKENS_PENDING_PASSWORD = (
    "ALTER TABLE login_tokens ADD COLUMN IF NOT EXISTS pending_password_hash"
    " varchar(128)",
)
