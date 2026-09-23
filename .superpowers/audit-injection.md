# Audit d'attaque — angle « injection et sorties »

2026-09-23 · branche `feat/api` · périmètre : `api/`, `web/`, `extension/`.

Sondes jouées sur une base isolée `adscope_inj_probe` (créée puis détruite) avec
le `TestClient` de FastAPI. Jamais la base `adscope`, jamais l'API réelle,
aucune requête vers leboncoin, La Centrale ou un service externe.

## Ce qui tient

Écrit d'abord, parce que c'est l'essentiel du rapport : les deux surfaces que
l'énoncé désignait en premier sont propres.

**Pas de SQL construit à la main.** Aucun `text()` avec interpolation, aucun
f-string de requête : `grep -rn 'f"SELECT\|f"INSERT\|f"UPDATE\|f"DELETE'` sur
`api/adscope_api/` et `api/scripts/` ne rend rien. Les seuls `text()` sont
`migrations.py:26-35` (SQL statique du registre) et
`login_tokens.py:64,99` (paramètres nommés). Tout le reste passe par
l'expression SQLAlchemy.

**Le joker `LIKE` est bien du texte.** `search._escaped` (`search.py:30`) fait
son travail — sonde jouée sur deux annonces en base :

| requête | total rendu |
|---|---|
| `GET /v1/market?q=%` | 0 |
| `GET /v1/market?q=_eugeot` | 0 |
| `GET /v1/market?q=peugeot` | 1 |

Sans échappement, `%` rendait les deux lignes et `_eugeot` en rendait une.

**L'email du matin échappe.** Un libellé hostile injecté par une licence
(`version = '"><img src=x onerror=alert(document.domain)>'`, accepté tel quel
par `POST /v1/observations` et écrit en base — c'est normal, la base porte ce
que les sites écrivent) ressort de `digest_html.render` en

```
...color:#111">Peugeot 208 &quot;&gt;&lt;img src=x onerror=alert(document.domain)&gt;</div>
```

et une URL d'annonce portant `" onmouseover="alert(1)` ressort
`href="https://x.invalid/a.html&quot; onmouseover=&quot;alert(1)"`. Le
`html.escape` de `digest_html.py:16,27,44-46` couvre le libellé, les faits, le
département et l'attribut `href`.

**Le nom d'une recherche ne traverse pas.** `« <img src=x onerror=… >` comme
`name` d'une recherche enregistrée est accepté (201) et ressort brut dans le
JSON de `/v1/searches` — ce qui est correct, c'est du JSON. Il n'entre jamais
dans l'email (`digest_build._subject` ne compose qu'à partir de compteurs) et
la page le pose par `textContent` (`alerts-searches.js` via `dom.el`, où
`text:` → `node.textContent`, `dom.js:9`).

**Un seul puits HTML dans tout `web/` et `extension/`.** `grep -rn
"innerHTML\|insertAdjacentHTML\|srcdoc\|outerHTML\|document.write"` hors tests
rend une seule ligne : `web/js/alerts-outbox.js:59`, le `srcdoc` de l'aperçu de
la boîte d'envoi, dans un `<iframe sandbox="">` — restriction maximale, ni
script ni même origine. Aucun `eval`, aucun `new Function`, aucun `DOMParser`,
aucun `cssText`. La popup et le panneau de l'extension construisent tout par
`textContent` (`extension/src/panel-node.js:9-21`,
`extension/popup/dom.js:12,33`).

**Aucun CORS.** Pas de `CORSMiddleware`. Sonde : un prévol
`OPTIONS /v1/searches` avec `Origin: https://mechant.invalid` rend `405`, et un
`GET /v1/market` avec le même `Origin` ne rend aucun en-tête
`Access-Control-*`. Aucun site tiers ne peut lire l'API avec le cookie. Le
`X-Adscope` de `sessions.check_csrf` est posé sur toutes les routes mutantes
(vérifié route par route sur les 38 routes).

**Pas d'URL `javascript:` atteignable depuis les données.** `urls.build`
(`urls.py:9-31`) ne sait produire que `https://www.leboncoin.fr/…` (chiffres
seulement) et `https://www.lacentrale.fr/auto-occasion-annonce-…` — le schéma
est toujours en dur. `outLink` (`web/js/dom.js:27`) ne reçoit donc jamais un
`href` de schéma choisi par l'émetteur.

---

## Trouvailles, par gravité

