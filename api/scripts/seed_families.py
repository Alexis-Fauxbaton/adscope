"""Pose le périmètre d'une licence : les familles de véhicules qu'elle surveille.

    seed_families.py <clé|empreinte> [familles.json]

Sans fichier, les dix familles les plus présentes de la base — une semence, le
temps que le marchand dise les siennes. Avec, la liste qu'il a donnée, au même
gabarit que la route : `[{"brand": "Renault", "model": "Clio"}, ...]`.

Idempotent parce qu'il remplace : rejoué avec le même argument, il repose
exactement le même périmètre. C'est aussi ce qui permet de corriger la semence
par la vraie liste sans rien nettoyer à la main.

La licence se désigne par sa clé ou par son empreinte, jamais par son libellé :
la base porte deux licences « alexis », et le libellé n'est pas une identité.
"""
import json
import sys

from adscope_api.auth import by_key_or_hash
from adscope_api.db import session_scope
from adscope_api.families import Family, families_of, most_present, replace_families


def read(path: str) -> list[Family]:
    with open(path) as handle:
        return [Family(**item) for item in json.load(handle)]


args = [a for a in sys.argv[1:] if not a.startswith("--")]
if not 1 <= len(args) <= 2 or any(a.startswith("--") for a in sys.argv[1:]):
    sys.exit(__doc__)

with session_scope() as session:
    license_ = by_key_or_hash(session, args[0])
    if license_ is None:
        sys.exit("licence inconnue")
    before = {(f["brand"], f["model"]) for f in families_of(session, license_.key_hash)}
    families = read(args[1]) if len(args) == 2 else most_present(session)
    kept = replace_families(session, license_.key_hash, families)
    label = license_.label

print("%s : %d familles — %d posées, %d retirées"
      % (label, len(kept), len(set(kept) - before), len(before - set(kept))))
for brand, model in kept:
    print("  %s %s" % (brand, model))
