# Correctifs de l'audit offensif

Journal des correctifs appliqués aux trouvailles confirmées de l'audit offensif
(`audit-auth.md`, `audit-config.md`, `audit-injection.md`, `audit-extension.md`,
`audit-abus.md`, `audit-acces.md`). Une section par lot, datée, par angle.

---

## 2026-09-24 — angle `api/` : critiques et hautes confirmées, tous angles

Lot fermé côté `api/` seul, sur les trouvailles critiques/hautes confirmées
transmises (angles accès, auth, injection, config, données, abus). Les
autres côtés (`extension/`, `web/`) sont corrigés en parallèle par d'autres
agents — non touchés ici. Aucune migration : tous les correctifs réutilisent
des colonnes déjà en place (`licenses.automated`, `listings.disappeared_at`).
`launchctl kickstart -k gui/$UID/fr.adscope.api` relancé après coup, tests
verts.

Commits : `03317d9`, `ffaed7d`, `5eae0a1`, `29a7896`. Suite
`cd api && ./.venv/bin/pytest tests/ -q` : **935 verts**, aucun rouge (895
officiels + sondes jetables encore en place pour les trouvailles laissées
ouvertes, + tests neufs de ce lot). Chaque ligne de correctif a été vérifiée
rouge en la défaisant puis restaurée (voir détail par trouvaille) ; les
sondes contradictoires des audits précédents qui prouvaient une trouvaille
maintenant fermée ont été rejouées (vertes → rouges) puis supprimées, sauf
quand elles documentent encore un aspect ouvert.

### A1 / AUTH-01 / A4 / C-8 — `require_operator` acceptait toute licence (critique)

**`api/adscope_api/operator.py:33-37`** — la branche `Bearer` de
`require_operator` rendait toute licence active sans vérifier qui l'a
émise : la clé d'un marchand ordinaire (`accounts.signup:53`) ouvrait
`GET /v1/sweep` (périmètre commercial de tous les concurrents — marque,
modèle, prix, département, par recherche enregistrée) et `POST /v1/revisits`
(repousse `next_detail_crawl` d'une semaine par fiche servie, sans plafond).
Seule une licence `license_.automated=True` (`mint_license.py --automated`,
`mark_automated.py`) passe désormais cette porte ; la branche cookie
(compte opérateur) ne change pas. `test_operator.py` couvre le refus d'une
clé marchande, avec et sans compte rattaché — reproduit le chemin réel
d'`accounts.signup`, pas seulement une clé frappée à la main.

### AUTH-02 — jeton `verify` d'un tiers réinstallant son mot de passe (haute)

**`api/adscope_api/accounts.py` (`verify`)** — un jeton `verify` qui pose un
mot de passe ne le fait plus si le compte en porte déjà un. Avant : un
tiers posait un jeton sur l'adresse de la victime en premier (mot de passe
P), la victime s'inscrivait ensuite pour de bon et cliquait SON lien (Q
installé, session ouverte) — le jeton du tiers, cliqué après coup, restait
valable et réinstallait P, ouvrant une session avec. Le jeton est brûlé par
`consume` avant le refus : pas rejouable, juste sans effet. Test neuf :
`test_a_stale_verify_token_cannot_reinstall_its_password_after_the_fact`.

### AUTH-03 — plafond de jetons en vol retourné contre la victime (haute)

**`api/adscope_api/login_tokens.py` (`mint`, `_evict_oldest_at_cap`)** — le
plafond de cinq jetons en vol par compte et par usage refusait la frappe
au-delà (`mint` rendait `None`) : cinq inscriptions d'un tiers sur
l'adresse de la victime saturaient le plafond, et la victime ne recevait
plus jamais de lien — la route répondait quand même `{"sent": true}`.
`mint` évince maintenant le plus ancien jeton en vol pour faire de la place
et rend toujours une clé ; les jetons déjà en vol SOUS le plafond ne sont
jamais touchés ici, c'est `invalidate_pending` (appelé après une réussite,
comportement déjà en place) qui les périme. Testé sur les deux tests
existants qui dépendaient de la coexistence de plusieurs jetons en vol
(`test_a_concurrent_signup_cannot_hijack_the_original_link`,
`test_reset_invalidates_the_other_outstanding_reset_links`) : toujours
verts, l'éviction ne mord qu'au plafond. Tests neufs :
`test_a_flooded_pending_queue_still_lets_the_latest_request_through`,
`test_mint_always_returns_a_token_even_past_the_pending_cap`.

### AUTH-04 — `/v1/auth/password` sans limiteur (haute)

**`api/adscope_api/auth_email.py` (`post_change_password`)** — seule route à
vérifier un mot de passe (Argon2id, ~60 ms en production) sans jamais
appeler `rate_limit.guard` : une session volée devinait le mot de passe
courant en essais illimités, sans verrou ni trace. Nouveau seau `"password"`
dans `rate_limit.LIMITS` (10/30/15 min, même plafond que `"login"`), clé par
compte (`f"account:{id}"`, la route n'a pas d'adresse) plutôt que par IP
seule. Test neuf : `test_change_is_rate_limited_after_repeated_wrong_current_passwords`.

### AUTH-05 — plafond par adresse retourné contre son titulaire (haute, partiel)

