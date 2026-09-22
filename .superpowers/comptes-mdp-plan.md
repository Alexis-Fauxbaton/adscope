# Comptes avec mot de passe — le plan

Décidé le 2026-09-22 : « plus classique, moins casse-tête ». Le lien magique
disparaît en tant que connexion ; sa mécanique (`login_tokens`) reste et sert
les liens de vérification et de réinitialisation. `ADSCOPE_DEV_LOGIN` et
`ADSCOPE_OPEN_SIGNUP` disparaissent.

Compteurs de départ, pris au début de ce lot (F2 travaille en parallèle) :
**API 847**, **web 150**, **extension 427**, tous verts.

## Le parcours de Karim, avant toute ligne de code

Karim est marchand, pas technicien, sur ordinateur au garage et sur téléphone
entre deux essais.

1. Il arrive sur `http://localhost:8000/app`. Pas de session → **Connexion** :
   email, mot de passe, « Mot de passe oublié ? », « Créer un compte ».
2. Il n'a pas de compte : **Créer un compte**. Email, mot de passe (une seule
   fois, avec un œil pour l'afficher — pas de champ « confirmez »), la règle
   écrite sous le champ *avant* qu'il se trompe : « au moins 10 caractères ».
3. Écran **Vérifiez votre email** : « Un email est parti à karim@… Ouvrez-le
   pour activer votre compte. » Bouton « Renvoyer l'email ».
4. Il ouvre l'email, clique. **Page d'arrivée** : « Votre email est vérifié. »
   Il est connecté, le bouton l'emmène sur Mes suivis. Il ne retape rien.
5. Le lendemain il se reconnecte : email + mot de passe. S'il se trompe :
   « Email ou mot de passe incorrect. » — une seule phrase, toujours la même.
6. Il a oublié : « Mot de passe oublié ? » → **Mot de passe oublié** (email) →
   « Si un compte existe, un lien vient de partir. » → email → **Nouveau mot de
   passe** → il est connecté, et toutes ses autres sessions sont tombées.
7. **Mon compte** : son adresse, « Changer le mot de passe » (ancien + nouveau),
   « Se déconnecter ».