### 1. `/docs`, `/redoc`, `/openapi.json` publics sur l'origine de la session, et Swagger tiré d'un CDN sans SRI — **haute**

`api/adscope_api/main.py:31` — `FastAPI(title="adscope", version="0.1.0")`, sans
`docs_url=None` ni `redoc_url=None` ni `openapi_url=None`.

Sonde jouée (TestClient, sans aucune authentification) :

```
GET /openapi.json  → 200 · 31 routes décrites, dont /v1/auth/login, /v1/auth/password…
GET /docs          → 200
GET /redoc         → 200
```

et ce que ces deux pages chargent :

```
/docs  : https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css
         https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js
/redoc : https://cdn.jsdelivr.net/npm/redoc@2/bundles/redoc.standalone.js
         https://fonts.googleapis.com/css?family=Montserrat…
```

Aucun `integrity=`, et aucune CSP pour restreindre `script-src` (trouvaille 2).

**Scénario.** Le site est monté sur la *même* application que l'API
(`main.py:45-50`, `app.mount("/app", …)`) et le cookie `adscope_session` est
posé `path="/"` (`sessions.py:116`). Donc `https://app.adscope.fr/docs` est la
même origine que `https://app.adscope.fr/app/`. Karim, connecté, ouvre `/docs`
— par curiosité, ou parce qu'un lien le lui tend. Son navigateur exécute
`swagger-ui-bundle.js` de jsdelivr **sur l'origine qui porte sa session**. Ce
script est alors pleinement légitime : il peut appeler `fetch('/v1/searches',
{credentials:'same-origin', headers:{'X-Adscope':'1'}})` sans prévol (même
origine), lire tout le marché, toutes ses recherches enregistrées, toute sa
boîte d'envoi (`/v1/digests/{id}` porte les corps), créer et supprimer ses
recherches, couper son email du matin. Le cookie est `HttpOnly`, ce qui
n'empêche rien ici : le script n'a pas besoin de le lire, il voyage tout seul.
Il suffit d'une compromission de jsdelivr ou d'un détournement DNS/TLS sur
`cdn.jsdelivr.net` — le modèle de menace que `sessions.py:104-111` prend déjà
au sérieux pour l'en-tête `Host`.

Accessoirement, `/openapi.json` publie les 31 routes, leurs schémas de corps et
leurs plafonds à tout venant : la carte de l'API offerte à qui la cherche.

**Correctif.** En production, refermer les trois :

```python
_DEV = os.environ.get("ADSCOPE_DOCS") == "1"
app = FastAPI(title="adscope", version="0.1.0",
              docs_url="/docs" if _DEV else None,
              redoc_url=None,
              openapi_url="/openapi.json" if _DEV else None)
```

Si `/docs` doit rester joignable en ligne, alors servir les deux fichiers
Swagger depuis `web/` (mêmes fichiers, même origine) via
`fastapi.openapi.docs.get_swagger_ui_html(swagger_js_url=…, swagger_css_url=…)`,
et non depuis un CDN.

---

### 2. Aucun en-tête de sécurité, ni sur `/app` ni sur l'API — **moyenne**

`api/adscope_api/main.py` — aucun `add_middleware` dans tout le dépôt
(`grep -rn "add_middleware" api/` : rien) ; `api/adscope_api/static.py:14-18`
ne pose que `cache-control`.

Sonde jouée :

```
GET /v1/market           → content-type: application/json, content-length. Rien d'autre.
GET /app/index.html      → content-type, accept-ranges, content-length,
                            last-modified, etag, cache-control: no-cache. Rien d'autre.
```

Donc pas de `Content-Security-Policy`, pas de `X-Content-Type-Options`, pas de
`Referrer-Policy`, pas de `X-Frame-Options`, pas de `Strict-Transport-Security`.
Trois conséquences concrètes, pas une généralité :

1. **Aucun second rempart.** Le seul puits HTML du site est le `srcdoc` de
   `alerts-outbox.js:59`, aujourd'hui alimenté par du HTML que nous écrivons et
   échappons. Sans CSP, le jour où un `innerHTML` apparaît — ou le jour où
   `digest_html` oublie un `escape` — il n'y a rien derrière. Et l'origine de
   `/app` est celle de l'API : une XSS y vaut le compte entier.
