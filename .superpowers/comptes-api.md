# Lot Comptes — côté API : plus de clé pour un humain

Livré sur `feat/api`. Un marchand donne son adresse, clique un lien, et son
navigateur garde une session de quatre-vingt-dix jours. Les machines — le crawl,
la file de revisite — gardent leur clé : `Authorization: Bearer` est inchangé, et
les 287 tests qui l'éprouvaient sont toujours verts sans une ligne modifiée.

## Ce qui a été posé

| Fichier | Ce qu'il tient |
|---|---|
| `api/adscope_api/auth_models.py` | `accounts`, `login_tokens`, `sessions` |
| `api/adscope_api/sessions.py` | la session de navigateur, le cookie, le contrôle CSRF |
| `api/adscope_api/login_tokens.py` | le lien magique : frapper, envoyer, brûler |
| `api/adscope_api/auth_email.py` | les quatre routes, et `/v1/me` |
| `api/adscope_api/auth.py` | `require_license` : clé **ou** cookie, même valeur rendue |
| `api/adscope_api/migrations.py` | migration `009_accounts`, idempotente |
| `api/scripts/attach_account.py` | rattacher un compte, fusionner des licences |

`main.py` n'a reçu que l'inclusion du routeur ; `/v1/me` a déménagé dans
`auth_email` pour que ce soit vrai (il gagne `email`, garde `label` et
`expires_at` — le site et l'extension ne cassent pas).

## Les décisions qui ne se relisent pas dans le code

**La licence reste la porte.** Le cookie ne remplace pas la licence, il y mène :
session → compte → licence du compte. `require_license` rend une `License` comme
avant, et aucune route existante ne sait laquelle des deux l'a ouverte. C'est ce
qui a permis de ne toucher à aucune d'elles.

**`of_account` prend la plus ancienne licence encore valable**, pas la première
venue. Un compte n'en porte qu'une aujourd'hui ; l'ordre explicite évite qu'un
second rattachement fasse basculer un marchand sur un autre jeu de suivis au
gré de l'index.

**Pas de comparaison à temps constant, parce qu'il n'y a pas de comparaison.**
Jeton de connexion et identifiant de session sont réduits à leur sha256, et
l'empreinte *est* la clé primaire — le secret ne rencontre jamais un `==`. C'est
déjà ainsi que les clés de licence sont résolues. Un `compare_digest` posé après
un `session.get` par clé primaire n'aurait comparé une valeur qu'à elle-même :
du code qu'aucun test ne peut faire rougir.

**Le plafond ne tient pas de colonne.** Cinq jetons par quart d'heure se compte
en comptant les jetons encore valables : ils durent un quart d'heure, ce sont
donc exactement ceux du dernier quart d'heure. `login_tokens` n'a pas de
`created_at`, et l'index `(account_id, expires_at)` sert la requête.

**`used_at` marque au lieu d'effacer.** Un lien rejoué est refusé pour ce qu'il
est — un jeton déjà servi — et non parce qu'il est introuvable.

**CSRF : l'en-tête plutôt que l'origine.** `X-Adscope: 1` sur toute écriture
authentifiée par cookie. Une page tierce peut poster vers l'API avec le cookie du
marchand ; elle ne peut pas y poser un en-tête personnalisé sans un prévol CORS
que l'API n'accorde à personne. Les requêtes `Bearer` en sont dispensées : rien
d'ambiant ne les authentifie. `logout` porte le même contrôle — sinon une page
tierce déconnecterait le marchand à volonté.

**`Secure` hors `localhost`, `127.0.0.1`, `::1`.** Le service tourne en HTTP sur
la machine du marchand : un cookie `Secure` n'y repartirait jamais et la
connexion marcherait une fois, puis plus jamais. Le test des attributs exacts
passe par `testserver` (donc `Secure` posé), celui du poste local par
`127.0.0.1`.

**`last_seen_at` une fois par jour au plus.** La popup émet plusieurs requêtes
par fiche ouverte ; rafraîchir à chaque fois ferait de toute lecture du marché
une écriture sur la ligne de session du marchand.

## Le mode local

`ADSCOPE_DEV_LOGIN=1` ajoute `dev_link` à la réponse de `/v1/auth/login`. Sans la
variable, **jamais** — les deux réponses sont alors identiques à la virgule près,
compte connu ou non. Posé dans le gabarit `scripts/fr.adscope.api.plist` et dans
la copie installée ; le service a été rechargé par son label (`bootout` puis
`bootstrap` — `kickstart` ne relit pas l'environnement) et l'a annoncé :

    ADSCOPE_DEV_LOGIN=1 : le lien de connexion est rendu dans la réponse HTTP
    — qui peut appeler l'API entre dans n'importe quel compte

**À retirer au go-live**, en même temps qu'on branche un vrai transport d'envoi
(`login_tokens.send_login_link`, une fonction, remplaçable à un seul endroit ;
elle journalise en `warning` parce que le service tourne à `--log-level warning`
et qu'un `info` n'atteindrait pas le journal).

Note : en mode local, la présence de `dev_link` distingue une adresse connue
d'une inconnue. C'est sans objet — ce mode ouvre déjà tous les comptes.

## Le compte d'Alexis

Deux licences « alexis » en base. Le choix s'est fait sur l'usage, pas sur le
libellé :

| Empreinte | `price_points` | dernier point | `usage_summaries` |
|---|---|---|---|
| **`73cc…`** | **50 611** | 18 septembre | 4 jours, 57 996 observations |
| `61e6…` | 0 | — | 1 jour, 8 observations |

`73cc…` est rattachée au compte — c'est celle que l'extension d'Alexis utilise.
`61e6…` a été fusionnée sur elle puis détachée : un suivi versé (lbc/3254194817,
du 12 septembre) et une famille (Renault Clio, déjà présente, absorbée par le
`ON CONFLICT DO NOTHING`). Rien n'a été supprimé : la licence fusionnée garde ses
lignes, et ses points de prix restent de l'historique de marché.

La commande est idempotente, rejouée pour le vérifier :

    api/.venv/bin/python api/scripts/attach_account.py \
      --email <adresse> --license 73cc --merge 61e6

L'adresse n'est écrite dans aucun fichier du dépôt — c'est de la donnée
personnelle, elle passe en argument.

## Vérifié pour de vrai, sur le service

`pg_dump` avant migration : `~/adscope-backups/adscope-20260918-203041.dump`.
Migration appliquée sur `adscope` : `009_accounts`, 51 720 annonces intactes,
rejouée → « schéma déjà à jour ».

Avec `curl -c/-b` et pas une clé, sur `http://127.0.0.1:8000` :

| Étape | Résultat |
|---|---|
| `POST /v1/auth/login` | `202 {"sent":true,"dev_link":"…"}` |
| `GET /v1/auth/verify?token=…` | `303` → `/app/`, `Referrer-Policy: no-referrer`, cookie posé |
| `GET /v1/me` | `{"email":"…","label":"alexis","expires_at":null}` |
| `GET /v1/follows` | les **deux** suivis, dont celui venu de `61e6…` |
| `POST /v1/follows` par cookie, sans en-tête | `403 en-tête X-Adscope attendu` |
| `POST /v1/follows` par cookie, avec en-tête | passe (`404 annonce inconnue`) |
| lien rejoué | `303` → `/app/?login=expired` |
| `POST /v1/auth/logout` | `204`, cookie effacé ; le cookie rejoué → `401` |
| adresse inconnue | `202 {"sent":true}` |

## Tests

332 (287 avant, +45). Chaque test nomme en commentaire la ligne de production
qu'il fait rougir, et **les 29 mutations correspondantes ont été jouées une par
une** : toutes rouges, aucune survivante. Aucun test ne lit l'horloge — la
fixture `clock` injecte l'instant par `app.dependency_overrides[now_utc]`, ce qui
permet d'éprouver un jeton de quinze minutes et une session de quatre-vingt-dix
jours sans attendre.

- `api/tests/test_auth_email.py` — énumération, `dev_link` absent/présent, usage
  unique, péremption, plafond des cinq et la fenêtre qui le rouvre, jeton jamais
  en clair, `Referrer-Policy` sur les deux redirections, avertissement de
  démarrage.
- `api/tests/test_session_cookie.py` — cookie et ses attributs exacts, `Secure`
  hors poste local, session glissante, `last_seen` une fois par jour, session
  expirée, logout, les quatre cas CSRF, cloisonnement entre deux comptes,
  licence révoquée, `/v1/me` avec et sans compte.
- `api/tests/test_attach_account.py` — préfixe ambigu, fusion sans conflit,
  détachement, idempotence.
- `api/tests/test_migrations.py` — les trois tables neuves, les licences
  existantes qui gardent un compte vide, les index.

`web/` : 52 verts. `extension/` : 369 verts, 1 rouge — le lot Extension est en
cours dans ce dossier (`src/auth.js`, `src/auth-notice.js` non suivis), rien de
ce rapport n'y touche.

## Ce qui reste

- **Le transport d'envoi** : aucun fournisseur branché. Tant que
  `ADSCOPE_DEV_LOGIN=1` tient lieu de boîte mail, le lot Comptes n'est pas
  livrable à un marchand qui n'est pas Alexis.
- **Les sessions périmées ne sont pas balayées** : la ligne reste, elle ne vaut
  plus rien. Un ménage quand la table pèsera.

## Revue de sécurité, close le 2026-09-18

Quatre correctifs, sur HEAD `89eda88` → `66eb0ed`. 336 tests (332 + 4), chacun
nommant en commentaire la ligne qu'il fait rougir ; les deux correctifs
principaux ont été rejoués sur l'ancien code pour confirmer qu'ils rougissent
avant d'être restaurés. `web/` (52) inchangé et vert ; `extension/` non touché
par ce lot (l'autre revue travaillait dans son dossier en parallèle).

**Lien de vérification forgeable par `Host`.** `auth_email.post_login`
construisait le lien envoyé au marchand avec `request.url_for('verify_login')`
— un `Host: evil.example` forgé faisait émettre un lien vers cet hôte. Dès
qu'un vrai transport d'envoi serait branché, un inconnu aurait pu faire
envoyer à un client un lien qui livrait son propre jeton à l'attaquant.
Correctif : `config.public_url()`, une base d'URL de configuration
(`ADSCOPE_PUBLIC_URL`, défaut `http://localhost:8000` — l'hôte que
l'extension utilise), jamais la requête. Testé par `Host: evil.example` qui ne
change plus le lien, et par la variable qui reste configurable. Posée dans le
gabarit `scripts/fr.adscope.api.plist` et la copie installée ; service
rechargé par son label (`bootout` puis `bootstrap`) et vérifié en vrai : lien
émis en `localhost:8000` malgré un `Host` forgé.

**Usage unique non tenu en concurrence.** `login_tokens.consume` lisait le
jeton (`session.get`) puis écrivait `used_at` en deux temps : huit requêtes
lancées ensemble sur le même lien lisaient toutes un jeton encore valable
avant qu'aucune ne l'ait marqué, et ouvraient huit sessions pour un lien qui
n'en vaut qu'une. Correctif : une seule instruction —
`UPDATE login_tokens SET used_at = :now WHERE token_hash = :h AND used_at IS
NULL AND expires_at > :now RETURNING account_id`. Postgres sérialise les
écritures concurrentes sur la même ligne ; une seule la trouve encore
`used_at IS NULL`. `consume` rend directement `account_id` plutôt que la ligne
— son seul appelant (`get_verify`) n'avait besoin que de ça. Testé avec la
fixture `concurrently` : huit consommations simultanées → exactement une
session (l'ancien code en ouvrait huit, rejoué pour le vérifier).

**Email normalisé dans `attach_account.py`.** La connexion (`post_login`)
abaissait déjà la casse et retirait les espaces ; `attach_account.account_for`
ne le faisait pas — un `--email Alexis@…` collé à la main aurait posé un
second compte à côté de `alexis@…`. Corrigé, testé.

**`migrations.py` rendu à son registre.** À 151 lignes, il dépassait la
limite. Le registre SQL (`LEDGER`, `MIGRATIONS`) part dans
`api/adscope_api/migration_registry.py` (122 lignes, commentaires inclus) ;
`migrations.py` (43 lignes) ne garde que `apply_migrations` et `migrate`, et
réexporte `MIGRATIONS` pour que `tests/test_migrations.py` n'ait rien à
changer.

**`/v1/me` garde `expires_at`, contrairement à ce que demandait la tâche.**
« Le site ne le lit pas » est vrai de `web/`, mais la tâche demandait de
vérifier par grep dans `web/` **et** `extension/` avant de le retirer — et
`extension/popup/config.js` le lit bel et bien (`body.expires_at`, testé dans
`extension/tests/config.test.mjs`) pour afficher l'échéance d'une clé de
machine collée dans l'écran de configuration (« Licence valide — label ·
jusqu'au DATE »). Le retirer aurait fait disparaître cet affichage en
production sans qu'aucun test ne le révèle (le test JS mocke sa propre
réponse). Non fait ; à reprendre avec l'autre lot si `expires_at` doit
vraiment disparaître de la réponse — pas depuis ce dossier seul.

**Host unique dans le runbook de revisite.** `crawler/RUNBOOK-revisites.md`
(non suivi par git, non ajouté) pointait vers `127.0.0.1:8000` pour ouvrir le
site et la page de revisite, alors que l'extension appelle toujours
`localhost:8000` : pour un cookie de session, ce sont deux hôtes — une session
ouverte sur l'un n'existe pas sur l'autre. Remplacé partout où il s'agit
d'ouvrir une page (le prérequis devient « se connecter une fois, à la main,
par email, sur `http://localhost:8000/app` », la connexion par email ayant
remplacé le collage de clé), avec une ligne datée du 2026-09-18 qui l'explique.
L'encadré de terrain daté du 2026-09-08 (la sonde `/v1/me`), qui porte aussi
`127.0.0.1:8000`, est resté mot pour mot — ce n'est pas une URL à ouvrir, c'est
un piège déjà constaté et documenté tel quel.

**Vérifié en vrai sur le service rechargé**, avec `curl -c/-b`, en une seule
fois : login → lien `localhost:8000` (`Host` forgé y compris) → verify → 303
+ cookie → `/v1/me` répond le compte → lien rejoué → `303 …?login=expired` →
`/v1/follows` `200` par cookie → logout `204` → cookie rejoué → `401`.
