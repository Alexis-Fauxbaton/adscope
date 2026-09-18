# Le site passe à la connexion par email — `web/`

Contre le contrat fixé dans `docs/roadmap.md` (Lot Comptes) et la spécification du lot :
`POST /v1/auth/login`, `GET /v1/auth/verify`, `POST /v1/auth/logout`, `GET /v1/me`, cookie
`adscope_session`, en-tête `X-Adscope: 1` sur les écritures authentifiées par cookie.

## Ce qui a changé

- `web/js/api.js` — reconstruit. Plus de `licenseKey`/`rememberLicense`/`forgetLicense`, plus
  de `Bearer`. Toute requête part en `credentials: 'same-origin'` ; `X-Adscope: 1` se pose sur
  `POST`/`PUT`/`DELETE`, jamais sur une lecture. `buildRequest(path, opts)` est la construction
  pure de la requête (URL + `init`), extraite exprès pour se tester sans réseau. Purge de
  l'ancienne entrée `localStorage['adscope.license']` au chargement du module (try/catch, une
  navigation privée ou un stockage bloqué ne casse rien). Nouvelles fonctions `login(email)` et
  `logout()`. `me()` suit le nouveau contrat `{email, label}` (fixture mise à jour pareil).
- `web/js/login.js` — refait : un champ email, un bouton. Trois cartes de résultat : envoyé
  (générique, anti-énumération), mode local (`dev_link` cliquable, en clair — jamais que si
  l'API la renvoie), et une note d'expiration sur `?login=expired`. Deux fonctions pures
  exportées (`envoiOutcome`, `estExpire`) pour rester testables sans DOM, comme `revisits.js`
  sépare déjà sa logique de son rendu. Même registre visuel — les classes `.entree`/`.carte`
  existaient déjà dans `web/css/`, rien à ajouter côté connexion.
- `web/js/app.js` — `demarrer()` devient asynchrone : `GET /v1/me` tranche, un échec (401 ou
  API muette, traités pareil) montre l'écran de connexion. L'email du compte s'affiche à côté
  de « Se déconnecter » (nouvelle classe `.moi`, wrapper `.tete-compte` en CSS). Déconnexion
  appelle `POST /v1/auth/logout` puis réaffiche l'écran de connexion ; en mode démo le bouton
  ne fait rien (pas de session à couper, pas d'appel).
- `web/js/revisits-page.js` — l'état « connectez-vous d'abord » se décide par `api.me()` au
  lieu de `api.licenseKey()`. Aucun appel à `/v1/revisits` n'est ajouté : toujours derrière le
  clic sur « Demander la file ».
- `web/js/revisits.js` — renommage `hasLicense` → `hasSession` dans `initialView` (même
  logique, même signature positionnelle — `revisits.test.mjs` intact).
- `web/js/fixtures.js` — `me()` rend `{email, label}` au lieu de `{label, expires_at}`.
- `web/css/base.css` — `.tete-compte` (wrapper flex) et `.moi` (email discret) ; `.deco` perd
  son `margin-left:auto`, porté par le wrapper.

## Tests ajoutés (`web/tests/`)

- `api.test.mjs` (4) — purge de l'ancienne clé au chargement (rouge sur le `removeItem` en tête
  de `api.js`, prouvé avec un `localStorage` factice) ; `X-Adscope` posé sur écriture et absent
  en lecture ; `credentials: 'same-origin'` partout et aucune clé/jeton dans l'URL ou les
  en-têtes ; mode démo sans aucun appel réseau (un `fetch` qui lève si on l'appelle).
- `login.test.mjs` (3) — `envoiOutcome` bascule sur `dev_link` présent/absent ; `estExpire` ne
  s'active que sur `?login=expired`.

Total site : 45 → 52. Suite complète : `node --test tests/*.test.mjs` — 52/52, exit 0.

Note technique : `api.js` lit `location`/`localStorage` à l'import (purge) et à l'appel
(`isDemo`) — deux globals que Node n'a pas nativement. Les tests les posent sur `globalThis`
avant d'importer le module avec un query-string différent à chaque fois (`?t=N`), pour forcer
sa ré-exécution plutôt que de retomber sur le module mis en cache.

## Vérifié à la main (Playwright, serveur statique local, sans API)

Les quatre états de l'écran de connexion (formulaire, envoyé, mode local avec lien cliquable,
expiré), le mode `?demo=1` intact (site et `revisites.html`), et `revisites.html` sans session
qui affiche « Connectez-vous d'abord sur /app. » sans jamais appeler `/v1/revisits`.

Capture : `docs/site-v0-connexion.png` remplacée (écran « Connexion », état formulaire).

## Hors périmètre, pour mémoire

Je n'ai pas touché à `api/` (un autre agent y livre le contrat en parallèle — `auth.py`,
`auth_email.py`, `sessions.py`, `login_tokens.py` y sont déjà en cours) ni à `extension/`. Le
contrat CSRF (`X-Adscope`) et le cookie `adscope_session` sont ceux fixés dans la tâche ; je ne
les ai pas vérifiés côté serveur.