2. **Jetons dans la barre d'adresse.** `/app/?d=<jeton>` et
   `/app/desabonnement.html?t=<jeton>` chargent tous deux
   `https://fonts.googleapis.com/css2?…` (`web/index.html:10`,
   `web/desabonnement.html:10`). Le défaut moderne
   (`strict-origin-when-cross-origin`) n'envoie que l'origine, mais il est
   *implicite* : rien dans le dépôt ne le garantit, et c'est précisément le
   genre de défaut que `sessions.py` refuse d'emprunter ailleurs.
3. **HSTS.** La mise en ligne est prévue derrière le proxy de Render. Sans
   `Strict-Transport-Security`, la première visite en `http://` reste
   interceptable — et `extension/popup/config.js:11` accepte explicitement une
   base `http://`.

Ce que je ne compte **pas** dans cette trouvaille, pour être exact :
l'encadrement de `/app` par un site tiers. `SameSite=Lax` (`sessions.py:117`)
n'envoie pas le cookie dans un cadre d'une autre origine, donc un `/app` encadré
affiche l'écran de connexion et non les données de Karim — le détournement de
clic ne mord pas. `X-Frame-Options` / `frame-ancestors` reste une ceinture de
plus, pas la fermeture d'une porte ouverte.

**Correctif.** Un seul intergiciel, une dizaine de lignes, dans un nouveau
`api/adscope_api/headers.py` monté dans `main.py` :

```python
@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("x-content-type-options", "nosniff")
    response.headers.setdefault("referrer-policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("x-frame-options", "DENY")
    if is_secure():
        response.headers.setdefault(
            "strict-transport-security", "max-age=31536000; includeSubDomains")
    if request.url.path.startswith("/app"):
        response.headers.setdefault("content-security-policy", CSP)
    return response
```

Avec, pour `/app` :

```
default-src 'none'; script-src 'self'; connect-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com; img-src 'self' data:;
frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
```

**Piège à ne pas manquer** : un document `srcdoc` hérite de la CSP de son
parent. L'aperçu de la boîte d'envoi est composé d'attributs `style="…"` en
ligne (`digest_html.py:54,62-65` — obligatoires, aucun client de messagerie ne
suit une feuille externe) ; d'où le `'unsafe-inline'` sur `style-src` seul, et
jamais sur `script-src`. Sans cette précaution, la CSP déshabille l'aperçu de
l'email sans le dire.

---

### 3. `?d=` et `?t=` : deux écritures non authentifiées sans aucun plafond de débit — **moyenne**

`api/adscope_api/digests.py:60-70` (`POST /v1/digests/visit`) et
`api/adscope_api/alert_settings.py:89-97` (`POST /v1/alerts/unsubscribe`).

Ce sont les deux seules routes mutantes non authentifiées du service, et les
deux seules qui n'appellent pas `rate_limit.guard` — les six autres routes
publiques (`signup`, `verify`, `resend`, `forgot`, `reset`, `login`) le font
toutes (`rate_limit.py:21-28`).

Sondes jouées :

```
60 × POST /v1/digests/visit {"token": "<le bon jeton>"}
   → 60 × 204, aucun 429 · digests.visits passe de 0 à 60

40 × POST /v1/alerts/unsubscribe {"token": "faux0…faux39"}
   → 40 × 404, aucun 429
   puis le bon jeton → 200 {"digest_enabled": false}
```

**Scénario.** Karim transfère l'email du matin à son associé, ou le journal
d'accès du proxy Render garde la ligne `GET /app/?d=TOK`. Qui lit ce jeton
appelle `curl -X POST -H 'X-Adscope: 1' .../v1/digests/visit -d '{"token":"TOK"}'`
en boucle : la boîte d'envoi affiche « 3 400 visites » pour un email lu une
fois (`alerts-outbox.js:19-22`), et `first_visit_at` est figée sur l'heure du
premier appel de l'attaquant. C'est la seule mesure d'usage du produit
(`digests.py:5-7` le dit : « aucun pixel, aucun outil tiers ») et elle devient
un chiffre que personne ne peut plus lire. Accessoirement, chacune des deux
routes est un amplificateur : une requête de 60 octets depuis l'internet ouvert
déclenche un `SELECT` indexé plus un `UPDATE` commité sur Postgres, sans
plafond — le défaut que `rate_limit.py:1-11` a justement été écrit pour fermer.

Le 404 sur jeton inconnu est aussi un oracle d'existence, gratuit et illimité ;
les 128 bits de `secrets.token_urlsafe(16)` le rendent académique, mais c'est
une porte ouverte sans raison.