Ce qu'il ne voit jamais : une clé, un jeton, le mot « licence », une réponse qui
lui dit si une adresse est déjà cliente (sauf à l'inscription, cf. § Pièges).

## Décisions tranchées

**D1 — Les deux liens pointent vers le site, jeton dans le fragment, et c'est
une page qui POSTe.** `GET /v1/auth/verify?token=…` (qui consommait) disparaît.
Raison : un antivirus de messagerie ou un préchargeur de lien suit les `GET` des
emails et **brûlerait le jeton avant Karim** — un usage unique consommé par une
machine. Un fragment (`#/verification?token=…`) n'est jamais envoyé au serveur,
donc jamais préchargé, jamais journalisé par un proxy. La page lit le fragment,
POSTe, puis efface le fragment (`history.replaceState`).

**D2 — Le mot de passe en attente ne s'active qu'au clic.** `signup` sur un
compte existant sans mot de passe (les comptes du lot Comptes, dont celui
d'Alexis) écrit `pending_password_hash` et rien d'autre. `verify` seul fait
`password_hash = pending_password_hash`. Sans cela, n'importe qui connaissant
une adresse prend le compte qui va avec.

**D3 — Le 409 à l'inscription est un aveu assumé.** Dire « un compte existe
déjà » énumère les adresses. C'est exigé (Karim doit savoir qu'il doit se
connecter) et c'est ce que fait tout site. Borné par le limiteur par IP. Partout
ailleurs — connexion, oubli, renvoi — la réponse est indistincte. Le 403
« Vérifiez votre email » n'est rendu **qu'après** vérification du mot de passe :
il n'apprend rien à qui ne le connaît pas.

**D4 — Le limiteur tranche avant le hachage.** Argon2id coûte ~60 ms ; une route
qui hache avant de compter est un amplificateur de charge. `guard()` est la
première ligne de chaque route.

**D5 — `X-Adscope: 1` exigé aussi sur les routes non authentifiées** de `/v1/auth`
(inscription, connexion, oubli, renvoi, vérification, réinitialisation). Ça ferme
le CSRF de connexion (un tiers connecte Karim dans *son* compte à lui pour lire
ce qu'il y met). `web/js/api.js` le pose déjà sur tout POST.

**D6 — Aucun lien dans un journal.** `send_login_link` (qui journalisait le lien
en `warning`) est retiré. Les emails locaux vont dans une table `mails`, lue par
`api/scripts/mail_outbox.py` — le même chemin que l'email du matin (`digests` +
`scripts/send_digests.py`). **Aucune route HTTP ne rend un lien.**

**D7 — Rien n'est rétro-marqué comme vérifié.** La migration ne fait aucun
`UPDATE`. Un compte d'avant ce lot a `password_hash IS NULL` : la connexion par
mot de passe lui est refusée de toute façon, `email_verified_at` ne change rien.
Sa session en cours et sa licence restent intactes — le compte d'Alexis reste
utilisable, et il se donne un mot de passe par « Créer un compte » avec son
adresse (parcours D2).

**D8 — Paramètres Argon2id explicites et éprouvés** : `t=3, m=65536 KiB, p=4`
(les défauts d'`argon2-cffi`, écrits en clair). Les tests remplacent le hacheur
par des paramètres bon marché (fixture autouse) pour ne pas payer 60 ms par
test ; **un** test vérifie que les paramètres de production sont les forts.

**D9 — Deux durées de jeton** : vérification 60 min (Karim passe du garage au
téléphone), réinitialisation 30 min (le plus dangereux des deux). `purpose` est
une colonne : un jeton de réinitialisation ne vérifie pas un email, et
réciproquement.

**D10 — `request.client.host` pour l'IP, jamais un en-tête.** Le lot Comptes a
banni de `api/` toute lecture d'en-tête choisi par le client
(`X-Forwarded-For`, `Host`). Derrière nginx, l'IP vue sera `127.0.0.1` et le
plafond par IP deviendra global : **dette de go-live**, notée au rapport ; le
plafond par email, lui, tient dans tous les cas.

**D11 — La réinitialisation ferme toutes les sessions et en ouvre une neuve** ;
le changement connecté ferme toutes les autres et garde la courante.

**D12 — `scripts/fr.adscope.api.plist` n'est pas touché** (`scripts/` interdit à
ce lot). `ADSCOPE_DEV_LOGIN=1` y restera comme clé morte, sans effet une fois la
variable retirée du code. À signaler à Alexis dans le rapport.

## Schéma

Sur `accounts` (trois colonnes, toutes nullables, aucune donnée touchée) :

| Colonne | Type | Rôle |
|---|---|---|
| `password_hash` | `varchar(128)` | Argon2id encodé (~97 car.) ; `NULL` = pas de mot de passe |
| `pending_password_hash` | `varchar(128)` | posé à l'inscription, promu à la vérification |
| `email_verified_at` | `timestamptz` | `NULL` = non vérifié |

Sur `login_tokens` : `purpose varchar(16) NOT NULL DEFAULT 'verify'`
(`'verify'` | `'reset'`). Le défaut rend la migration non destructive pour les
jetons en vol.

Table neuve `mails` — la boîte d'envoi transactionnelle locale :
`id serial`, `account_id → accounts(id) ON DELETE CASCADE`,
`kind varchar(16)`, `subject varchar(200)`, `text text`,
`created_at timestamptz`, index `(account_id, created_at)`.
Pas de colonne d'adresse : elle se résout à la lecture (`accounts.email`),
comme `digests` le fait déjà, pour ne jamais garder une copie périmée.

**Migration `014_passwords`** (prendre le numéro libre au moment de commiter,
F2 peut poser la 014) : cinq `ALTER … ADD COLUMN IF NOT EXISTS`, un
`CREATE TABLE IF NOT EXISTS`, un `CREATE INDEX IF NOT EXISTS`. Aucun `UPDATE`,
aucun `DROP`. `tests/test_migrations.py` compare le schéma produit à celui de
`create_all` : les longueurs `varchar` doivent coïncider au caractère près.
`pg_dump` de `adscope` vers `~/adscope-backups/adscope-<date>.dump` avant
d'appliquer, et relance du service **seulement** tests verts.

## Contrat HTTP

Tout en `POST`, tout sous `/v1/auth`, tout exigeant `X-Adscope: 1` (sinon 403
« en-tête X-Adscope attendu »). Un corps d'erreur est toujours
`{"detail": "<phrase pour Karim>"}`. Aucune réponse ne contient jamais de jeton
ni de lien.

| Route | Corps | Succès | Échecs |
|---|---|---|---|
| `/v1/auth/signup` | `{email, password}` | `202 {"sent": true}` | `409` compte déjà pourvu · `422` règle · `429` |
| `/v1/auth/verify` | `{token}` | `204` + `Set-Cookie` | `400` lien mort · `429` |
| `/v1/auth/resend` | `{email}` | `202 {"sent": true}` | `429` |
| `/v1/auth/login` | `{email, password}` | `204` + `Set-Cookie` | `401` · `403` non vérifié · `429` |
| `/v1/auth/forgot` | `{email}` | `202 {"sent": true}` | `429` |
| `/v1/auth/password/reset` | `{token, password}` | `204` + `Set-Cookie` | `400` · `422` · `429` |
| `/v1/auth/password` | `{current, password}` | `204` (cookie) | `401` ancien faux · `422` · `403` clé sans compte |
| `/v1/auth/logout` | — | `204` | inchangée |
| `GET /v1/me` | — | `{email, label, expires_at}` | inchangée |

Messages, mot pour mot (une seule source, `api/adscope_api/accounts.py`) :

- 401 connexion : `Email ou mot de passe incorrect.`
- 403 non vérifié : `Vérifiez votre email : un lien vous attend dans votre boîte.`
- 409 : `Un compte existe déjà avec cet email. Connectez-vous.`
- 422 court : `Choisissez un mot de passe d'au moins 10 caractères.`
- 422 courant : `Ce mot de passe est trop courant. Choisissez-en un autre.`
- 422 long : `Mot de passe trop long (128 caractères au maximum).`
- 400 jeton : `Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.`
- 401 ancien mot de passe : `Mot de passe actuel incorrect.`
- 429 : `Trop de tentatives. Réessayez dans quelques minutes.`

`email` : `max_length=254`, `.strip().lower()`. `password` : `max_length=128`
côté Pydantic (au-delà, on ne hache même pas).

## Le chemin local des liens

`mail_outbox.post(session, account_id, kind, subject, text)` insère une ligne
dans `mails`, dans la même transaction que le jeton. Le corps porte le lien :

    http://localhost:8000/app/#/verification?token=…      (kind='verification')
    http://localhost:8000/app/#/nouveau-mdp?token=…        (kind='reinitialisation')

La base est `config.public_url()`, jamais l'en-tête `Host` (correctif du
2026-09-18, à ne pas perdre). Alexis les relit en terminal :

    api/.venv/bin/python api/scripts/mail_outbox.py --tail 5

