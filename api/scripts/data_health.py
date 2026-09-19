"""Le rapport de santé des données, imprimé pour un humain.

    data_health.py [jours-de-fenêtre]        7 par défaut

Sort avec le code 1 si une alerte s'est levée, 0 sinon — c'est ce code qu'une
tâche planifiée regarde, jamais la sortie texte. La logique vit dans
`adscope_api.data_health` (calcul) et `adscope_api.data_health_text` (mise en
page) ; ce script ne fait que lire l'horloge, appeler, imprimer.

Aucune tâche planifiée n'est posée par ce lot. À la main :

    cd api && ./.venv/bin/python scripts/data_health.py

En launchd, un job qui tourne chaque matin (`fr.adscope.data-health.plist`,
à côté de `fr.adscope.api.plist`) :

    <key>ProgramArguments</key>
    <array>
      <string>/Users/alexis/Documents/Projets/adscope/api/.venv/bin/python</string>
      <string>/Users/alexis/Documents/Projets/adscope/api/scripts/data_health.py</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer></dict>
    <key>StandardOutPath</key>
    <string>/Users/alexis/Documents/Projets/adscope/api/scripts/data_health.log</string>

Ou en cron, la même heure :

    0 8 * * * cd /Users/alexis/Documents/Projets/adscope/api && ./.venv/bin/python scripts/data_health.py >> scripts/data_health.log 2>&1
"""
import sys
from datetime import datetime, timedelta, timezone

from adscope_api.data_health import compute
from adscope_api.data_health_text import render
from adscope_api.db import session_scope

args = sys.argv[1:]
if len(args) > 1 or (args and not args[0].isdigit()):
    sys.exit(__doc__)

window = timedelta(days=int(args[0]) if args else 7)

with session_scope() as session:
    report = compute(session, now=datetime.now(timezone.utc), window=window)

print(render(report))
sys.exit(1 if report.alerts else 0)