**Correctif.** Deux entrées de plus dans `rate_limit.LIMITS` et deux appels :

```python
"visit":  (None, 60, timedelta(minutes=15)),
"unsub":  (None, 20, timedelta(minutes=60)),
```

puis `guard("visit", "", request, now)` en tête de `post_visit` et
`guard("unsub", "", request, now)` en tête de `unsubscribe`, avant la lecture
du jeton — comme `auth_signup.py:61,74,85,96,106` le fait déjà.

---

### 4. Le jeton de désabonnement : permanent, en clair, dans la *query string* de chaque email — **moyenne**

`api/adscope_api/digest_html.py:75` et `digest_text.py:77` :

```python
unsub_link = f"{base}/app/desabonnement.html?t={unsub_token}"
```

`api/adscope_api/alert_settings.py:47` le frappe une fois
(`secrets.token_urlsafe(16)`) et plus jamais ; `alert_models.py:60` le stocke en
clair (écart au plan documenté et assumé). Sonde : le jeton stocké est bien le
jeton en clair, 22 caractères, identique à celui du lien.

Le défaut n'est pas le stockage en clair — il est argumenté. C'est le **canal** :

- la valeur voyage en `?t=`, donc dans la ligne de requête : journal d'accès du
  proxy Render, journal d'`uvicorn`, historique du navigateur, `Referer` en cas
  de politique permissive (trouvaille 2) ;
- elle ne tourne jamais, donc un email transféré il y a deux ans porte encore
  un jeton valable ;
- `web/js/unsubscribe.js` ne l'efface pas de l'URL après usage — contrairement
  au jeton `?d=`, que `digest-visit.js:30` retire par `history.replaceState` ;
- et le dépôt sait déjà que ce canal est mauvais : `auth_signup.py:9-12` place
  exprès les jetons de vérification et de réinitialisation dans le **fragment**
  (`#/verification?token=…`) « jamais en requête ».

**Scénario.** Un concurrent, un ancien employé, ou n'importe qui ayant accès aux
journaux du proxy relève un `?t=`. `POST /v1/alerts/unsubscribe` (non
authentifié, non plafonné — trouvaille 3) coupe l'email du matin de ce
marchand. Rien ne le lui dit ; il constate seulement, des semaines plus tard,
qu'adscope ne lui écrit plus. Et il ne peut le rallumer que connecté
(`resubscribe`, choix volontaire et juste).

**Correctif.** Le fragment, comme pour les deux autres jetons — `.../app/
desabonnement.html#t=<jeton>`, lu par `unsubscribe.js` dans `location.hash` : le
jeton ne quitte plus le navigateur, aucun journal ne le voit. Et faire tourner
le jeton après usage (nouvelle valeur dans `AccountSettings`) pour qu'un vieil
email cesse d'en porter un valable.

---

### 5. `GET /v1/alerts/settings` écrit — une route de lecture hors de toute garde CSRF — **basse**

`api/adscope_api/alert_settings.py:71-76` : la route `GET` appelle
`settings_of`, qui crée la ligne (`alert_settings.py:44-52`) puis
`session.commit()`.

`sessions.WRITES = ("POST", "PUT", "DELETE")` (`sessions.py:35`) : par
construction, `check_csrf` ne regarde jamais un `GET`. Sonde jouée — table
`account_settings` vidée, puis un `GET /v1/alerts/settings` **sans** en-tête
`X-Adscope` :

```
200 · lignes account_settings : avant=0, après=1
```

**Scénario.** `SameSite=Lax` (`sessions.py:117`) bloque le cas de la
sous-ressource tierce, ce qui limite beaucoup la portée : il faut une
navigation de premier niveau (`window.open`, un lien) pour que le cookie
voyage. L'effet se réduit alors à une ligne créée et un jeton de désabonnement
frappé — sans fuite. Mais c'est la forme exacte que toute protection CSRF est
faite pour ne pas voir, et elle est ici en contradiction avec la règle que le
module s'est donnée (`sessions.py:127-133`).

**Correctif.** Frapper la ligne là où une écriture est attendue :
`PUT /v1/alerts/settings` et le premier passage de `digest_send.send_for_account`
l'appellent déjà. Le `GET` rend les valeurs par défaut sans rien écrire quand
la ligne manque :

```python
row = session.get(AccountSettings, account_id)
return row if row is not None else SettingsIO()
```