Au go-live 2, `post()` est le seul endroit à remplacer par un vrai fournisseur.
Note de sécurité : le lien est en clair dans la base pendant 30 à 60 minutes —
même exposition que l'ancien lien en clair dans le journal, bornée par la
péremption. Le rapport le porte.

## Le limiteur de débit

`api/adscope_api/rate_limit.py`, en mémoire (une seule instance), fenêtre
glissante, horloge injectée :

```
Limiter.hit(bucket, key, now) -> bool   # False = plafond atteint
```

Un `dict[(bucket, key)] -> list[datetime]`, purgé de ce qui sort de la fenêtre
à chaque appel. `guard(bucket, email, request, now)` compte **deux** clés —
`("email", email)` et `("ip", request.client.host)` — et lève `429`.

| Bucket | par email | par IP | fenêtre |
|---|---|---|---|
| `login` | 10 | 30 | 15 min |
| `signup` | 5 | 10 | 60 min |
| `forgot` | 5 | 10 | 60 min |
| `resend` | 5 | 10 | 60 min |
| `verify` / `reset` | — | 30 | 15 min |

Les buckets sont vidés entre deux tests par une fixture autouse (l'état est un
module, il traverserait sinon d'un test à l'autre). `MAX_PENDING = 5` jetons
valables par compte et par `purpose` reste une seconde ceinture.

## Découpage en fichiers (aucun > 150 lignes)

**API (neufs)** — `passwords.py` (hacheur, politique, `waste_time`),
`common_passwords.py` (~120 mots, frozenset), `rate_limit.py`,
`accounts.py` (le domaine : `signup`, `verify`, `login`, `forgot`, `reset`,
`change`, aucun HTTP), `mail_outbox.py` (+ modèle `Mail` dans `auth_models.py`),
`auth_signup.py` (routes inscription / vérification / renvoi / oubli /
réinitialisation), `scripts/mail_outbox.py`.

