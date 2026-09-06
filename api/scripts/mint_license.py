"""Crée une clé de licence. La clé en clair n'est affichée qu'une fois.

    mint_license.py <libellé> [--automated]

`--automated` marque un émetteur qui n'est pas un utilisateur — un crawler :
ses observations comptent pour le marché, jamais pour la mesure d'usage.

Tout autre argument arrête la commande. `--automatd` était écarté en silence,
les positionnels se décalaient, et la licence était frappée sous le mauvais
libellé — sans clé pour la retrouver, elle ne se corrige plus.
"""
import sys

from adscope_api.auth import hash_key, new_key
from adscope_api.db import create_all, session_scope
from adscope_api.models import License

args = [a for a in sys.argv[1:] if not a.startswith("--")]
flags = {a for a in sys.argv[1:] if a.startswith("--")}
width = License.__table__.c["label"].type.length
if len(args) != 1 or flags - {"--automated"} or not 0 < len(args[0]) <= width:
    sys.exit(__doc__)

create_all()
key = new_key()
with session_scope() as session:
    session.add(License(key_hash=hash_key(key), label=args[0],
                        automated="--automated" in flags))
print(key)
