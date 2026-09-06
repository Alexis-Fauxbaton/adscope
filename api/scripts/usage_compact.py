"""Ferme les journées d'usage passées, sans attendre le prochain lot.

    usage_compact.py

Le grain (licence, jour, annonce) ne sert qu'à dédoublonner les annonces
pendant que la journée dure. Passée, son compte tient en une ligne par licence.
La route le fait d'elle-même au premier lot du jour ; cette commande est là pour
une API qui ne reçoit plus rien, ou pour rattraper une base laissée de côté.
"""
import sys

from adscope_api.db import session_scope
from adscope_api.usage import compact

if sys.argv[1:]:
    sys.exit(__doc__)

with session_scope() as session:
    closed = compact(session)
print(f"{closed} journée(s) fermée(s)" if closed else "rien à fermer")