**API (modifiés)** — `auth_email.py` (ne garde que connexion, déconnexion,
changement de mot de passe, `/v1/me` ; perd `dev_login`, `enroll`,
`open_signup`, `announce_dev_login`, `GET /v1/auth/verify`), `login_tokens.py`
(`purpose`, plus de transport, plus de variables de dev), `auth_models.py`,
`migration_registry.py` (+ `migration_sql_passwords.py` si le SQL le fait
dépasser), `main.py` (un `include_router`), `pyproject.toml` (+ `argon2-cffi`,
posé par `uv add argon2-cffi` depuis `api/` — vérifier d'abord
`./.venv/bin/python -c "import argon2"`, Python 3.14 dans ce `.venv`).

**Site (neufs)** — `js/api-auth.js` (tous les appels d'auth, sur le `request`
d'`api.js`, comme `api-alerts.js`), `js/signup.js` (créer un compte + « vérifiez
votre email » + page d'arrivée), `js/password-reset.js` (oublié + nouveau),
`js/account-page.js` (Mon compte), `js/auth-routes.js` (le routeur public :
`#/connexion`, `#/inscription`, `#/verifiez`, `#/verification`, `#/mdp-oublie`,
`#/nouveau-mdp`).

**Site (modifiés)** — `js/login.js` (email + mot de passe + deux liens),
`js/app.js` (`demarrer()` bascule sur le routeur public ; nav + « Mon compte »),
`js/api.js` (`login`/`logout` déménagent), `js/fixtures.js` (mode `?demo=1`
aligné), `css/views.css` (`.entree .champ` est en monospace — hérité du collage
de clé ; à rendre proportionnel, et une ligne pour l'œil « afficher »).

**Extension** — `src/auth-notice.js` et `popup/account.js` : l'URL ouverte
devient `${apiBase}/app/#/connexion` quand il n'y a pas de session. Rien d'autre.

## Les tests, et la ligne que chacun fait rougir

`api/tests/test_passwords.py` — le haché ne contient pas le clair
(`passwords.hash`) · `verify` vrai/faux (`passwords.verify`) · 9 refusé / 10
accepté (`if len(p) < MIN_LENGTH`) · mot courant refusé, casse ignorée
(`p.lower() in COMMON`) · le message dit la règle (la constante) ·
`waste_time` hache vraiment (compteur d'appels, pas de chronomètre) · les
paramètres de production sont `t=3 m=65536 p=4` (la ligne `PasswordHasher(...)`).

`api/tests/test_rate_limit.py` (horloge injectée) — la N-ième passe, la N+1 non
(`if len(hits) >= limit`) · la fenêtre écoulée rouvre (la purge) · email et IP
comptent séparément (la clé du dict) · le 429 porte le message lisible.

`api/tests/test_auth_signup.py` — l'inscription crée un compte non vérifié, une
ligne `mails`, et **aucun jeton dans la réponse** (grep du corps) ·
la connexion est refusée tant que non vérifiée (`if account.email_verified_at is
None`) · le clic vérifie, promeut le mot de passe en attente et ouvre une session
(`password_hash = pending_password_hash`) · jeton rejoué → 400 (`used_at IS
NULL`) · jeton `reset` refusé ici (`AND purpose = :purpose`) · adresse déjà
pourvue → 409 avec le message exact · **compte sans mot de passe (cas Alexis)** :
202, et la connexion reste refusée tant qu'on n'a pas cliqué (`if
account.password_hash is None`) · deux inscriptions simultanées sur la même
adresse → un seul compte, aucun 500 (fixture `concurrently`, `ON CONFLICT
(email) DO NOTHING`) · renvoi sur adresse inconnue → même 202 · le limiteur
tranche avant le hachage (compteur de hachages à 0 sur le 429).

`api/tests/test_auth_login.py` — bon mot de passe → 204 + cookie · deux
connexions = deux lignes de session distinctes (`sessions.create`) · mauvais mot
de passe et adresse inconnue rendent **le même** 401, même phrase (la constante)
· adresse inconnue → `waste_time` appelé (compteur) · sans `X-Adscope` → 403
(`check_csrf`) · 429 par email puis par IP · déconnexion inchangée.

`api/tests/test_auth_reset.py` — oubli : même 202, connue ou non · sur adresse
connue, une ligne `mails` de `purpose='reset'` · la réinitialisation change le
mot de passe, **ferme toutes** les sessions et en ouvre une (`DELETE FROM
sessions WHERE account_id =`) · un jeton `verify` ne réinitialise pas · le
changement connecté exige l'ancien (`if not verify(current)`), ferme les autres
et **garde la courante** (`token_hash <> :current`) · par clé `Bearer` → 403.

`api/tests/test_migrations.py` (+) — les trois colonnes d'`accounts`, `purpose`,
la table `mails` et son index · un compte d'avant la migration garde sa session
et sa licence (la migration ne contient aucun `UPDATE`).

**Dette de suite** : `test_session_cookie.py` et `test_saved_searches.py`
(fichier de F2 — attendre qu'il soit propre) ouvrent leur session par
`dev_link`. Remplacer par un helper `sign_in(browser, session, email)` dans
`conftest.py` (pose le cookie via `sessions.create`, sans email) ; le parcours
réel reste éprouvé dans `test_auth_signup.py`.

`web/tests/` — `api-auth.test.mjs` (chaque appel : chemin, corps, `X-Adscope`,
jamais de mot de passe en query) · `login.test.mjs` (le 403 bascule sur
« vérifiez votre email » avec le bouton de renvoi) · `signup.test.mjs` (la règle
des 10 caractères est dite avant l'envoi, mot pour mot comme l'API) ·
`auth-routes.test.mjs` (le hash choisit la page ; le jeton est retiré de l'URL
après usage).

`extension/tests/` — `auth-notice.test.mjs` et `popup.test.mjs` : l'URL ouverte
est `…/app/#/connexion`.

## Les pièges

1. **Préchargement des liens d'email** — un scanner suit les `GET` et brûle
   l'usage unique. D1 (fragment + POST) le ferme.
2. **Énumération** — assumée au seul 409 d'inscription (D3) ; ailleurs, réponses
   et temps de réponse indistincts (`waste_time`).
3. **Jeton rejoué** — `UPDATE … WHERE used_at IS NULL … RETURNING`, déjà éprouvé
   au lot Comptes ; y ajouter `AND purpose = :purpose`.
4. **Course sur l'usage unique** — la même instruction unique. Course **neuve** :
   deux inscriptions simultanées sur la même adresse font lever la contrainte
   `UNIQUE(email)` et rendraient un 500 → `INSERT … ON CONFLICT (email) DO
   NOTHING RETURNING id`, puis relecture.
5. **Fixation de session** — aucun identifiant de session n'est jamais accepté du
   client ; chaque connexion, vérification et réinitialisation frappe un jeton
   neuf ; la réinitialisation ferme tout (D11).
6. **Activation sans clic** — D2. Le test « connexion refusée avant le clic » est
   le garde-fou.
7. **Mot de passe qui fuit** — jamais en query string, jamais journalisé, jamais
   renvoyé dans un corps d'erreur ; `repr` des modèles ne porte pas les hachés.
8. **Argon2 comme amplificateur** — D4, prouvé par un test.
9. **CSRF de connexion** — D5.
10. **Le limiteur est un état de module** — il traverse les tests si on ne le
    vide pas, et il est à zéro après chaque redémarrage du service (accepté :
    une instance, pas de Redis).
11. **`test_migrations` compare `create_all` et le SQL** — longueurs `varchar`
    identiques des deux côtés, sinon la suite rougit pour une virgule.
12. **Le compte d'Alexis** — rien de destructif, sa session ouverte survit ; il
    se donne un mot de passe par « Créer un compte » (D2/D7).

## Captures à rejouer

`docs/site-v0-connexion.png` (remplace l'ancienne), `site-v0-inscription.png`,
`site-v0-mdp-oublie.png`, `site-v0-mon-compte.png`,
`site-v0-connexion-mobile.png` — sur `http://localhost:8000/app`, jamais
`127.0.0.1` (deux hôtes, deux cookies), registre `docs/panneau-conception.md`.

## Hors lot, à porter au rapport

Fournisseur d'email réel (go-live 2) · 2FA · connexion Google ·
**suppression de compte : dette RGPD** · balayage des sessions périmées ·
`check_needs_rehash` le jour où les paramètres Argon2 bougent ·
l'IP derrière un proxy (D10) · la clé morte `ADSCOPE_DEV_LOGIN` dans
`scripts/fr.adscope.api.plist` (D12).
