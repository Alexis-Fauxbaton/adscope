# Comptes avec mot de passe — côté API, rapport de fin de lot

Périmètre : `api/` uniquement, points 1 à 7 et 10 du plan
(`.superpowers/comptes-mdp-plan.md`, commit `f4ed153`). Le site (points 8-9)
et l'extension (point 9, deux lignes seulement) sont hors de ce lot.

## Statut

Fait, tests verts, service restauré sur `adscope`. Compteurs de départ pris
au début du lot : **API 847**, web 150, extension 427, tous verts.

## Ce qui a été livré

**Nouveau (API)** : `passwords.py` (Argon2id, politique, `waste_time`),
`common_passwords.py` (~100 mots refusés), `rate_limit.py` (fenêtre glissante,
en mémoire, horloge injectée), `accounts.py` (domaine : signup/verify/login/
forgot/reset_password/change_password, une seule source pour les messages),
`mail_outbox.py` (+ modèle `Mail`), `auth_signup.py` (routes signup/verify/
resend/forgot/password-reset), `migration_sql_passwords.py` (SQL de la
migration, sorti de `migration_registry.py` qui était à sa limite de 150
lignes), `scripts/mail_outbox.py --tail` (lit la boîte d'envoi locale).

**Modifié** : `auth_email.py` (ne garde que login/logout/password/me — perd
`dev_login`, `enroll`, `open_signup`, `announce_dev_login`, `GET /v1/auth/verify`),
`login_tokens.py` (`mint`/`consume` prennent `purpose`, perd tout ce qui
concernait le lien magique et le mode dev), `auth_models.py` (3 colonnes sur
`Account`, `purpose` sur `LoginToken`, modèle `Mail`), `sessions.py` (+
`close_all`, `close_others`), `migration_registry.py` (+ migration
`014_passwords`), `main.py` (montage du nouveau routeur), `config.py`
(commentaire obsolète corrigé), `pyproject.toml`/`uv.lock` (+ `argon2-cffi`,
posé par `uv add` depuis `api/`, vérifié d'abord sur ce `.venv` en
Python 3.14.6).

Aucun fichier source au-delà de 150 lignes (`main.py` à 149,
`migration_registry.py` à 150 pile). Deux fichiers de test dépassent
légèrement (`test_auth_signup.py` à 173, `conftest.py` à 158) — soft limit
pour les tests, jugé préférable à un découpage qui aurait dilué la lisibilité.

## Contrat HTTP final

Tout en `POST`, tout sous `/v1/auth`, tout exige `X-Adscope: 1` (sinon `403
en-tête X-Adscope attendu` — y compris les routes non authentifiées, ferme le
CSRF de connexion). Un corps d'erreur est `{"detail": "<phrase>"}`. Aucune
réponse ne rend jamais de jeton ni de lien.

| Route | Corps | Succès | Échecs |
|---|---|---|---|
| `POST /v1/auth/signup` | `{email, password}` | `202 {"sent": true}` | `409` compte déjà pourvu · `422` règle · `429` |
| `POST /v1/auth/verify` | `{token}` | `204` + `Set-Cookie` | `400` lien mort/mauvais usage · `429` |
| `POST /v1/auth/resend` | `{email}` | `202 {"sent": true}` | `429` |
| `POST /v1/auth/login` | `{email, password}` | `204` + `Set-Cookie` | `401` · `403` non vérifié (après vérif. du mot de passe) · `429` |
| `POST /v1/auth/forgot` | `{email}` | `202 {"sent": true}` | `429` |
| `POST /v1/auth/password/reset` | `{token, password}` | `204` + `Set-Cookie` | `400` · `422` · `429` |
| `POST /v1/auth/password` (connecté) | `{current, password}` | `204` | `401` ancien faux · `422` · `403` clé sans compte |
| `POST /v1/auth/logout` | — | `204` | inchangé |
| `GET /v1/me` | — | `{email, label, expires_at}` | inchangé |

`GET /v1/auth/verify` a disparu : les liens (vérification, réinitialisation)
pointent vers `http://localhost:8000/app/#/verification?token=…` ou
`#/nouveau-mdp?token=…` — jeton dans le **fragment**, jamais envoyé au
serveur par un `GET`, pour qu'un antivirus de messagerie qui précharge les
liens d'un email ne brûle pas l'usage unique avant le clic de Karim. La page
qui les reçoit doit désormais **POSTer** (travail du lot site, hors périmètre
ici).

Messages exacts (`accounts.py` pour les quatre premiers, `passwords.py` pour
les trois derniers) :
- `Email ou mot de passe incorrect.` (401 connexion)
- `Vérifiez votre email : un lien vous attend dans votre boîte.` (403)
- `Un compte existe déjà avec cet email. Connectez-vous.` (409)
- `Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.` (400)
- `Mot de passe actuel incorrect.` (401 changement)
- `Choisissez un mot de passe d'au moins 10 caractères.` (422)
- `Ce mot de passe est trop courant. Choisissez-en un autre.` (422)
- `Mot de passe trop long (128 caractères au maximum).` (422)
- `Trop de tentatives. Réessayez dans quelques minutes.` (429)

## Décisions notables (au-delà du plan)

- **Le 403 "vérifiez votre email" exige de vérifier le bon mot de passe
  d'abord.** `accounts.login` compare au hash actif s'il existe, sinon au
  hash en attente (`pending_password_hash`) — sans quoi un compte fraîchement
  inscrit répondrait "mot de passe incorrect" à son propre mot de passe avant
  le clic. Le 403 n'est donc rendu qu'après une vérification Argon2 réussie :
  il n'apprend rien à un tiers qui devine.
- **`accounts.py` appelle `passwords.hash_password/verify_password/waste_time`
  par le module** (`from . import passwords`), pas par import direct — sinon
  `monkeypatch.setattr(passwords, "waste_time", ...)` dans les tests ne
  touche pas la référence déjà liée dans `accounts`. Même idiome que
  `login_tokens.send_login_link` avant ce lot.
- **Le rate-limiter tranche avant tout hachage** (`guard()` en première ligne
  de chaque route) : prouvé par `test_the_limiter_cuts_before_any_hashing`
  (compteur de hachages à 0 sur un 429).

## Tests

`cd api && ./.venv/bin/pytest tests/ -q` : **876 passed, 1 failed** (877
collectés au total, voir dette ci-dessous), sur une base de test isolée.
Départ à 847 : `test_auth_email.py` supprimé (testait du code retiré —
`dev_login`, `enroll`, `open_signup`, `GET /v1/auth/verify`) et remplacé par
`test_passwords.py`, `test_rate_limit.py`, `test_auth_signup.py`,
`test_auth_login.py`, `test_auth_reset.py`, plus des ajouts à
`test_migrations.py` pour la migration `014_passwords`.

Chaque test neuf nomme la ligne de production qu'il fait rougir (voir les
commentaires en tête de chaque test) ; les cas nommés dans le plan sont tous
couverts : promotion du mot de passe en attente, jeton rejoué, mauvais
`purpose`, 409 énuméré, cas Alexis (compte sans mot de passe), course
d'inscription concurrente (`INSERT … ON CONFLICT … DO NOTHING RETURNING id`,
prouvée par deux threads réels sur la même adresse), réinitialisation qui
ferme toutes les sessions, changement qui garde la session courante,
paramètres Argon2id de production gardés forts malgré la fixture de test bon
marché.

