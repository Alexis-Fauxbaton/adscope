# Audit d'attaque — angle « configuration, secrets, déploiement »

2026-09-23 · branche `feat/api` · périmètre : `api/adscope_api/config.py`,
`db.py`, `sessions.py`, `rate_limit.py`, `operator.py`, `main.py`, `static.py`,
`mail_outbox.py`, les migrations, `api/scripts/*`, `api/pyproject.toml`,
`api/uv.lock`, `scripts/*.plist`, `.gitignore`.

Toutes les sondes ont tourné sur une base isolée `adscope_cfg_probe`, créée puis
détruite, et sur un serveur de test lancé sur le port 8391 puis arrêté par son
PID. Aucune requête vers l'API réelle, aucune écriture dans `adscope`, aucune
adresse réelle employée (`karim0@exemple.fr`, `ops@adscope.fr`).

## Ce qui est sain, et qu'il ne faut pas « corriger »

- **Aucun secret dans le dépôt suivi.** `git log --all -S "adsc_[0-9a-f]{20,}"`
  (pickaxe, regex) ne rend rien ; aucune adresse `@gmail`/`@orange`/… nulle
  part ; `git grep -niE "(password|secret|api_key|token)\s*=\s*[\"'].{8,}"` hors
  tests et docs ne rend rien. `attach_account.py:17-18` dit explicitement
  pourquoi l'adresse est un argument et jamais une constante — la règle est
  tenue.
- **Migrations rejouables et non destructives.** Sonde jouée : `create_all` puis
  `apply_migrations` sur une base neuve → 14 migrations appliquées ; second
  passage → aucune. Aucun `DROP`, `DELETE`, `TRUNCATE`, `UPDATE` ni `ALTER …
  DROP COLUMN` dans `migration_registry.py` ni les `migration_sql_*.py` : les
  seuls `DELETE` sont des `ON DELETE CASCADE/SET NULL` de clés étrangères.
  `migration_sql_login_tokens.py:7-9` refuse même de supprimer une colonne
  devenue morte, par principe. La 008 manque au registre (trou de numérotation,
  sans conséquence : le registre est indexé par nom).
- **Aucune trace d'exception rendue au client.** Sonde jouée (route qui lève un
  `RuntimeError` portant une URL de base avec mot de passe) : `500`,
  `content-type: text/plain`, corps `Internal Server Error`, rien d'autre. Les
  `422` de pydantic ne rendent que le champ et la raison, jamais de valeur
  interne.
- **Journaux applicatifs propres.** Les quatre seuls `log.warning`
  (`disappearance.py:113,127`, `revisit.py:127`, `vocab.py:72`) n'écrivent ni
  adresse, ni jeton, ni IP. `mail_outbox.py:5-7` dit que personne ne journalise
  le corps d'un email, et c'est vrai du code.
- **Dépendances à jour, aucune version vulnérable connue par lecture.**
  `uv.lock` : `fastapi 0.141.1`, `starlette 1.6.0`, `uvicorn 0.52.4`,
  `h11 0.16.0` (au-delà du correctif de request smuggling CVE-2025-43859),
  `sqlalchemy 2.0.52`, `psycopg 3.3.5`, `pydantic 2.13.5`,
  `argon2-cffi 25.1.0`, `certifi 2026.7.22`. Pas de `python-multipart` du tout
  (donc pas de CVE-2024-53981). Aucun outil d'audit hors ligne n'est installé :
  ce verdict est par lecture des versions, pas par base de vulnérabilités.
- **`ADSCOPE_DEV_LOGIN` est bien mort.** `grep -rn "ADSCOPE_DEV_LOGIN"` : plus
  aucune lecture dans le code, seulement la plist et les rapports. Voir
  néanmoins C-11.

---

## C-1 — `X-Forwarded-For` forgé contourne le plafond par IP ; derrière Render, le plafond devient global · **HAUTE**

`api/adscope_api/rate_limit.py:68-78`

