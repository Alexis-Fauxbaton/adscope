# Déploiement — Render

Ce que la mise en ligne exige et que rien dans le code ne peut deviner à ta
place. Pas de `render.yaml` dans ce dépôt : le composer sans ta décision sur
le domaine, le plan Render et la base gèlerait des choix qui ne sont pas
encore pris (C-5, `.superpowers/audit-config.md`).

## Installation

```
uv sync --frozen
```

`--frozen` refuse de résoudre des versions plus récentes que `uv.lock` : ce
qui part en ligne est exactement ce qui a été audité (C-5). `uv.lock` est
suivi dans le dépôt — vérifie qu'il est à jour (`uv lock --check`) avant
chaque déploiement.

## Commande de démarrage

```
uv run uvicorn adscope_api.main:app \
  --host 0.0.0.0 --port $PORT \
  --proxy-headers --forwarded-allow-ips=<IP ou plage du proxy Render>
```

`--proxy-headers --forwarded-allow-ips` dit à uvicorn qui a le droit de poser
`X-Forwarded-For` : sans le premier, aucun en-tête n'est honoré et l'IP vue
par le service est celle du proxy Render pour tout le monde (AUTH-06/C-1) ;
avec `--forwarded-allow-ips=*`, n'importe quel client pourrait forger la
sienne. Trouve la plage exacte dans la documentation Render du moment (elle
change) — jamais `*`.

`ADSCOPE_TRUSTED_PROXY` (variable d'application, ci-dessous) est la décision
symétrique côté code : elle dit à `rate_limit.guard` de lire lui-même le
dernier élément de `X-Forwarded-For` pour ses plafonds. Les deux vont
ensemble ; poser l'une sans l'autre laisse le plafond par IP global (uvicorn
seul) ou forgeable (l'application seule sans le filtre réseau d'uvicorn).

## Variables d'environnement obligatoires

| Variable | Valeur | Pourquoi |
|---|---|---|
| `ADSCOPE_ENV` | `production` | Active les refus de démarrage ci-dessous (`config.validate_startup`) — absente, rien ne change, c'est le poste local. |
| `ADSCOPE_PUBLIC_URL` | `https://<domaine choisi>` | Doit être en `https://` : sinon le service refuse de démarrer (C-2/AUTH-08). Sans elle, le cookie de session de 90 jours part sans `Secure` et les liens d'email pointent vers `localhost`. |
| `ADSCOPE_OPERATOR_EMAIL` | ton adresse | Le seul compte, en plus des clés `automated`, que `GET /v1/sweep` et `POST /v1/revisits` laissent passer par cookie. Normalisée (espaces, casse) à la lecture (C-9) — pas besoin de la soigner dans le tableau de bord. |
| `DATABASE_URL` | fournie par Render (« Internal Database URL ») | Collée telle quelle : `postgres://` et `postgresql://` sont normalisées vers `postgresql+psycopg://` (seul dialecte installé) au démarrage (C-6). Absente en production, le service refuse de démarrer plutôt que d'écrire dans la base locale par défaut. |
| `ADSCOPE_TRUSTED_PROXY` | `1` | Voir ci-dessus — va avec `--forwarded-allow-ips`. |

Variables déjà couvertes ailleurs, à ne PAS poser en production :
`ADSCOPE_ENABLE_DOCS` (`/docs`/`/redoc` — réservé au poste local, INJ-1),
`ADSCOPE_DEV_LOGIN` (n'existe plus dans le code).

## Une seule instance

Les plafonds anti-abus (`rate_limit.py`) et la fermeture des journées d'usage
(`usage.compact_daily`) vivent en mémoire, par processus. Deux instances
Render doublent chaque plafond et peuvent fermer une journée deux fois (la
seconde couverte par le verrou consultatif de `usage.compact`, pas les
plafonds de connexion) : une seule instance, jusqu'à ce que ces états
migrent en base (A10, `.superpowers/audit-synthese.md` §3.1). Sur Render,
c'est le nombre d'instances du service, pas le nombre de workers uvicorn —
n'en lance qu'un des deux.

## Après un déploiement

`launchctl kickstart -k gui/$UID/fr.adscope.api` ne concerne que le service
local (`scripts/fr.adscope.api.plist`) ; Render relance seul à chaque
déploiement. Vérifie au premier appel que `ADSCOPE_ENV=production` a bien
empêché un démarrage mal configuré de passer — un service qui répond est un
service dont les deux variables `https`/`DATABASE_URL` ont été acceptées.