**`api/adscope_api/accounts.py` (`login`)** — le plafond par adresse compte
les essais SUR elle, pas PAR elle : un tiers qui connaît l'adresse d'un
marchand épuisait le compteur avec de mauvais mots de passe et bloquait
ensuite le vrai titulaire, indéfiniment répétable. Une connexion réussie
remet le compteur à zéro (`Limiter.clear`, méthode neuve). Ne règle que la
moitié du problème — une attaque active en continu garde l'effet — l'autre
moitié (clé combinée email+IP, ou délai progressif, proposée par l'audit)
est un arbitrage sécurité/disponibilité, pas un correctif mécanique : **non
fait**, à trancher en produit. Tests neufs :
`test_repeated_wrong_passwords_do_not_lock_out_the_right_one`,
`test_a_successful_login_resets_the_per_email_counter`.

### INJ-1 — `/docs`, `/redoc`, `/openapi.json` publics (haute)

**`api/adscope_api/main.py` (`FastAPI(...)`), `api/adscope_api/config.py`
(`docs_enabled`, `docs_urls`)** — les trois routes vivaient sur la même
origine que le cookie de session, et Swagger charge son script depuis
`cdn.jsdelivr.net` sans `integrity=`. Fermées par défaut ;
`ADSCOPE_ENABLE_DOCS=1` les rouvre, réservé au poste de développement — la
variable est absente en test comme en production tant qu'elle n'est pas
posée explicitement. Tests neufs : `test_docs.py`.

### A1 (abus) — corps de requête sans plafond (critique)

**`api/adscope_api/body_limit.py` (neuf), monté dans `main.py`** — FastAPI
met le corps entier en RAM avant de résoudre la moindre dépendance : un
corps de 400 Mo, refusé ensuite par un simple 401 (`require_license`),
avait déjà fait grimper l'instance à 1,7 Go, sans authentification.
Middleware ASGI pur (`BodySizeLimit`) : refuse en 413 tout
`Content-Length` déclaré au-delà de 2 Mo (cent observations, le plus gros
lot accepté, pèsent ~15 Ko), et coupe la lecture d'un corps sans
`Content-Length` (encodage `chunked`) au même seuil pendant qu'il grossit —
sans jamais construire de `Request` ni bufferiser lui-même. Tests neufs :
`test_body_limit.py`.

### C-3 / D3 — boîte d'envoi sans purge, jeton en clair (haute, partiel)

**`api/adscope_api/mail_outbox.py` (`purge_expired`, `RETENTION`)** —
`mails.text` garde le corps entier de l'email, jeton compris, sans aucune
purge ni expiration : un historique nominatif sans borne. `purge_expired`
retire les lignes plus vieilles que deux heures (au-delà de la plus longue
durée de vie d'un jeton, soixante minutes), appelé au même geste
opportuniste que `compact_daily` sur chaque lot d'observations — pas de
tâche de fond. **Ne règle pas le fond** : le jeton continue de voyager en
clair dans `mails.text` (D3), et c'est voulu tant que la boîte locale sert
de seul transport avant qu'un vrai fournisseur d'email soit branché
(go-live 2, `mail_outbox.py` docstring) — le retirer casserait le seul
canal par lequel Alexis peut aujourd'hui cliquer un lien de vérification en
développement. Tests neufs : `test_mail_outbox.py`.

### D5 — annonce disparue toujours servie (haute, partiel)

**`api/adscope_api/main.py` (`get_listing`, `post_batch`)** — une annonce
disparue restait servie par `GET /v1/listings/{site}/{id}` et
`POST /v1/listings/batch` (code postal complet et historique de prix d'un
vendeur particulier compris), alors que `/v1/market` l'exclut déjà. Même
filtre `disappeared_at.is_(None)` posé sur les deux routes — aucune de ces
deux routes n'affiche de statut "disparue" ni ne sert un usage légitime
après disparition (contrairement à `/v1/follows/feed`, qui le fait
explicitement et n'est pas concerné). **Ne règle pas** la rétention du code
postal complet lui-même pour un particulier, ni sa purge après
disparition — changerait la granularité de donnée conservée pour tous les
usages du produit, décision produit. Tests neufs dans `test_routes.py`.

### A7 / A8 (abus) — familles et suivis sans plafond ni pagination (haute)

**`api/adscope_api/families.py` (`MAX_FAMILIES`),
`api/adscope_api/follows.py` (`MAX_FOLLOWS`),
`api/adscope_api/feed_query.py`** — `PUT /v1/families` et `POST /v1/follows`
n'avaient aucun plafond (deux mille familles, ou cinq cents suivis, en un
lot — chacun tombant en rang 0 de la file de revisite commune) ;
`GET /v1/follows` et `GET /v1/follows/feed` n'avaient aucune pagination
(tout chargé en mémoire, avec les points de prix pour le second, à chaque
appel de l'email du matin). Plafond commun de 200 (même ordre de grandeur
que `MAX_SEARCHES`), à l'écriture (409 au-delà, sauf pour un suivi déjà
posé — idempotence préservée) et à la lecture (silencieux, sans changer le
contrat). Tests neufs dans `test_families.py`, `test_follows.py`.

### A3 (abus) — dates d'observation forgées sans borne (critique, partiel)

**`api/adscope_api/gauge.py` (`moment`, `MOMENT_BOUNDS`),
`api/adscope_api/intake.py` (`_moment`)** — `published_at`/`bumped_at`
n'avaient aucune borne : une observation forgée posait `1000-01-01`, et
`publication.apply` (`min`/`max` sans plancher) le gardait pour toujours,
irréversible face à une observation honnête plus tard. Bornées à
`[2000-01-01, 2100-01-01]`, même fourchette que `year`. **Ne règle pas** le
reste de la trouvaille A3/A2 — un prix forgé sur l'annonce d'un tiers
(`observations.py:87-104`) déclenche toujours une fausse alerte de baisse
chez un autre compte, et une observation forgée efface toujours une
disparition en cours (`observations.py:131`, comportement documenté et
voulu par ailleurs dans `disappearance.py`) : les deux demandent une
corroboration entre émetteurs distincts, absente du schéma actuel
(`price_points.license_key_hash` existe, `listings` n'a pas d'équivalent),
et changeraient qui peut écrire quoi — décision de conception qui dépasse
ce lot.

### Ouvert, non traité dans ce lot

- **AUTH-06 / C-1 / A6** (critique/haute) — le plafond par IP est indexé sur
  `request.client.host`, qui devient soit forgeable (uvicorn honore
  `X-Forwarded-For` par défaut derrière un pair non fiable), soit un seau
  global partagé par tous les marchands derrière le vrai proxy Render selon
  la configuration de lancement d'uvicorn. Correctif = `--forwarded-allow-ips`
  et la commande de lancement du service déployé — hors `api/`, dépend du
  déploiement Render (pas encore configuré, pas de `render.yaml`/`Procfile`
  dans le dépôt) : décision de déploiement, pas de code.
- **C-2** (haute) — `ADSCOPE_PUBLIC_URL` par défaut en `http://localhost:8000` ;
  `sessions.is_secure()` en dépend pour poser `Secure` sur le cookie. Une
  validation stricte au démarrage (refuser un schéma non-https hors poste
  local) demande de distinguer "poste local" de "Render" au runtime, ce qui
  n'existe pas encore — décision de déploiement/config à trancher avec le
  choix du domaine de production.
- **D1** (critique) — aucune route de suppression de compte ; un `DELETE FROM
  accounts` manuel en psql laisse `licenses` orpheline (label = l'email,
  `account_id` `SET NULL`) et tout l'historique de marché clé sur
  l'empreinte de licence. Une vraie route `DELETE /v1/account` est une
  fonctionnalité neuve (comportement visible, à documenter côté
  extension/web) — décision produit, hors mécanique de ce lot.
- **D2** (haute) — `licenses.label = email[:64]` à l'inscription
  (`accounts.py:54`), affiché tel quel par `extension/popup/config.js:52`
  ("Licence valide — karim@garage.fr") : changer le libellé changerait ce
  texte affiché au marchand — décision produit sur ce qu'afficher à la
  place, pas un correctif mécanique côté API seule.
- **A2 (acces) / D4** — `POST /v1/observations` laisse toute licence
  réécrire marque/modèle/année/prix d'une annonce, et effacer l'identité
  d'un vendeur pro déjà connu, sur la seule foi de ce que l'émetteur déclare
  (`observations.py:103-117`). Une restriction mécanique (n'accepter
  l'écrasement que d'une licence `automated`) casserait l'usage réel de
  l'extension — poser des observations sur des annonces vues en direct est
  la fonction même du produit, confirmée par
  `test_becoming_private_clears_the_seller` qui documente explicitement
  l'inverse du correctif proposé par l'audit. Une vraie fermeture demande
  soit une corroboration entre émetteurs distincts, soit une attribution de
  la licence sur `listings` (aucune des deux n'existe) — décision de
  conception, hors ce lot.
- **A2 (abus, critique)** — même route, aucun quota de création d'annonce
  inconnue ni de débit par licence : un compte peut fabriquer des milliers
  de fausses annonces par heure, visibles par tout le marché. Bloqué par le
  même constat que ci-dessus (réserver la création aux licences `automated`
  romprait l'usage réel de l'extension) — un vrai quota par licence
  (`usage_days` porte déjà le compte par jour) est envisageable mais
  dimensionner le chiffre est un arbitrage produit, pas fait ici.
- **A3 (acces)** — `POST /v1/disappearances` : deux constatations
  concordantes du MÊME appelant suffisent à faire disparaître une annonce du
  marché de tous, le garde-fou de flotte ne portant que sur la proportion
  globale, jamais sur une attaque ciblée. Même famille de décision que
  ci-dessus (deuxième émetteur distinct requis, ou écriture réservée au
  crawler) : hors ce lot.
- **A5 (abus, haute)** — `GET /v1/sweep` recalcule tout le périmètre avant
  d'appliquer le paramètre `pages` (`sweep.py:95-96`) : `?pages=1` coûte
  aussi cher que `?pages=400`. Correctif = trier puis découper seulement ce
  que le budget peut porter, avec mémoïsation de quelques minutes — un vrai
  refactor de `sweep.py`/`sweep_split.py`, pas une ligne à changer : un lot
  à part.

### Suites

- `cd api && ./.venv/bin/pytest tests/ -q` → **935 / 935** verts.
- `launchctl kickstart -k gui/$UID/fr.adscope.api` relancé (tests verts au
  moment du redémarrage).
- `extension/` et `web/` non touchés par ce lot.

---

## 2026-09-24 — angle extension : T1, T2, T4

Lot fermé côté `extension/` seul, sur les trois trouvailles critiques/hautes
confirmées de cet angle : T1 (haute), T2 (haute), T4 (haute). Les autres
angles (`api/`, `web/`) sont corrigés en parallèle par d'autres agents — non
touchés ici.

Commit : `5b3f378`. Suite `cd extension && node --test tests/*.test.mjs` :
**434 verts** (430 + 4 tests neufs), aucun rouge. Chacun des cinq points
touchés a été vérifié rouge en défaisant la ligne du correctif, puis
restauré (voir détail par trouvaille).

### T1 — pont monde MAIN forgeable

Le pont `window.dispatchEvent(adscope:detail/payload)` que `leboncoin-tap.js`
(monde MAIN) utilise pour parler à `feed.js` (monde isolé) n'authentifie
personne : tout script exécuté sur la page — régie, tag tiers compromis, XSS —
peut l'émettre. Correctifs interimaires (le canal lui-même resterait ouvert à
qui a déjà ce niveau d'accès à la page ; le fermer vraiment demande un
MessageChannel privé posé à `document_start`, ou l'abandon du tap au profit
d'une relecture de `__NEXT_DATA__` à chaque navigation — architecture hors
lot, notée en ouvert ci-dessous) :

- **`extension/src/detail.js`** (`pick`, ligne ~61) — hors fiche (pas
  d'identifiant dans l'URL : accueil, compte, résultats), le repli sur
  `listings[0]` donnait audience à toute charge forgée. Il ne s'applique plus
  que sur une fiche réelle, où il reste utile (navigation monopage prise entre
  deux états). Testé rouge/restauré : `tests/detail.test.mjs`
  (« sans identifiant dans l'URL, aucune annonce n'est décrite ») et
  `tests/lacentrale-dom.test.mjs` (« sur une page de résultats, aucun panneau
  n'est posé »).
- **`extension/src/feed.js`** (`MAX_LEN`, ligne ~24) — une chaîne reçue de
  plus de 4 000 000 caractères est écartée avant `JSON.parse`. N'arrête que
  l'abus grossier (une chaîne démesurée), pas la fabrication elle-même — c'est
  la garde de `detail.js` ci-dessus, et celle déjà en place dans
  `listing.js` (une annonce n'entre au suivi que si une carte réelle de la
  page porte son adresse), qui la limite. Testé rouge/restauré :
  `tests/feed.test.mjs` (« une charge démesurée est ignorée plutôt que
  parsée »).
- **`extension/src/panel-cards.js`** (`follow`, ligne ~56) — le bouton
  « Suivre » n'agit plus que sur un clic dont `isTrusted` est vrai : la page
  pouvait sinon le déclencher elle-même (`el.dispatchEvent(new
  MouseEvent('click'))`), sans geste du lecteur. `extension/tests/stage.mjs`
  simule un clic réel (`isTrusted: true`) et un clic forgé (`click(false)`).
  Testé rouge/restauré : `tests/panel-follow.test.mjs` (« un clic forgé par la
  page ne demande pas le suivi »).

**Ouvert, hors lot** : `src/absence.js` (verdict d'absence) lit
`__NEXT_DATA__` directement, pas le pont événementiel — pas concerné par ce
correctif, et déjà défendu par deux témoins indépendants (`ad === null` +
libellé visible de la page). Le canal lui-même (MessageChannel privé ou
abandon du tap) est une décision d'architecture, pas un correctif mécanique :
non fait. Le plafond d'observations par licence et la journalisation des
émetteurs sont côté API, hors `extension/`.

### T2 — adresse d'API libre : masquerade d'origine

**`extension/popup/config.js`** (`isBase`, ligne ~11) — l'ancienne regex
acceptait `https://api.adscope.fr@evil.example` : une adresse qui se lit comme
la bonne (préfixe de confiance avant `@`) et dont l'origine réelle, celle qui
reçoit la clé de licence via `chrome.permissions.request` et `Authorization:
Bearer`, est `evil.example`. `isBase` compare maintenant `new URL(v).origin`
à `v` lui-même : tout composant qu'une origine ne porte pas (identifiants,
chemin, requête, fragment) fait échouer la comparaison. Testé rouge/restauré :
`tests/config.test.mjs` (« une adresse qui porte des identifiants avant
l'hôte est refusée »).

**Non fait, décision produit** : épingler l'adresse de production comme
constante de build et retirer le champ libre de la version distribuée (le
correctif proposé par l'audit). Pas d'adresse de production connue à ce
jour — la mise en ligne Render n'a pas encore de domaine fixé — et retirer le
champ changerait un comportement visible (plus moyen de pointer vers un poste
de dev). À trancher une fois le domaine de production choisi.

### T4 — code postal complet d'un particulier conservé

**`extension/src/sites/vehicle-fields.js`** (`withZip`, ligne ~34) — prend
désormais un troisième paramètre `pro` : le code postal complet ne sort que
si l'appelant dit un vendeur professionnel, le département reste dérivé dans
tous les cas (aggrégat moins identifiant, feature produit à part).
**`extension/src/sites/leboncoin.js`** (`normalize`, ligne ~59) et
**`extension/src/sites/lacentrale.js`** (`card` et `detail`, lignes ~44/64) —
passent ce type de vendeur à `withZip`, sur les deux sites (le défaut touchait
`leboncoin.js` et `lacentrale.js` à la fois, pas un seul). Testé
rouge/restauré : `tests/vehicle-fields.test.mjs` (« leboncoin — le code postal
complet ne voyage que pour un vendeur pro » et la fiche La Centrale
`FICHES.capped`, un vendeur PART réel de la fixture, qui documentait la fuite
avant correctif).

**Hors `extension/`, corrigé en parallèle** : côté API,
`api/adscope_api/observations.py` doit refuser d'écrire `postal_code` si
`seller_type != "pro"` (aujourd'hui `VEHICLE_FIELDS` l'écrit sans ce tri), et
une migration doit effacer le code postal des annonces de particuliers déjà
en base. Pas touché ici — angle `api/` traité par un autre agent.

### Suites

- `cd extension && node --test tests/*.test.mjs` → **434 / 434** verts.
- `api/` et `web/` non touchés par ce lot (hors périmètre de la tâche).

---

## 2026-09-25 — angle déploiement : les verrous de mise en ligne (§3.1 de la synthèse)

Ferme les neuf points listés en §3.1 de `audit-synthese.md` (« avant
hébergement, toi seul, en ligne ») plus les deux hautes de `audit-project`
côté `api/`. Aucune migration.

### AUTH-06 / C-1 / A6 — plafond par IP forgeable/global selon le déploiement (critique/haute)

**`api/adscope_api/rate_limit.py`** (`client_ip`, neuf), **`config.py`**
(`trusted_proxy`) — `guard` lisait `request.client.host` en dur : derrière
Render, sans configuration explicite, cette valeur est soit celle du client
(un `X-Forwarded-For` forgé la contourne), soit celle du proxy pour tout le
monde (le plafond devient global — 30 connexions bidon interdisent la
connexion à tous les marchands). `client_ip` ne lit l'en-tête que si
`ADSCOPE_TRUSTED_PROXY` est posée, et prend alors le DERNIER élément, jamais
le premier. La frontière réseau elle-même (qui a le droit de poser l'en-tête)
reste `--forwarded-allow-ips` d'uvicorn, documentée dans `api/DEPLOY.md`
(neuf) avec la commande de lancement complète. Tests neufs dans
`test_rate_limit.py`, dont un qui prouve directement le scénario de la
trouvaille : trente marchands distincts derrière le même proxy ne se grillent
plus le plafond l'un l'autre.

### C-2 / AUTH-08 — `ADSCOPE_PUBLIC_URL` non-`https` acceptée en production (haute)

**`api/adscope_api/config.py`** (`validate_startup`, `env`), appelée une fois
à l'import de `main.py` — auparavant rien ne distinguait poste local et
production : une adresse publique oubliée en `http` (ou en `localhost`)
partait en ligne sans avertissement, et le cookie de session de 90 jours
voyageait sans `Secure`. `ADSCOPE_ENV=production` est la seule valeur qui
active le refus ; absente (le poste local), rien ne change. Tests neufs dans
`test_config.py`.

### C-6 — `DATABASE_URL` : défaut sur la base locale, schéma Render non normalisé (moyenne)

**`api/adscope_api/config.py`** (`database_url`, `_normalized`) — l'ancien
`Settings(frozen=True)` figeait l'URL à l'import et acceptait `postgres://`
tel quel (SQLAlchemy cherche alors `psycopg2`, non installé :
`ModuleNotFoundError` sans rapport avec la cause réelle). `database_url()`
normalise `postgres://`/`postgresql://` vers `postgresql+psycopg://` (seul
dialecte installé), et refuse de démarrer avec un message nommant la
variable manquante si `DATABASE_URL` est absente en production — en local,
le défaut `localhost/adscope` ne change pas. `db.py` la lit désormais à
chaque construction du moteur plutôt qu'une valeur figée. Tests neufs dans
`test_config.py`.

### C-5 — aucun manifeste de déploiement (moyenne)

**`api/DEPLOY.md`** (neuf, 71 lignes) — commande d'installation
(`uv sync --frozen`), commande de démarrage complète avec les options de
proxy de C-1, les variables obligatoires et leur pourquoi, et le rappel
qu'une seule instance Render doit tourner (A10 — les plafonds et la clôture
d'usage vivent en mémoire). Pas de `render.yaml` : composer le plan Render, le
domaine et la base sans ta décision aurait figé des choix qui ne sont pas
pris — **à trancher avec toi**. `api/uv.lock` est suivi et à jour
(`uv lock --check` : aucune résolution changée).

### C-7 / INJ-2 — aucun en-tête de sécurité, suite de tests du site servie en ligne (moyenne/haute)

**`api/adscope_api/security_headers.py`** (neuf, middleware ASGI, sur le
modèle de `body_limit.py`) — `X-Content-Type-Options`, `Referrer-Policy`,
`X-Frame-Options` sur toute réponse (API et `/app`, qui partagent l'origine
du cookie) ; une `Content-Security-Policy` sur `/app` seul, compatible avec
le site tel qu'il est aujourd'hui (`script-src 'self'` — un seul script en
ligne restait, dans `web/desabonnement.html`, déplacé vers
`web/js/unsubscribe-page.js`, neuf, sur le modèle de
`balayage-page.js`/`revisits-page.js` ; polices Google conservées,
`style-src`/`font-src` les nomment explicitement — D10, non traité par ce
lot) ; `Strict-Transport-Security` seulement quand `ADSCOPE_PUBLIC_URL` est
en `https`. **`api/adscope_api/static.py`** (`NoCacheStaticFiles.get_response`)
— `web/tests/*.mjs`, qui décrit le contrat exact de chaque route, ne répond
plus que 404 sous `/app/tests/`. Tests neufs : `test_security_headers.py`,
un test dans `test_static_cache.py`.

### C-9 — `ADSCOPE_OPERATOR_EMAIL` comparée sans normalisation (basse)

**`api/adscope_api/config.py`** (`operator_email`) — un espace en trop posé
par un champ de tableau de bord Render (ou une casse différente) fermait la
porte de `require_operator` en silence, sans aucun message. `.strip().lower()`,
même normalisation qu'à l'inscription (`payload.email.strip().lower()`,
`auth_signup.py`). Test neuf dans `test_operator.py`.

### C-10 — la plist suivie documente une porte dérobée qui n'existe plus (basse)

**`scripts/fr.adscope.api.plist`** — `ADSCOPE_DEV_LOGIN` et son commentaire
retirés (la clé n'existe plus dans le code, seul le commentaire laissait
croire l'inverse) ; `ADSCOPE_OPERATOR_EMAIL` posée avec une valeur d'exemple
neutre (`operateur@exemple.fr`), jamais une adresse réelle ; commentaire de
`ADSCOPE_PUBLIC_URL` mis à jour pour expliquer pourquoi ce `http://` local
reste accepté (`ADSCOPE_ENV` absente). Pas de test — fichier de
configuration, pas de code.

### D13 / C-8 — `crawler/.license` non ignoré par git (basse)

**`.gitignore`** — `crawler/.license` ajouté. Vérifié non suivi avant
(`git ls-files crawler/.license` vide) et non ignoré (`git check-ignore -v`
sans sortie) : fenêtre fermée avant tout `git add -A`, pas un rattrapage
d'incident.

### saved_searches.py:94 (audit-project, élevée) — couverture recalculée par ligne plutôt que par forme de requête

**`api/adscope_api/saved_searches.py`** (`get_searches`) — jusqu'à
`MAX_SEARCHES` (50) recherches enregistrées appelaient chacune
`with_coverage` → `status_of` → une requête `market_query.core()` complète
(quatre jointures externes, deux sous-requêtes), en série, à chaque ouverture
de « Mes alertes ». Deux recherches à la même `query` normalisée (marque et
modèle identiques, par exemple) partagent maintenant un seul calcul : une
passe par forme distincte, pas une par ligne. `POST`/`GET`/`PUT` sur une
recherche seule ne changent pas — ils n'appelaient `with_coverage` qu'une
fois. Test neuf : deux recherches à la même `query`, un seul appel à
`status_of` mesuré.

### usage.py:91 (audit-project, élevée) — `compact()` sans verrou, `_closed_on` posé avant le succès

**`api/adscope_api/usage.py`** (`compact`, `compact_daily`) — deux
compactions concurrentes (une requête API proche de la limite du jour et
`scripts/usage_compact.py`, ou deux requêtes API l'une contre l'autre — les
routes synchrones tournent dans un threadpool) pouvaient lire les mêmes
lignes `UsageDay` avant que l'une ou l'autre ne les supprime, et compter deux
fois le même volume dans `UsageSummary` (chiffres d'usage, pertinents pour la
facturation). `compact()` prend maintenant `pg_advisory_xact_lock` en
première ligne, relâché au commit/rollback de sa transaction. Par ailleurs
`compact_daily` posait `_closed_on = day` AVANT d'appeler `compact` : un
échec (verrou en attente, base coupée) marquait quand même la journée close,
et plus aucun appel suivant du même jour ne la refermait jamais — posé
maintenant après le succès. Tests neufs : le verrou tenu par une vraie
seconde connexion tant que la transaction n'est pas close (`pg_try_advisory_xact_lock`),
et `_closed_on` qui reste `None` quand `compact` lève.

### Suites

- `cd api && ./.venv/bin/pytest tests/ -q` → **941 / 941** verts (25 tests
  neufs). Chaque ligne de correctif listée ci-dessus a été vérifiée rouge en
  la défaisant, puis restaurée.
- `node --test web/tests/*.test.mjs` → **166 / 166** verts (`web/desabonnement.html`
  et `web/js/unsubscribe-page.js`, neuf, sans changement de contrat testé).
- `node --test extension/tests/*.test.mjs` → **434 / 434** verts,
  `extension/` non touché par ce lot.
- `launchctl kickstart -k gui/$UID/fr.adscope.api` relancé après coup, une
  fois les tests verts.

### Ouvert, non traité dans ce lot

- **A10** (moyenne) — les plafonds anti-abus et la clôture d'usage restent en
  mémoire par processus ; `api/DEPLOY.md` écrit noir sur blanc « une seule
  instance Render », mais rien ne l'impose techniquement (Redis ou état en
  base, une demi-journée de travail — décision produit sur le coût).
- **D10** (moyenne) — les quatre pages du site chargent toujours les polices
  chez Google (`web/*.html`) : l'IP du marchand part hors UE sans base
  légale. La CSP de ce lot les nomme explicitement plutôt que de les
  retirer — non demandé par ce lot.
- **render.yaml** — délibérément pas créé : le plan Render, le domaine de
  production et le choix de base sont à trancher avec Alexis avant de figer
  quoi que ce soit dans un manifeste versionné. `api/DEPLOY.md` documente la
  commande sans le fichier.
- Le reste de §3.2/§3.3 de `audit-synthese.md` (quota d'écriture, suppression
  de compte, durées de conservation, etc.) — hors périmètre explicite de ce
  lot, qui ne portait que sur §3.1 et les deux hautes d'`audit-project` côté
  `api/`.

---

## 2026-09-25 — angle `web/`+`extension/` : D10, une haute et une performance d'`audit-project`, plus deux moyennes bon marché

Lot fermé côté `web/`/`extension/`. Reprend D10, laissé ouvert par le lot du
24 (§3.1), et trois constats moyens/élevés d'`audit-project --quick` limités à
ce périmètre. `crawler/RUNBOOK-balayage.md`, modifié par Alexis en cours de
session, non touché.

### D10 — polices Google retirées, plus aucun chargement externe

**`web/index.html`, `web/balayage.html`, `web/revisites.html`,
`web/desabonnement.html`, `web/css/base.css`** — les trois balises
`fonts.googleapis.com`/`fonts.gstatic.com` retirées des quatre pages ;
`font-family` retombe sur la pile système (`-apple-system,
BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`). Pas de woff2
embarqué : le seul trouvé sur la machine (`dating-sim/.../manrope-latin.woff2`)
est une police variable déclarée `font-weight: 400 700` dans ce projet tiers,
alors qu'adscope utilise aussi le poids 800 (`.marque`, `.vue-t`,
`.panneau-t`) — l'embarquer sans vérifier sa couverture de graisse aurait pu
rendre un 800 mal interpolé ; la pile système est le choix sûr, conforme à
l'alternative offerte par la consigne. Test neuf
`web/tests/no-external-fonts.test.mjs` : grep de tous les `.html`/`.css` du
site contre `fonts\.(googleapis|gstatic)\.com`.

En cascade, `api/adscope_api/security_headers.py` : la CSP autorisait
explicitement ces deux domaines (posée au lot du 24, le commentaire du fichier
disait lui-même « D10 non traité par ce lot ») ; `style-src`/`font-src`
retirés, `default-src 'self'` suffit maintenant. Test
`test_the_csp_allows_google_fonts_and_only_local_scripts` renommé et inversé
(`test_the_csp_allows_no_third_party_domain`) — vérifié rouge sur l'ancienne
CSP.

### api-auth.js:25 (api-designer, élevée) — un detail non textuel (422) rendait « [object Object] »

**`web/js/api-auth.js`** (`call`) — une 422 de validation Pydantic native
(`EmailStr` malformé sur `/v1/auth/signup`/`/login`) rend `detail` en liste
d'objets ; `new ApiError(status, detail)` le stringifiait en littéralement
« [object Object] », affiché tel quel à Karim par `login.js`/`signup.js`. Le
detail n'est retenu que s'il est une chaîne (`typeof body === 'string'`),
sinon repli sur le message générique `${path} a répondu ${res.status}`. Test
neuf dans `api-auth.test.mjs`, vérifié rouge sur l'ancien code (message
`Error: [object Object]`).

Vérifié : `web/js/api.js` (`request`) n'a **pas** le même défaut — il ne lit
jamais `detail` du tout, il jette systématiquement un message générique par
statut. C'est le constat moyen voisin de l'audit (perte du detail 409/429 sur
les routes hors auth, `api.js:57`) : différent, pas corrigé ici, non demandé
par ce lot.

### listing.js:101 + sites (performance-engineer, élevée) — une carte par annonce → une carte par rendu

**`extension/src/listing.js`, `extension/src/sites/leboncoin.js`,
`extension/src/sites/lacentrale.js`** — `render()` appelait
`site.card(document, listing)` par annonce affichée, chacun un
`querySelectorAll` complet et non borné sur tout le document ; mesuré à ~29
lots de mutations dans la seconde qui suit un chargement (commentaire déjà en
place dans `listing.js`). Chaque site expose maintenant `cardMap(doc)` :
une seule lecture de tous les liens du document, groupés par identifiant
d'annonce dans une `Map` (leboncoin réutilise `urlId` pour l'extraction,
La Centrale aussi) ; `listing.js` la construit une fois par rendu et y fait
une lecture (`Map.get`) par annonce au lieu d'une requête DOM. Une mise en
avant (bannière `boostVo` de La Centrale) garde ses deux cartes sous la même
clé — comportement inchangé, `lacentrale-dom.test.mjs` le vérifie toujours.

Tests neufs (un par site, `dom.test.mjs` et `lacentrale-dom.test.mjs`) :
dix, puis vingt-trois annonces dans la charge ne coûtent pas plus de lectures
du document qu'une seule — vérifiés rouges sur l'ancien code (12 contre 3
lectures pour dix annonces côté leboncoin, 27 contre 5 pour vingt-trois côté
La Centrale).

### Deux moyennes bon marché d'`audit-project`

- **`web/js/market-list.js:46`** (code-quality-reviewer) — un double clic
  (ou deux Entrée) sur « Voir plus » lisait deux fois le même
  `state.items.length` avant la première réponse et doublait la page
  suivante dans la liste. Garde `enCours` autour de `charger` (motif suggéré
  par l'audit). Deux tests neufs dans `web/tests/market-list.test.mjs` : le
  double appel ne part qu'une fois, et le « Voir plus » suivant fonctionne
  une fois le premier résolu — vérifié rouge sur l'ancien code (2 appels
  réseau au lieu d'1).
- **`extension/src/sync.js:67`** (backend-specialist) — `queued` marquait
  une annonce avant l'envoi et ne la relâchait que sur échec : une annonce
  synchronisée avec succès une fois restait exclue de `sync.send` pour le
  reste de la vie de l'onglet, même affichée des heures sur une page SPA qui
  ne se recharge jamais. Relâchée aussi sur succès, mais après un délai
  (`FRESH_MS`, 6 h, même seuil que `observation.js` — dupliqué, pas importé :
  content script et service worker sont deux royaumes JS séparés), pas
  immédiatement : un relâchement immédiat aurait cassé la dédoublonnage de
  rafale que `sync.js` garantit ailleurs (« une annonce déjà transmise ne
  repart pas », test existant). `setTimeout(...).unref()` : ce minuteur ne
  retient jamais un process de test vivant six heures. Test neuf avec les
  minuteurs simulés de `node:test` (`t.mock.timers`), jamais l'horloge
  réelle — vérifié rouge sur l'ancien code.

### Suites

- `cd api && ./.venv/bin/pytest tests/ -q` → **941 / 941** verts (aucun test
  neuf côté `api/` — un test existant renommé/inversé pour D10).
- `node --test web/tests/*.test.mjs` → **171 / 171** verts (166 + 5 neufs :
  2 D10, 1 api-auth, 2 market-list).
- `node --test extension/tests/*.test.mjs` → **437 / 437** verts (434 + 3
  neufs : 1 par site pour la carte, 1 sync).
- Chaque ligne de correctif listée ci-dessus a été vérifiée rouge en la
  défaisant (`git stash` du seul fichier concerné), puis restaurée.
- Pas de migration, aucun service à relancer (`web/`/`extension/` seuls —
  `launchctl kickstart` non nécessaire ; l'API a changé de code mais pas de
  contrat, redéploiement laissé au prochain lot qui touche `api/`).

### Ouvert, non traité dans ce lot

- **`web/js/api.js:57`** (api-designer, moyenne) — perte du `detail` sur les
  routes hors auth (quota 409 sur `/v1/searches`, 429). Vérifié comme
  n'ayant pas le défaut « [object Object] », pas corrigé : changement de
  comportement plus large (afficher un message serveur là où un message
  générique suffisait), non demandé par ce lot.
- **`extension/popup/popup.html:89`** (architecture-reviewer, moyenne) — les
  balises `<script>` des sites y sont codées en dur, hors du manifeste que
  lit `sw.js`. Pas « < 10 lignes » : générer les balises depuis le manifeste
  ou ajouter un test de parité touche au chargement de la popup, pas
  seulement à une fonction isolée.
- **`extension/src/lookup.js:20`** (architecture-reviewer, moyenne) —
  `lookup.get` réimplémente le socle réseau de `api.call` au lieu de s'appuyer
  dessus. Refactor, pas un correctif borné ; risque de toucher un chemin déjà
  couvert sans bénéfice de sûreté immédiat.
- **`web/js/format.js:37`** (architecture-reviewer, faible) — duplication
  avec `extension/src/format.js`, déjà documentée en commentaire. Faible
  sévérité, hors des deux exemples cités par ce lot.
- **`extension/src/access.js:27` et `:49`, `web/js/api-sweep.js:8`,
  `web/js/unsubscribe.js:28`, `web/js/switch.js:18`,
  `web/js/account-page.js:17`** (test-quality-guardian, moyennes/faible) —
  lacunes de test, aucune ne pointe un défaut de code à corriger. Les quatre
  dernières demandent un décor DOM que `web/tests/` n'a pas encore
  (`market-list.test.mjs` en ébauche un, minimal, pour ce lot seul) — un lot
  à part, pas un ajout de dix lignes.
- **`api/adscope_api/rate_limit.py:77`** (api-designer, faible) — en-tête
  `Retry-After` absent sur les 429. Côté `api/`, hors périmètre explicite de
  ce lot (« web/extension »).
