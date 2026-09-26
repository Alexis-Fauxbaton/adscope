# Le planificateur interne

Décision d'Alexis (2026-09-26) : pas de cron Render facturé à l'usage. L'email
du matin (lot F1, `api/scripts/send_digests.py`) part désormais d'une boucle
interne au service web, réveillée toutes les 60 s — « si le besoin se fait
sentir on passera sur le cron, mais il faut qu'on puisse le mesurer ». Ce
rapport dit ce qui est fait, comment lire la carte, et le seuil chiffré pour
prendre cette décision-là.

## 1. Le planificateur (`api/adscope_api/scheduler.py`)

`run_due(now, last_run_day)` est la règle, pure : vrai si l'heure locale
(Europe/Paris, `zoneinfo`) a atteint `ADSCOPE_DIGEST_AT` (`config.py`, défaut
`07:00`) et qu'aucune exécution n'a eu lieu ce jour local. Un service éteint à
7 h rattrape au réveil du même jour (`>=`, pas `==`) ; un redémarrage à 7 h 01
n'envoie rien en double, tenu par la base (`digest_runs.day`, unique), pas
seulement par la mémoire du processus.

`lifespan` (passé à `FastAPI(..., lifespan=scheduler.lifespan)` dans
`main.py`) ne lance la boucle que si `ADSCOPE_DIGEST_AT` n'est pas vide —
jamais à l'import, jamais dans les tests (`api/tests/conftest.py`, la fixture
`client` n'entre jamais dans le `lifespan`) ni sur un poste où la variable
n'est pas posée. L'envoi tourne dans un exécuteur (`run_in_executor`) : la
boucle est asynchrone, `digest_send.run` ne l'est pas.

**Réserve — le service local (`launchctl`)** : le défaut de configuration est
`07:00`, comme demandé. Le service local relancé aujourd'hui l'a donc hérité
et tentera un envoi réel (dans la base `adscope` locale, sans fournisseur —
l'email s'écrit dans la boîte d'envoi, rien ne part vraiment) à 7 h demain, si
le Mac tourne encore. `scripts/fr.adscope.api.plist` est hors du périmètre de
ce lot (interdit d'y toucher) : si tu ne veux pas de ce comportement en local,
ajoute `ADSCOPE_DIGEST_AT` (vide) à ses `EnvironmentVariables` et relance.

## 2. La mesure (migration 018, `digest_runs`)

Une ligne par jour local (`day`, clé primaire — le « unique » du besoin est la
contrainte). `digest_run.py` (`record`) est la seule porte d'écriture, appelée
à la fois par le planificateur (`trigger=scheduler`) et par
`scripts/send_digests.py` (`trigger=script`, sauf en `--dry-run`, qui n'écrit
toujours rien nulle part). Au plus trois tentatives par jour
(`MAX_ATTEMPTS`) : un jour en erreur réessaie au tick suivant tant que `sent`
est nul, puis s'arrête et se compte « manqué ». `digest_send.run` (l'envoi de
tous les comptes) a été extrait de `scripts/send_digests.py` vers
`adscope_api/digest_send.py` — c'est la même fonction des deux côtés, jamais
dupliquée.

## 3. La route (`GET /v1/digests/runs`)

Derrière `require_operator`, comme `/v1/divergences`. `?days=14` (défaut) :
les lignes du jour le plus récent au plus ancien, plus un résumé `{days, ran,
missed, max_delay_seconds, last_error}`. `missed` ne compte que les jours qui
portent une ligne — un jour jamais atteint (avant le premier déploiement, ou
pas encore dû aujourd'hui) n'en a aucune, et ne compte donc ni pour ni contre ;
c'est ce qui distingue l'état vide honnête de « tout est manqué ». Enregistrée
*avant* `digests.router` dans `main.py` : sans cet ordre,
`/v1/digests/{digest_id}` intercepte « runs » comme un identifiant (422),
prouvé par un test qui casse volontairement l'ordre.

## 4. La carte opérateur (`web/ecarts.html`, en tête)

Le parcours qu'elle sert : Alexis ouvre la page le matin, dix secondes de
focus. Il lit d'abord la phrase du haut — « 14 jours : 13 envois, 1 manqué,
retard maximal 2 min » — et sait déjà si tout va bien. S'il y a un manqué, il
descend d'une ligne : la date, l'heure de départ (heure de Paris, composée
côté API et lue telle quelle côté site — jamais reconstruite par un `Date`,
qui retomberait sur le fuseau du navigateur), le retard, les comptes
examinés, les emails écrits, et l'erreur en rouge si le jour a manqué. Il n'y
a rien à cliquer : c'est un cadran de lecture, pas une commande. Avant la
toute première exécution, la carte ne parle pas de jours manqués : « Aucune
exécution encore — la première est prévue à 07:00. »

Module à part d'`ecarts-page.js` (`js/digest-runs-page.js`) : deux cartes,
deux cycles de peinture indépendants, chacun sa fixture (`?demo=1`,
`fixtures-digest-runs.js`). Capture refaite : `docs/site-v0-ecarts.png`,
regardée à 1200 px et à 390 px.

## 5. `/healthz`

Sans base ni authentification (`api/adscope_api/digest_runs.py` — porte cette
route en plus de `/v1/digests/runs`, faute de place dans `main.py`, déjà à son
plafond de 150 lignes). `render.yaml` : `healthCheckPath: /healthz`, plus
`/app/`, qui journalisait chaque frappe (5 s) sans rien vérifier de plus vite.

## 6. Le journal et le critère chiffré

Une ligne de log à chaque tentative (`adscope.digest_run`) : jour, retard,
comptes, emails, erreur — que le déclencheur soit le planificateur ou le
script.

**Le critère pour passer au cron** : sur les 30 derniers jours (`GET
/v1/digests/runs?days=30`), **un jour manqué** (`missed > 0`) **ou un retard
maximal supérieur à 10 minutes** (`max_delay_seconds > 600`). Le planificateur
interne n'a de sens que tant que « le service tourne » et « le service
répond en moins d'une minute » restent vrais presque toujours ; l'un ou
l'autre qui casse régulièrement dit que Render lui-même n'est pas fiable à
cette échelle, et c'est exactement ce qu'un cron externe achète. En dessous de
ce seuil, la mesure suffit à répondre « ça part, à l'heure » sans qu'il y ait
de décision à prendre.

## Vérification

- `api` : `cd api && ./.venv/bin/pytest tests/ -q` → **1085 verts** (1048 +
  37 : config, migration 018, `digest_run`, `scheduler`, la route, `/healthz`).
- `web` : `cd web && node --test tests/*.test.mjs` → **210 verts** (205 + 5,
  `digest-runs.js`).
- `extension` : `node --test extension/tests/*.test.mjs` → **439 verts**,
  inchangée (rien touché).
- Migration 018 appliquée en local après `pg_dump -Fc adscope` vers
  `~/adscope-backups/` ; `launchctl kickstart -k gui/$UID/fr.adscope.api` ;
  `/healthz` et `/app/` répondent 200 sur le service relancé.
- Chaque test neuf nomme la ligne de production qui le fait rougir ; un
  échantillon représentatif (la règle du jour local, le plafond de
  tentatives, l'ordre d'enregistrement des routes, le calcul du retard
  maximal, la lecture de l'heure sans `Date`) a été cassé puis restauré pour
  le prouver — pas chacun des ~50 tests neufs un par un, vu l'ampleur du lot.