La docstring promet : « L'IP vient de `request.client.host`, jamais d'un
en-tête ». C'est faux à l'exécution. `uvicorn` active
`ProxyHeadersMiddleware` **par défaut** (`--proxy-headers` vaut `True`), avec
`--forwarded-allow-ips` à `127.0.0.1` : pour tout pair de confiance, le
middleware **réécrit `request.client`** depuis `X-Forwarded-For` avant que la
route ne le lise. Le seul endroit qui décide de l'IP n'est donc pas ce fichier,
c'est la ligne de commande du service — et rien dans le dépôt ne la fixe.

**Sonde jouée** (serveur de test sur 8391, mêmes arguments que
`scripts/fr.adscope.api.plist`, base isolée) : 30 `POST /v1/auth/login` avec
`X-Forwarded-For: 1.1.1.1` et 30 adresses distinctes, puis

```
31e avec XFF=1.1.1.1  -> 429
puis  avec XFF=2.2.2.2 -> 401
puis  sans XFF         -> 401
```

Le seau par IP est donc bien indexé sur la valeur de l'en-tête : il suffit
d'incrémenter `X-Forwarded-For` pour pulvériser (10 par email, 30 par « IP »,
fenêtre de 15 min) le seul frein qui existe contre le balayage d'adresses. Et
comme chaque essai paie un Argon2id (`accounts.login` → `verify_password` ou
`waste_time`, ~60 ms), la route redevient exactement l'amplificateur de charge
que D4 voulait fermer.

**Le symétrique, au go-live, est aussi grave.** Sur Render le pair immédiat est
le proxy de Render, pas `127.0.0.1` : l'en-tête n'est alors plus honoré et
`request.client.host` vaut l'adresse du proxy, la même pour tout le monde. Les
plafonds deviennent globaux : **30 connexions par quart d'heure pour tous les
marchands réunis**, 10 inscriptions et 10 « mot de passe oublié » par heure pour
toute la clientèle. Un tiers qui envoie 30 connexions bidon interdit la
connexion à tous les clients pendant 15 minutes, indéfiniment. Le commentaire
`rate_limit.py:70-72` note la dette (« le plafond par IP devient global ») mais
sous-estime l'effet : ce n'est pas une perte de finesse, c'est un déni de
service trivial.

**Correctif.** Trancher explicitement, et l'écrire dans un manifeste de
déploiement (C-5) :
1. lancer `uvicorn --forwarded-allow-ips <plage du proxy Render>` (jamais `*`
   sans précaution) ;
2. lire l'IP dans **une** fonction dédiée qui prend le *dernier* élément de
   `X-Forwarded-For` (celui que le proxy a ajouté), jamais le premier, que le
   client contrôle ;
