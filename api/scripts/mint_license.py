"""Crée une clé de licence. La clé en clair n'est affichée qu'une fois."""
import sys

from adscope_api.auth import hash_key, new_key
from adscope_api.db import create_all, session_scope
from adscope_api.models import License

label = sys.argv[1] if len(sys.argv) > 1 else "sans-nom"
create_all()
key = new_key()
with session_scope() as session:
    session.add(License(key_hash=hash_key(key), label=label))
print(key)
