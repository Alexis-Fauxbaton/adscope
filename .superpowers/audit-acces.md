# Audit d'accès — API adscope (angle « accès »), 2026-09-23

Périmètre : toutes les routes de `api/adscope_api` (`@router` / `@app.`), leurs
portes (`auth.require_license`, `auth.require_account`,
`auth.require_account_by_cookie`, `operator.require_operator`), et la
vérification de l'identifiant de ressource contre l'appelant.

Sondes jouées avec le `TestClient` de FastAPI sur une base isolée
`adscope_probe_acces`, créée puis détruite par la sonde. Ni la base « adscope »,
ni l'API réelle, ni aucun service externe n'ont été touchés. Script :
`/private/tmp/claude-501/-Users-alexis-Documents-Projets-adscope/26af5048-3671-4f7d-8f22-cfddb9a652bb/scratchpad/probe_acces.py`
(hors dépôt), 18 sondes, toutes conformes à l'attendu.

## Verdict

Pas d'IDOR classique : les deux seules routes à identifiant numérique
(`/v1/searches/{id}`, `/v1/digests/{id}`) vérifient l'appartenance au compte et
répondent 404, jamais 403 — vérifié (S3, S3b). Le mode `?demo=1` est purement
client et n'atteint jamais l'API.

Trois failles de fond, en revanche, toutes de la même famille : **la licence
est traitée comme une identité unique et sans rôle**, alors qu'elle sert
simultanément de clé de machine, de credential de compte et de laissez-passer
pour les files mutualisées.

| # | Gravité | Trouvaille |
|---|---------|-----------|
| A1 | haute | `require_operator` accepte n'importe quelle clé de licence → le périmètre de tous les marchands fuit, et la file de revisite se laisse assécher |
| A2 | haute | `POST /v1/observations` : un compte quelconque réécrit l'annonce d'autrui dans le corpus mutualisé |
| A3 | haute | `POST /v1/disappearances` : un seul compte fait disparaître une annonce du marché de tous |
| A4 | moyenne | une clé de licence rattachée à un compte ouvre tout le compte (emails du matin, alertes), CSRF et expiration compris |
| A5 | moyenne | suivis et périmètre indexés sur la licence, pas sur le compte |
| A6 | basse | `/openapi.json` et `/docs` servis sans authentification |
| A7 | basse | `/v1/auth/signup` distingue un compte existant d'un compte neuf ; plafond par IP global derrière le proxy |

## Qui peut appeler quoi