3. garder le plafond par email comme frein principal (il ne dépend pas de l'IP)
   et ajouter un plafond global distinct, dimensionné pour la clientèle, afin
   que le seau par IP ne serve plus de plafond global par accident ;
4. corriger la docstring, qui affirme aujourd'hui l'inverse de ce que fait le
   service.

## C-2 — `ADSCOPE_PUBLIC_URL` en `http` (ou absent) : cookie de session 90 jours sans `Secure` · **HAUTE**

`api/adscope_api/config.py:23-24` · `api/adscope_api/sessions.py:110-118`

`is_secure()` ne regarde que le préfixe de `public_url()`, dont le défaut est
`http://localhost:8000`. Rien ne valide cette variable, rien n'avertit au
démarrage, et la plist suivie (`scripts/fr.adscope.api.plist:32`) la pose
justement en `http`. Si elle n'est pas changée — ou si elle est posée en `http`
sur Render, ou sans schéma du tout — le cookie part sans `Secure` et voyage en
clair à la première requête `http` du navigateur (la redirection vers `https`
du proxy arrive *après* que le cookie a été émis).

**Sonde jouée** (parcours complet inscription → vérification, base isolée) :

| `ADSCOPE_PUBLIC_URL` | lien de l'email | `Set-Cookie` |
|---|---|---|
| absent | `http://localhost:8000/app/#/verification?token=…` | `HttpOnly; Max-Age=7776000; Path=/; SameSite=lax` — **pas de `Secure`** |
| `http://app.adscope.fr` | `http://app.adscope.fr/app/#/verification?token=…` | idem, **pas de `Secure`** |
| `https://app.adscope.fr` | `https://…` | `… SameSite=lax; Secure` |

Le même défaut fait aussi partir les liens de vérification et de
réinitialisation en `http` (jeton d'ouverture de compte en clair sur le
réseau), et, si la variable est oubliée en production, vers `localhost:8000` —
c'est-à-dire des emails inutilisables.

**Correctif.** Dans `config.py`, refuser de démarrer si `ADSCOPE_PUBLIC_URL`
n'est pas en `https://` sauf variable d'échappement explicite
(`ADSCOPE_INSECURE_COOKIES=1`, réservée au poste local) ; valider qu'elle porte
un schéma ; poser `Strict-Transport-Security` et une redirection `http→https`
(C-8). Le poste local garde son `http` par la variable d'échappement, pas par le
défaut.

## C-3 — La boîte `mails` garde les liens de vérification et de réinitialisation en clair, indéfiniment · **HAUTE**

`api/adscope_api/mail_outbox.py:16-18` · `api/adscope_api/accounts.py:35-41` ·
`api/adscope_api/migration_sql_passwords.py:16-22`

Le corps complet de l'email est stocké tel quel, jeton compris, dans
`mails.text`. La table n'a ni `used_at`, ni date d'expiration, ni purge : ni
route, ni script, ni migration ne la nettoie.

**Sonde jouée** (base isolée) : après trois inscriptions et un « mot de passe
oublié », `SELECT id, kind, created_at, text FROM mails` rend les 4 corps
entiers, chacun avec son jeton lisible ; colonnes de la table : `id`,
`account_id`, `kind`, `subject`, `text`, `created_at` — aucune colonne de
consommation ni de rétention.

**Le scénario qui fait la gravité.** Aucun fournisseur d'email n'est branché :
au go-live 1, la table `mails` **est** la boîte aux lettres. Et l'adresse de
l'opérateur (`ADSCOPE_OPERATOR_EMAIL`) désigne un compte posé par
`scripts/attach_account.py`, donc sans mot de passe. Sonde jouée sur un tel
compte :

```
login  -> 401              (accounts.py:91-109, password_hash NULL)
forgot -> 202, 0 email     (accounts.py:112-116, refuse un compte sans mot de passe)
signup sur la même adresse -> 202, 1 email  (accounts.py:47-64)
```

Autrement dit : qui lit une ligne de `mails` peut prendre le compte opérateur —
`POST /v1/auth/signup` sur son adresse frappe un jeton `verify` qui **pose un
mot de passe**, le jeton est en clair dans la table, et le cookie obtenu passe
`require_operator` (`operator.py:42-44`), donc `GET /v1/sweep` : le périmètre
surveillé de tous les marchands. Une sauvegarde Render, un accès `psql` de
support, ou n'importe quelle lecture de cette table suffit.

**Correctif.**
1. Ne plus écrire le corps : `mail_outbox.post` ne garde que
   `(account_id, kind, subject, created_at)` ; le jeton ne quitte plus
   `login_tokens` (où il est déjà haché).
2. Tant que la boîte locale sert de transport, purger : `DELETE FROM mails WHERE
   created_at < now() - interval '2 hours'` (au-delà du plus long
   `LIFETIMES`, 60 min) à chaque écriture, ou une migration qui ajoute la purge
   au passage du script du matin.
3. Poser un mot de passe au compte opérateur **avant** le go-live, et documenter
   que `attach_account.py` laisse un compte inutilisable en l'état.

## C-4 — Jetons du courrier du matin dans la *requête*, donc dans le journal d'accès · **MOYENNE**

`api/adscope_api/digest_text.py:30,71-76` · `api/adscope_api/digest_html.py:42,72` ·
`api/adscope_api/alert_settings.py:89-97`

`auth_signup.py:9-12` explique le choix délibéré du **fragment** pour les liens
de vérification et de réinitialisation (« jamais en requête »). Les liens du
courrier du matin font exactement l'inverse :

```
Tout voir : https://app.adscope.fr/app/?d=JETON_DIGEST#/alertes
Se désabonner : https://app.adscope.fr/app/desabonnement.html?t=JETON_DESABO
```

**Sonde jouée** (serveur de test, journal par défaut d'uvicorn) :

```
INFO: 127.0.0.1:58636 - "GET /app/?d=JETON_DIGEST_EN_CLAIR HTTP/1.1" 200 OK
INFO: 127.0.0.1:58637 - "GET /app/desabonnement.html?t=JETON_DESABO_EN_CLAIR HTTP/1.1" 200 OK
```

Les deux jetons atterrissent en clair dans le journal du service — donc dans le
flux de journaux Render, et dans tout collecteur tiers branché dessus. Or
`unsubscribe_token_hash` est **en clair en base et ne tourne jamais**
(`alert_settings.py:8-17`, colonne vérifiée par sonde), et
`POST /v1/alerts/unsubscribe` ne demande aucune session : quiconque lit le
journal éteint silencieusement le courrier du matin de n'importe quel marchand —
la fonctionnalité F1 entière, sans que le marchand ni Alexis ne le voient.

**Correctif.** Faire passer les deux jetons dans le fragment, comme les deux
autres : `/app/desabonnement.html#t=…` et `/app/#/alertes?d=…` (la page lit
`location.hash` et POSTe, exactement comme la page de vérification le fait
déjà). Le contrat HTTP ne change pas. À défaut, prévoir la rotation du jeton de
désabonnement, aujourd'hui impossible par construction du schéma.

## C-5 — Aucun manifeste de déploiement, et le verrou de dépendances n'est pas ce qui sera installé · **MOYENNE**

`api/pyproject.toml:5-13` · `api/uv.lock` · absence de
`render.yaml`/`Dockerfile`/`Procfile`/`requirements.txt`

Vérifié : `find` sur `Dockerfile*`, `render*`, `Procfile*`, `*.service` ne rend
rien ; il n'existe pas de `api/requirements*.txt`. Rien dans le dépôt ne fixe
donc, pour Render : la commande de démarrage (dont les options de proxy de
C-1), les variables d'environnement obligatoires (`ADSCOPE_PUBLIC_URL` en
`https`, `ADSCOPE_OPERATOR_EMAIL`, `DATABASE_URL`), ni la commande
d'installation.

`pyproject.toml` ne pose que des planchers (`fastapi>=0.115`,
`sqlalchemy>=2.0.36`, `psycopg[binary]>=3.2`…) et ne nomme même pas `starlette`
ni `h11`. Un `pip install .` sur Render résoudra donc les versions du jour de la
construction, pas celles de `uv.lock` — c'est-à-dire pas celles auditées
ci-dessus. Le verrou existe mais rien ne l'utilise : la reproductibilité est
nulle, et une régression de sécurité en amont entrerait en production sans
qu'aucun commit ne l'enregistre.

**Correctif.** Committer un `render.yaml` portant la commande de construction
(`uv sync --frozen`, ou `uv export --frozen > requirements.txt` puis
`pip install -r`), la commande de démarrage complète avec ses options de proxy,
et la liste des variables (valeurs dans le tableau de bord, jamais dans le
dépôt) ; y écrire `ADSCOPE_PUBLIC_URL` en `https`.

## C-6 — `DATABASE_URL` : défaut sur la vraie base, schéma Render non normalisé, aucun démarrage à vide refusé · **MOYENNE**

`api/adscope_api/config.py:7-9` · `api/adscope_api/db.py:9`

Trois défauts du même endroit.

1. **Le défaut désigne la base réelle.** Sonde jouée, `DATABASE_URL` retirée de
   l'environnement : `settings.database_url -> postgresql+psycopg://localhost/adscope`
   et `moteur -> …/adscope`. Toute commande (`scripts/migrate.py`,
   `mint_license.py`, `send_digests.py`, `mail_outbox.py`) lancée sans la
   variable écrit dans `adscope` sans le dire.
2. **L'URL fournie par Render fait tomber le service à l'import.** Sondes
   jouées :
   - `DATABASE_URL=postgresql://u:p@dpg-….render.com/adscope` →
     `ModuleNotFoundError: No module named 'psycopg2'` (SQLAlchemy choisit
     `psycopg2` pour le schéma nu ; seul `psycopg` 3 est installé) ;
   - `DATABASE_URL=postgres://u:p@dpg-…/adscope` (autre forme courante) →
     `sqlalchemy.exc.NoSuchModuleError: Can't load plugin: sqlalchemy.dialects:postgres`.

   Le code exige `+psycopg` et rien ne le normalise : coller l'« Internal
   Database URL » de Render telle quelle empêche le service de démarrer, avec un
   message qui ne dit rien de la cause.
3. **La valeur est figée à l'import**, contrairement à `public_url()` et
   `operator_email()` qui sont des fonctions lues à chaque appel. Sonde jouée :
   poser `DATABASE_URL` *après* `from adscope_api import config` n'a aucun
   effet, `settings.database_url` reste `…/adscope`. Le piège est déjà désamorcé
   à la main dans un seul endroit (`api/scripts/multiprocess_trial.py:24-25`,
   avec son commentaire et son garde-fou `if not URL.endswith("/adscope_test")`)
   — le prochain script n'aura ni le commentaire ni le garde-fou.

**Correctif.** Dans `config.py` : normaliser (`postgres://` et `postgresql://`
→ `postgresql+psycopg://`) ; refuser de démarrer sans `DATABASE_URL` quand
`ADSCOPE_PUBLIC_URL` n'est pas local, avec un message explicite ; faire de
`database_url` une fonction comme ses deux voisines, ou construire le moteur
paresseusement. Et poser dans `tests/conftest.py` un garde-fou symétrique de
celui de `multiprocess_trial.py` : refuser toute URL dont la base s'appelle
`adscope`.

## C-7 — Aucun en-tête de sécurité sur l'origine qui sert à la fois l'API et le site ; la suite de tests du site est publiée · **MOYENNE**

`api/adscope_api/main.py:47-51` · `api/adscope_api/static.py:14-18`

`NoCacheStaticFiles` ne pose que `cache-control`. Sonde jouée sur `/app/`,
`/app/desabonnement.html` et `/app/tests/api.test.mjs` : `200`, et pour seul
en-tête de la liste surveillée `{'cache-control': 'no-cache'}` — ni
`Content-Security-Policy`, ni `X-Content-Type-Options`, ni `Referrer-Policy`,
ni `X-Frame-Options`, ni `Strict-Transport-Security`.

Le site et l'API partagent l'origine : sans CSP, une injection dans le site
dispose d'une origine qui peut poser l'en-tête `X-Adscope: 1` elle-même, donc de
tout ce que le cookie ouvre — le `HttpOnly` ne protège rien dans ce cas.
Sans `Referrer-Policy` explicite, le jeton `?d=` de C-4 dépend du seul défaut du
navigateur pour ne pas partir vers leboncoin quand le marchand clique une
annonce depuis la page ouverte par l'email.

Par ailleurs `/app/tests/api.test.mjs` est servi : les 29 fichiers de
`web/tests/` partent en production et décrivent au visiteur le contrat exact de
chaque route.

**Correctif.** Un middleware qui pose les quatre en-têtes (`CSP` en
`default-src 'self'` plus le domaine des polices Google déjà utilisé par
`web/index.html`, `nosniff`, `strict-origin-when-cross-origin`, `DENY`) et
`Strict-Transport-Security` quand `is_secure()` ; et ne monter que ce qui doit
être public — soit un `web/dist` construit, soit un `NoCacheStaticFiles` qui
rend 404 sous `tests/`.

## C-8 — `crawler/.license` : une clé de licence vivante dans l'arbre de travail, non ignorée · **BASSE**

`.gitignore` (9 lignes, aucune n'y pourvoit) · `crawler/.license`

`git check-ignore -v crawler/.license` ne rend rien : le fichier n'est pas
ignoré, seulement pas encore ajouté. Il porte une clé `adsc_…` complète, en
clair. Un `git add -A` la committe. Même chose pour `crawler/logs/`, non ignoré.
L'historique est propre à ce jour (pickaxe vérifié) — c'est une fenêtre encore
ouverte, pas un incident.

**Ce que vaut cette clé, sonde jouée.** `operator.py:32-37` accepte *toute*
licence active sur le chemin `Bearer`, sans vérifier ni `automated`, ni le
compte, ni l'opérateur. Avec une licence fraîchement frappée, sans compte et
`automated = False` :

```
GET /v1/sweep  avec une licence quelconque -> 200
GET /v1/sweep  sans rien                   -> 401
```

La porte dite « réservée à l'opérateur » s'ouvre donc à n'importe quelle clé —
dont celle du crawler dans `crawler/.license`, et dont celle que
`accounts.signup:53-55` frappe pour chaque marchand (jamais affichée, ce qui est
la seule raison pour laquelle la porte tient).

**Correctif.** Ajouter `.license` et `logs/` à `.gitignore` ; et dans
`operator.py`, exiger que la licence `Bearer` soit `automated` (ou rattachée au
compte opérateur) plutôt que simplement valide — sans quoi le nom de la
dépendance ment sur ce qu'elle garde.

## C-9 — `ADSCOPE_OPERATOR_EMAIL` comparée sans `strip()` : un espace en trop ferme la porte en silence · **BASSE**

`api/adscope_api/config.py:31-32` · `api/adscope_api/operator.py:22-27`

Partout ailleurs une adresse est normalisée (`payload.email.strip().lower()`,
`auth_signup.py:60`, `auth_email.py:37`, `attach_account.py:50`). Ici, non.

**Sonde jouée** : `ADSCOPE_OPERATOR_EMAIL="ops@adscope.fr "` (espace final,
qu'un champ de tableau de bord Render laisse passer sans broncher) →
`operator_email()` rend `'ops@adscope.fr '` et `_is_operator("ops@adscope.fr")`
rend `False` ; sans l'espace, `True`.

La panne est fermée (403, jamais un accès accordé par erreur) mais muette :
Alexis perd `GET /v1/sweep` et `POST /v1/revisits` par son cookie sans qu'aucun
message ne dise pourquoi.

**Correctif.** `return os.environ.get("ADSCOPE_OPERATOR_EMAIL", "").strip()`.

## C-10 — La plist suivie documente une porte dérobée qui n'existe plus · **BASSE**

`scripts/fr.adscope.api.plist:22-26`

La plist committée pose `ADSCOPE_DEV_LOGIN=1`, précédée du commentaire « À
retirer au go-live : qui peut appeler l'API entre dans n'importe quel compte ».
La clé est morte — vérifié : `grep -rn "ADSCOPE_DEV_LOGIN"` ne rend plus aucune
lecture dans `api/`, seulement cette plist et les rapports de lot. Le risque
n'est pas le code, c'est la transposition : qui recopiera ce bloc
`EnvironmentVariables` vers Render emportera la variable et son commentaire, et
la prochaine personne à lire ce commentaire croira la porte ouverte (ou la
rouvrira pour « retrouver » le comportement décrit). Même remarque pour
`ADSCOPE_PUBLIC_URL=http://localhost:8000` au même endroit, qui est exactement
la valeur de C-2.

**Correctif.** Supprimer la clé et son commentaire de la plist ; y laisser
`ADSCOPE_PUBLIC_URL` en `http://localhost:8000` uniquement accompagné de la
variable d'échappement prévue en C-2, pour que le passage à Render échoue bruyamment
plutôt que silencieusement.

---

## Ce qui reste à vérifier hors de cet angle

- `operator.py:32-37` (toute licence passe la porte « opérateur ») mérite une
  décision explicite : c'est de l'autorisation, pas de la configuration, mais
  C-8 en dépend.
- `accounts.signup` frappe une `License` active à chaque inscription, avant
  toute vérification (sonde : 3 comptes → 3 licences). Sans purge, l'inscription
  ouverte fait grossir `licenses` indéfiniment.
- Aucun `pip-audit`/`uv audit` disponible hors ligne : le verdict sur les
  dépendances est par lecture des versions. À rejouer avec une base de
  vulnérabilités avant le go-live, et à répéter puisque C-5 montre que ce ne
  sont pas ces versions-là qui seront installées.
