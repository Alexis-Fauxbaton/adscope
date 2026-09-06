"""Marque une licence comme émetteur automatique — ou la démarque.

    mark_automated.py <clé|empreinte> [--non]

Ses observations comptent alors pour le marché, jamais pour la mesure d'usage.
La licence se désigne par sa clé ou par son empreinte, jamais par son libellé :
deux licences peuvent le partager.
"""
import sys

from adscope_api.auth import mark_automated
from adscope_api.db import session_scope

args = [a for a in sys.argv[1:] if not a.startswith("--")]
flags = {a for a in sys.argv[1:] if a.startswith("--")}
if len(args) != 1 or flags - {"--non"}:
    sys.exit(__doc__)

with session_scope() as session:
    license_ = mark_automated(session, args[0], automated="--non" not in flags)
    found = license_ is not None
    label = license_.label if found else ""
    state = "automatique" if found and license_.automated else "humaine"

print(f"{label} : licence {state}" if found else "licence inconnue")