`web/tests/*.test.mjs` : 155 passed (inchangé, je n'ai pas touché `web/`).
`extension/tests/*.test.mjs` : 429 passed (inchangé, je n'ai pas touché
`extension/`).

### Dette signalée — un test rouge, pas le mien à corriger

`api/tests/test_saved_searches.py::test_post_by_cookie_without_x_adscope_header_is_403`
échoue : ce fichier appartient à F2 et reste interdit à ce lot. Il ouvre
encore sa session par l'ancien `POST /v1/auth/login` → `dev_link` → `GET
/v1/auth/verify`, tous les trois retirés par ce lot (le mot de passe
remplace le lien magique). `conftest.py` porte désormais un helper `sign_in
(client, session, account_id, now)` qui pose une session directement (sans
passer par la route) : `test_session_cookie.py` l'utilise déjà. Il suffit à
F2 de remplacer, dans son fichier, l'ouverture par `dev_link` par un appel à
ce helper.

### Contamination croisée pendant les tests

Le suite de test partage `adscope_test` avec le lot F2, qui tournait ses
propres tests en parallèle (`DROP TABLE`/`CREATE TABLE` concurrents observés
dans `pg_stat_activity`, deadlocks Postgres constatés puis reproduits deux
fois). Le décompte final (876/1) a été obtenu sur une base isolée
(`ADSCOPE_TEST_DATABASE_URL=postgresql+psycopg://localhost/adscope_test_f1lot`,
créée puis détruite pour ce lot) — rien à faire côté code, c'est un effet du
travail à deux lots sur la même base de test locale.