---

### 6. `digest_html._link` n'exige pas le schéma de l'URL — **basse**

`api/adscope_api/digest_html.py:26-27,49-52`. Sonde jouée — un candidat dont
`url` vaut `javascript:alert(1)` :

```html
<a href="javascript:alert(1)" style="font-family:…">Voir l'annonce</a>
```

`escape()` protège l'attribut, pas le schéma.

**Scénario.** Inatteignable aujourd'hui : `urls.build` ne sait produire que du
`https://` (`urls.py:9-31`), et l'aperçu de la boîte d'envoi est en
`sandbox=""`, qui neutralise les URL `javascript:`. Le jour où l'`url` d'un
candidat viendra de la page plutôt que d'être reconstruite, ou le jour où le
bac à sable sera desserré (`allow-popups`, `allow-top-navigation`) pour que les
liens de l'aperçu s'ouvrent, l'email devient un clic-pour-exécuter, dans le
navigateur du marchand, sur l'origine d'adscope.

**Correctif.** Une ligne dans `_card` : n'émettre le lien que si l'adresse est
celle qu'on sait avoir construite —
`if listing_url and listing_url.startswith("https://"):`.

---

### 7. Sélecteur CSS construit par interpolation dans les deux modules de site — **basse**

`extension/src/sites/leboncoin.js:124`

```js
[...doc.querySelectorAll(`a[href*="/ad/voitures/${l.siteId}"], a[href$="/${l.siteId}"]`)]
```

`extension/src/sites/lacentrale.js:98`

```js
[...doc.querySelectorAll(`a[href*="${slug(l.siteId)}"]`)]
```

`siteId` est lu sur la page tierce (`__NEXT_DATA__` pour leboncoin, la
`reference` des charges en ligne pour La Centrale) ; aucun `CSS.escape`, alors
que `web/js/market.js:123` l'emploie pour le même geste.

**Scénario** (par lecture — le harnais de test de `extension/` est un DOM
maison, `tests/stage.mjs`, dont le `querySelectorAll` n'est pas celui du
navigateur, je ne peux donc pas le jouer). Un `siteId` portant un guillemet
produit le sélecteur

```
a[href*="/ad/voitures/1234567890" ]"], a[href$="/1234567890" ]"]
```

que le `querySelectorAll` du navigateur rejette par `SyntaxError`. L'appel se
fait dans la boucle de `extension/src/listing.js:104`, sans `try` : la levée
emporte la passe entière — aucune pastille sur *aucune* des annonces de la
page, et la page ne dit rien. La portée est faible parce qu'il faudrait que le
site source écrive lui-même une telle référence ; c'est une hygiène
d'interpolation, pas une porte.

**Correctif.** `CSS.escape(l.siteId)` aux deux endroits — la fonction est
disponible dans un script de contenu comme dans la page.

---

## Ce qui a été sondé sans rien trouver

- SQL : `text()` avec interpolation, f-strings de requête, `exec_driver_sql`,
  `literal_column` — rien (voir « Ce qui tient »).
- `LIKE` : `%`, `_`, `\` saisis sont du texte (`search.py:27-33`, sondé).
- Échappement de l'email : libellé, faits, département, `href` (sondé).
- Un nom de recherche hostile jusqu'à l'email ou jusqu'à la page : ne traverse
  ni l'un ni l'autre (sondé pour l'email, par lecture pour la page —
  `dom.js:9`).
- `innerHTML` / `insertAdjacentHTML` / `outerHTML` / `document.write` /
  `DOMParser` / `eval` : absents de `web/js` et d'`extension/` (hors le
  `srcdoc` de la trouvaille 2).
- Le bac à sable de l'aperçu : `sandbox=""` est la restriction maximale, et
  `dom.el` pose bien l'attribut vide (`dom.js:12`, piège déjà nommé en
  commentaire).
- CORS : aucun `Access-Control-*` rendu, prévol en 405 (sondé).
- Couverture CSRF : les 38 routes relues une à une ; toutes les mutantes
  appellent `check_csrf`, directement ou par `require_license` /
  `require_account_by_cookie` / `require_operator`.
- URL `javascript:` depuis les données du marché : impossible,
  `urls.build` pose le schéma en dur.
- Injection d'en-tête d'email : le sujet est composé de compteurs
  (`digest_build._subject`), l'adresse est validée par `EmailStr`.
