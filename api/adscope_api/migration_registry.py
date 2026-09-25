"""Le registre des migrations : une suite d'instructions SQL par nom.

Extrait de `migrations.py`, que ce registre faisait grossir d'un lot à
l'autre — `apply_migrations` et `migrate` restent seuls dans ce dernier. Les
fragments SQL trop longs pour une ligne vivent à part (`migration_sql.py` et
consorts) : le registre gagne une migration par lot, il n'a pas à porter en
plus ce qui ne change jamais.

Les migrations 001 à 012, elles, ne changent plus jamais — appliquées sur la
base réelle, une migration passée ne se retouche pas. Elles vivent dans
`migration_registry_early.py`, sorties d'ici pour la même raison que
`follow_models`/`usage_models` sont sortis de `models.py`.
"""

from .migration_registry_early import EARLY, LEDGER
from .migration_sql_absence import ABSENCE_REPORTS
from .migration_sql_alerts import ALERTS_TABLES
from .migration_sql_corpus import CORPUS_TABLES
from .migration_sql_login_tokens import LOGIN_TOKENS_PENDING_PASSWORD
from .migration_sql_passwords import PASSWORDS_TABLES

__all__ = ["LEDGER", "MIGRATIONS"]

MIGRATIONS = EARLY + (
    # Les alertes (lot F1) : quatre tables neuves, rien des annonces touché.
    ("013_alerts", ALERTS_TABLES),
    # Le compte avec mot de passe : trois colonnes vides sur accounts,
    # `purpose` sur login_tokens, la table mails. Aucun UPDATE.
    ("014_passwords", PASSWORDS_TABLES),
    # Balayage de relecture (prise de compte) : le mot de passe en attente
    # voyage sur le jeton qui l'a envoyé, pas sur une case partagée du compte.
    ("015_login_tokens_pending_password", LOGIN_TOKENS_PENDING_PASSWORD),
    # Le lot Corpus : deux tables neuves, rien des annonces touché — le
    # marqueur « à vérifier » (`rechecks`) et le journal des écarts
    # (`divergences`).
    ("016_corpus", CORPUS_TABLES),
    # Le lot Disparition : la colonne du doute (`listings.probably_gone_at`)
    # et le registre des voix qui l'ont constaté (`absence_reports`).
    ("017_absence", ABSENCE_REPORTS),
)
