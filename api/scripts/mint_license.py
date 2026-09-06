"""Crée une clé de licence. La clé en clair n'est affichée qu'une fois.

    mint_license.py <libellé> [--automated]

`--automated` marque un émetteur qui n'est pas un utilisateur — un crawler :
ses observations comptent pour le marché, jamais pour la mesure d'usage.
"""
import sys

from adscope_api.auth import hash_key, new_key
from adscope_api.db import create_all, session_scope
from adscope_api.models import License

args = [a for a in sys.argv[1:] if not a.startswith("--")]
label = args[0] if args else "sans-nom"
automated = "--automated" in sys.argv[1:]
create_all()
key = new_key()
with session_scope() as session:
    session.add(License(key_hash=hash_key(key), label=label, automated=automated))
print(key)