Relevé exhaustif (31 chemins dans l'OpenAPI).

**Anonyme** — `POST /v1/auth/{signup,verify,resend,forgot,password/reset,login,logout}`
(limiteur + CSRF), `POST /v1/digests/visit`, `POST /v1/alerts/unsubscribe`
(jeton 128 bits, CSRF), le site statique sous `/app`, `/docs`, `/openapi.json`.

**Cookie de session seul** — `POST /v1/auth/password`
(`require_account_by_cookie`, `auth.py:116`). La seule route qui refuse une clé
de machine.

**Licence (clé Bearer *ou* cookie, indifféremment)** — `GET /v1/me`,
`POST /v1/observations`, `POST /v1/listings/batch`,
`GET /v1/listings/{site}/{site_id}` et `/comparables`,
`GET /v1/sellers/{site}/{seller_id}`, `POST /v1/disappearances`,
`POST|DELETE|GET /v1/follows…`, `GET|PUT /v1/families`, `GET /v1/market`,
`GET /v1/market/facets`, `GET /v1/follows/feed`.

**Compte (licence portant un `account_id`)** — `GET|POST /v1/searches`,
`GET|PUT|DELETE /v1/searches/{id}`, `GET|PUT /v1/alerts/settings`,
`POST /v1/alerts/resubscribe`, `GET /v1/digests`, `GET /v1/digests/{id}`.

**Opérateur — en théorie** — `GET /v1/sweep`, `POST /v1/revisits`
(`require_operator`). Voir A1 : en pratique, n'importe quelle clé.

Vérification de l'identifiant de ressource contre l'appelant :

- `/v1/searches/{search_id}` → `_owned` (`saved_searches.py:82`), 404 sinon. ✅
- `/v1/digests/{digest_id}` → `row.account_id != account_id` → 404
  (`digests.py:55`). ✅
- `/v1/follows/{site}/{site_id}` (DELETE) → `Follow.license_key_hash ==
  license_.key_hash` dans le `DELETE` (`follows.py:98`). ✅
- `/v1/listings/*`, `/v1/sellers/*`, `/v1/market*` → corpus mutualisé, aucun
  propriétaire : lecture ouverte à toute licence, par construction du produit.
  Rien à corriger côté lecture ; le défaut est en **écriture** (A2, A3).

## A1 — `require_operator` accepte n'importe quelle clé de licence (haute)

`api/adscope_api/operator.py:32-37`

```python
scheme, _, key = authorization.partition(" ")
if scheme.lower() == "bearer" and key:
    license_ = resolve(session, key, now)
    if license_ is None:
        raise HTTPException(status_code=401, detail="licence invalide")
    return license_
```

La branche cookie vérifie bien `config.operator_email` (`operator.py:42-44`).
La branche clé ne vérifie **rien** : toute licence active et non expirée passe.
Or la licence n'a pas de rôle — `license_models.py:22-41` ne porte que `label`,
`account_id`, `active`, `automated`, `expires_at`. Et des clés circulent
ailleurs qu'au crawler :

- `api/scripts/mint_license.py:27` frappe une licence sous un libellé libre,
  sans compte ni rôle ;
- `extension/popup/account.js:20-27` offre toujours au marchand un champ
  « clé de licence » (`adsc_` + 32 hex) enregistré dans
  `chrome.storage.local`, et `extension/src/auth.js:11` l'envoie en `Bearer` ;
- `accounts.signup` (`accounts.py:54`) crée une licence par compte.

**Scénario.** Un marchand (ou quiconque lit le `chrome.storage.local` de son
poste, ou `crawler/.license`) appelle
`GET /v1/sweep?pages=400` avec `Authorization: Bearer adsc_…`. La réponse porte,
pour chaque recherche enregistrée **de tous les comptes**, l'URL leboncoin
traduite — donc marque, modèle, fourchette de prix, département, type de
vendeur : le périmètre commercial de chaque concurrent. `sweep.py:47-50` lit
`select(SavedSearch.query).where(SavedSearch.paused.is_(False)).distinct()`,
sans aucun filtre de compte, et la docstring du module l'assume
(« la file ne connaît pas l'appelant »).

Le même appelant poste `POST /v1/revisits {"site":"lbc","limit":100}` en
boucle : `revisit.due` marque chaque fiche servie
`next_detail_crawl = now + SPACING` (7 jours, `revisit.py:130-131`). Quelques
centaines d'appels repoussent toute la base d'une semaine et privent le vrai
crawler de sa file — la fraîcheur des données, donc les alertes de tout le
monde, s'arrêtent sans qu'aucune erreur ne soit levée.

**Preuve.** Sondes S1, S1b, S8b : une licence frappée comme le fait
`mint_license.py` (libellé « garage de Karim », `account_id` nul) obtient 200 sur
`GET /v1/sweep` et 200 sur `POST /v1/revisits`. Contrôle négatif S1c : le
cookie d'un marchand non opérateur est bien refusé (403).

**Correctif.** Porter le rôle sur la licence (colonne `queue_allowed` / `role`,
posée par `mint_license.py --crawler`) et n'accepter dans `require_operator` que
celles-là ; ou supprimer la branche Bearer et faire porter au crawler un secret
propre, lu dans l'environnement du service, distinct des licences de marchands.
Tant que ce n'est pas fait, `POST /v1/revisits` devrait au moins plafonner le
nombre de fiches qu'une même licence peut faire servir par fenêtre.

## A2 — `POST /v1/observations` réécrit l'annonce d'autrui (haute)

`api/adscope_api/main.py:62-79`, `api/adscope_api/observations.py:103-131`

La route accepte toute licence (clé ou cookie + `X-Adscope`) et écrit sans
aucune vérification de provenance : ni que l'appelant a vu la page, ni qu'un
autre émetteur dit la même chose.

```python
# observations.py:112-117
if observation.seller_type == "pro":
    if observation.seller_id is not None:
        listing.seller_id = observation.seller_id
        listing.seller_name = observation.seller_name
elif observation.seller_type is not None:
    listing.seller_id = listing.seller_name = None
```

**Scénario.** Karim poste une observation sur l'annonce d'un concurrent avec
`{"site":"lbc","site_id":"200000001","seller_type":"private","price":1,
"brand":"LADA","model":"NIVA"}`. Trois effets, immédiats et visibles par tous
les autres marchands :

1. `seller_id`/`seller_name` sont effacés (ligne 117) → `GET /v1/sellers/lbc/store-42`
   répond 404 pour tout le monde, et les statistiques du marchand concurrent
   disparaissent du produit ;
2. `VEHICLE_FIELDS` (ligne 103-106) écrase marque, modèle, année, kilométrage,
   département → l'annonce sort de toutes les recherches enregistrées qui la
   visaient, donc des emails du matin des autres comptes ;
3. le point de prix à 1 € est écrit (ligne 97-101) et devient une « baisse »
   dans `alert_rules.drops_for` → il part par email chez tous les comptes dont
   la recherche couvre cette annonce.

**Preuve.** Sondes S4, S4b, S4c : après un seul `POST /v1/observations` de la
licence de Karim, `GET /v1/sellers/lbc/store-42` passe de 200 à 404, et
`GET /v1/market?q=niva` sous la licence de Nadia rend l'annonce réécrite
(`"brand":"LADA","model":"NIVA"`).

**Correctif.** Trois gestes, du plus urgent au moins :
(a) ne jamais laisser une déclaration non-`pro` *effacer* un `seller_id` déjà
connu — l'inverse du raisonnement actuel : une observation muette ou
contradictoire laisse ce qu'on savait ;
(b) exiger une corroboration avant qu'une écriture d'une seule licence humaine
ne remplace marque/modèle/prix pour tout le monde (deux licences distinctes, ou
une observation du crawler) ;
(c) journaliser la licence émettrice sur la mutation de l'annonce, pas
seulement sur le point de prix (`PricePoint.license_key_hash` existe déjà,
`listings` n'a rien), pour pouvoir défaire.

## A3 — `POST /v1/disappearances` retire l'annonce du marché de tous (haute)

`api/adscope_api/main.py:144-150`, `api/adscope_api/disappearance.py:103-133`

La route accepte toute licence. Deux constatations `evidence: "absent"` du
**même** appelant, séparées de six heures (`revisit.CONFIRM_DELAY`), suffisent à
poser `disappeared_at` (ligne 132). Or `market_query.core:97` filtre
`where(Listing.disappeared_at.is_(None))` : l'annonce quitte alors `/v1/market`,
`/v1/market/facets`, le feed et les alertes de **tous** les comptes.

Le garde-fou de flotte (`GUARD_MIN = 30`, `GUARD_SHARE = 1/3`,
`disappearance.py:62-63`) ne se déclenche qu'au-delà de trente revisites
abouties dans la fenêtre avec plus d'un tiers de disparitions : une suppression
ciblée de quelques annonces d'un concurrent ne l'approche jamais.

**Scénario.** Karim poste deux fois, à six heures d'intervalle,
`{"site":"lbc","site_id":"<annonce du concurrent>","evidence":"absent"}`.
L'annonce sort du marché de Nadia, qui la suivait. Répété sur le stock d'un
concurrent, c'est l'effacement de ce concurrent du produit.

**Preuve.** Sonde S5 : verdicts `first` puis `recorded`, et `GET /v1/market`
sous la licence de Nadia passe de 2 à 1 annonce. (Le délai de six heures a été
simulé en reculant `absent_since` en base, `main.post_disappearance` lisant
l'horloge réelle et non l'horloge injectable.)

**Correctif.** Exiger que les deux constatations concordantes viennent de
**deux licences distinctes** (la colonne manque : ajouter `absent_by` à
`listings`), ou réserver l'écriture au crawler (`require_operator`) et ne
laisser à l'extension qu'un signalement qui avance le rendez-vous de revisite
sans jamais conclure. Accessoirement : `main.py:146` lit
`datetime.now(timezone.utc)` au lieu de la dépendance `sessions.now_utc`, ce qui
rend cette règle-là non éprouvable à horloge injectée.

## A4 — une clé de licence ouvre tout le compte (moyenne)

`api/adscope_api/auth.py:105-108`

```python
def require_account(license_=Depends(require_license)) -> int:
    if license_.account_id is None:
        raise HTTPException(status_code=403, detail="compte requis")
    return license_.account_id
```

`require_account` passe par `require_license`, qui accepte un `Bearer`. Le
commentaire d'`auth.py:110-115` a identifié le problème — et n'a protégé que le
changement de mot de passe (`require_account_by_cookie`). Tout le reste du
domaine du compte reste ouvert à la clé :

- `GET /v1/digests/{id}` rend le **corps HTML complet** de l'email du matin —
  annonces suivies, baisses, recherches nommées ;
- `GET|POST|PUT|DELETE /v1/searches…` lit, réécrit et supprime les recherches
  enregistrées ;
- `PUT /v1/alerts/settings` coupe l'email du matin.

Par cette porte, l'appelant est dispensé de `X-Adscope` (`sessions.check_csrf`
n'est appelé que dans la branche cookie) et d'expiration : la clé ne périme que
si `expires_at` est posé, et rien ne la fait tourner. Une clé traîne en clair
dans `crawler/.license` et dans le `chrome.storage.local` du poste du marchand.

**Preuve.** Sondes S2, S2b, S2c : avec la seule clé Bearer du compte de Nadia
et aucun cookie, `GET /v1/digests` répond 200, `GET /v1/searches` rend sa
recherche (`brand=RENAULT&model=CLIO&price_max=9000`), et
`DELETE /v1/searches/1` répond 204 **sans en-tête `X-Adscope`**.

**Correctif.** Faire dépendre les routes de compte (searches, digests, alerts)
de `require_account_by_cookie` plutôt que de `require_account` : une machine n'a
rien à lire ni à écrire dans les alertes d'un humain. `saved_searches` a besoin
d'une licence pour `coverage.status_of` — la prendre par `of_account(account_id)`
à l'intérieur de la route, pas par l'en-tête.

## A5 — suivis et périmètre indexés sur la licence, pas sur le compte (moyenne)

`follows.py:54`, `families.py:39`, `market_query.py:78` (`Follow.license_key_hash
== license_.key_hash`) contre `alert_models.py:31,53,73,97` (`account_id`).

Pour un cookie, `require_license` résout le compte en licence par
`auth.of_account` (`auth.py:64-70`) : **la plus ancienne active**. Le choix est
documenté comme arbitraire (« Rien n'empêche qu'il en porte deux demain »), mais
il est instable : `api/scripts/attach_account.py:84` rattache une licence
existante à un compte, sans la comparer aux autres. Rattacher une vieille
licence de machine à un compte qui en a déjà une (celle de `signup`) fait
basculer `of_account` sur la nouvelle venue ; les suivis et les familles écrits
sous l'empreinte précédente disparaissent silencieusement de `/v1/follows`,
`/v1/families` et du drapeau `followed` de `/v1/market`, tandis que les alertes
(indexées sur `account_id`) continuent de fonctionner. Deux vues divergentes du
même marchand, sans erreur.

Par lecture — non joué, le scénario suppose une exécution de `attach_account.py`
sur une base réelle.

**Correctif.** Indexer `follows` et `tracked_families` sur `account_id`
(la licence restant pour les émetteurs sans compte), ou à défaut rendre
`of_account` déterministe sur un drapeau `primary` plutôt que sur l'ordre de
création.

## A6 — `/openapi.json` et `/docs` sans authentification (basse)

`api/adscope_api/main.py:31` : `FastAPI(title="adscope", version="0.1.0")`,
sans `docs_url=None` ni `openapi_url=None`.

**Scénario.** Anonyme, `GET https://<hôte Render>/openapi.json` : 31 chemins et
tous les schémas, y compris les files de machine, les routes d'authentification
et les gabarits d'entrée. C'est le plan de la surface d'attaque servi à la
demande.

**Preuve.** Sondes S6, S6b : 200 sur `/openapi.json` (31 chemins) et sur `/docs`
sans aucune authentification.

**Correctif.** `FastAPI(..., docs_url=None, redoc_url=None, openapi_url=None)`
quand une variable d'environnement de production est posée, ou monter ces trois
chemins derrière `require_operator`.

## A7 — énumération des comptes à l'inscription, plafond par IP global (basse)

`accounts.py:57-58` : un compte déjà pourvu d'un mot de passe rend 409
`ALREADY_EXISTS` ; un email inconnu rend 202. La différence dit à un tiers si
telle adresse est cliente d'adscope. Le limiteur borne à 5 par email et 10 par
IP par heure (`rate_limit.py:23`), ce qui suffit contre le balayage massif mais
pas contre une vérification ciblée.

Et ce plafond-là est fragile en ligne : `rate_limit.py:75` lit
`request.client.host`, donc, derrière le proxy Render, l'IP du proxy — le
plafond par IP devient global (dette déjà notée dans la docstring). Conséquence
concrète : dix inscriptions légitimes dans l'heure, toutes marchands confondus,
et la onzième est refusée ; symétriquement, un attaquant partage le compteur de
tout le monde.

Par lecture (le comportement 409/202 est visible dans `accounts.signup` ; le
plafond par IP n'est pas éprouvable hors proxy réel).

**Correctif.** Répondre 202 dans les deux cas et ne dire « un compte existe
déjà » que dans l'email envoyé à l'adresse. Pour le limiteur : activer
`--proxy-headers` avec `--forwarded-allow-ips` réglé sur le proxy, et lire l'IP
cliente ainsi obtenue — jamais l'en-tête brut.

## Ce qui a été vérifié et tient

- **Aucun IDOR.** Les deux routes à identifiant numérique vérifient
  l'appartenance et répondent 404 (S3, S3b). Les autres ressources n'ont pas de
  propriétaire.
- **`?demo=1` n'atteint jamais l'API.** `web/js/api.js:22-24` : chaque fonction
  teste `isDemo()` et rend une fixture *avant* `fetch`. Vérifié sur `api.js`,
  `api-auth.js`, `api-sweep.js`, `digest-visit.js` (celui-ci sort même avant de
  lire le jeton). Aucune fixture n'est importée côté API.
- **CSRF et cookie.** Pas de `CORSMiddleware` : aucune origine tierce n'obtient
  de réponse lisible. Cookie `HttpOnly`, `SameSite=Lax`, `Secure` suivant
  `ADSCOPE_PUBLIC_URL` et non un en-tête du client (`sessions.py:110-118`).
  `check_csrf` est appelé dans chaque branche cookie et sur les deux routes
  anonymes qui écrivent.
- **`require_operator` échoue fermé.** `ADSCOPE_OPERATOR_EMAIL` vide → aucun
  cookie ne passe, y compris celui de l'opérateur (S8). À poser sur Render,
  sinon Alexis perd l'accès par navigateur à `/v1/sweep` et `/v1/revisits`.
- **Routes anonymes.** `POST /v1/digests/visit` et `POST /v1/alerts/unsubscribe`
  ne manipulent que des jetons de 128 bits (`secrets.token_urlsafe(16)`), ne
  rendent aucune donnée de compte, et le réabonnement exige bien une session
  (S7, S7b).
- **Secrets jamais en clair.** Clés de licence, jetons de session et jetons de
  connexion réduits à leur empreinte SHA-256, qui sert de clé primaire : aucune
  comparaison octet par octet. Les jetons de désabonnement et de visite sont en
  clair, écart assumé et documenté (`alert_settings.py:8-17`).