## Fin de lot — opérations réelles

- `pg_dump -Fc adscope` → `~/adscope-backups/adscope-20260922-091436-avant-comptes-mdp.dump`
- `python -m scripts.migrate` sur `adscope` (DB réelle) : seule
  `014_passwords` appliquée (001-013 déjà là). Vérifié après coup : le compte
  existant garde `password_hash IS NULL`, `email_verified_at IS NULL`, ses 3
  sessions et ses 4 licences actives intactes — rien de rétro-marqué,
  conforme à D7.
- `launchctl kickstart -k gui/$UID/fr.adscope.api` : nouveau PID confirmé,
  log `~/Library/Logs/adscope-api.log` propre (aucune ligne nouvelle après
  les sondes ci-dessous — plus d'avertissement `ADSCOPE_DEV_LOGIN`, la
  fonction qui l'émettait a disparu du code).
- Sonde anonyme (aucune licence, aucun compte réel touché) :
  `POST /v1/auth/login` sans `X-Adscope` → `403` ; avec l'en-tête, mauvais
  mot de passe → `401 Email ou mot de passe incorrect.` ; dix tentatives sur
  la même adresse puis une onzième → `429 Trop de tentatives...`.

## Hors lot, dette à porter au registre RGPD (politique de confidentialité)

La politique de confidentialité devra désormais dire :
- Le mot de passe n'est **jamais** conservé en clair : Argon2id (`t=3,
  m=65536 KiB, p=4`), le clair ne traverse ni les journaux ni aucune réponse.
- Une adresse email crée un compte et reçoit deux types de liens
  (vérification, réinitialisation), stockés hachés (SHA-256) le temps de
  leur validité (60 min / 30 min) — jamais en clair, sauf transitoirement
  dans la boîte d'envoi locale de développement (`mails`, non exposée au
  public, supprimée au go-live 2 quand un vrai fournisseur d'email la
  remplace).
- Une session (cookie `adscope_session`) dure 90 jours glissants ; la
  réinitialisation d'un mot de passe ferme **toutes** les sessions ouvertes
  du compte.
- Le limiteur de débit retient une adresse email et une adresse IP en
  mémoire (jamais persisté), le temps d'une fenêtre de 15 à 60 minutes.
- **Dette RGPD explicite, non traitée par ce lot** : pas de route de
  suppression de compte (droit à l'effacement) ; c'est à noter au registre
  comme dette avant tout traitement de données de production à grande
  échelle.

## Hors lot (rappel du plan, confirmé toujours hors périmètre)

Fournisseur d'email réel (go-live 2) · 2FA · connexion Google · suppression
de compte (dette RGPD ci-dessus) · balayage des sessions périmées ·
`check_needs_rehash` le jour où les paramètres Argon2 bougent · l'IP
derrière un proxy nginx (le plafond par IP deviendrait global, noté en
commentaire dans `rate_limit.guard`) · `scripts/fr.adscope.api.plist` non
touché, `ADSCOPE_DEV_LOGIN=1` y reste comme clé morte, sans effet (le code
qui la lisait a disparu).

## Réserves pour Alexis

1. **Le site (points 8-9) n'est pas encore aligné** : `web/js/login.js`
   poste toujours `{email}` seul vers `/v1/auth/login` et attend `{"sent":
   true, dev_link?}` — la route rend désormais `204` + cookie et exige un
   mot de passe. Les pages Créer un compte / Vérifiez votre email / Mot de
   passe oublié / Nouveau mot de passe n'existent pas encore. Le site est
   donc **cassé pour la connexion réelle** tant que ce lot-là n'est pas fait
   (les tests `web/` passent parce qu'ils sont unitaires, pas d'intégration
   avec l'API réelle).
2. **`test_saved_searches.py`** : un test rouge, à corriger côté F2 (voir
   dette ci-dessus) — pas d'action possible de mon côté sans toucher son
   fichier.
3. Le service `fr.adscope.api` a été redémarré avec le nouveau code pendant
   que F2 travaillait en parallèle dans `api/` — coordination habituelle du
   lot, mais à vérifier que ça n'a pas coupé une requête F2 en vol au moment
   du restart.
