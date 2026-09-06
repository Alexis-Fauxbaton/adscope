"""Ce que la mesure d'usage a retenu, par licence et par jour.

    usage_report.py [jours]        30 par défaut

La table se remplissait sans lecteur : ni route, ni script, ni commande, la
mesure n'était consultable qu'en `psql`. Deux nombres par jour — les annonces
distinctes et les passages — et, par licence, les jours actifs sur les jours
écoulés : c'est là qu'on voit un utilisateur décrocher.

Les licences automatiques n'y figurent pas : `by_day` les écarte, un crawler
produit à lui seul plus de lignes que tous les utilisateurs.
"""
import sys
from datetime import date, timedelta

from adscope_api.db import session_scope
from adscope_api.usage import by_day, by_license

args = sys.argv[1:]
if len(args) > 1 or (args and not args[0].isdigit()):
    sys.exit(__doc__)

span = int(args[0]) if args else 30
since = date.today() - timedelta(days=span - 1)

with session_scope() as session:
    licenses = by_license(by_day(session, since=since))

if not licenses:
    print(f"aucun usage depuis le {since}")
for lic in licenses:
    print(f"{lic['label']}  ({lic['license_key_hash'][:8]}…)")
    for day in lic["days"]:
        print(f"  {day['day']}  {day['listings']:>6} annonces  "
              f"{day['observations']:>6} passages")
    print(f"  → {lic['active_days']} jour(s) actif(s) sur {lic['span_days']}, "
          f"du {lic['first']} au {lic['last']} · "
          f"{lic['listings']} annonces, {lic['observations']} passages\n")
