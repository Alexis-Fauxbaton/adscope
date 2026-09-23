# Audit d'abus et de disponibilité — `api/`

2026-09-23, branche `feat/api`. Angle : **abus et disponibilité**. Ce qu'un
émetteur qui a une clé de licence — ou personne du tout — peut faire coûter au
service, écrire dans la base commune, ou faire dire aux alertes des autres.

**Méthode.** Lecture intégrale de `api/adscope_api/` (routes, portes,
observations, balayage, alertes, limiteur). Sondes jouées sur une base isolée
`adscope_abuse_probe`, créée pour l'audit **puis détruite**, remplie de 25 000
annonces et 59 624 points de prix par un jeu de données fabriqué (marques et
modèles plausibles, aucune donnée réelle) ; les sondes HTTP par `TestClient` ou
par un uvicorn de test lancé sur les ports 8931/8932 et arrêté par son PID.
Jamais la base `adscope`, jamais l'API de `localhost:8000`, jamais une requête
vers leboncoin ou La Centrale, jamais une licence ni un compte réels (adresses
en `@x.example`, domaine réservé).

**Mesures de référence** sur 25 000 annonces (portable, Postgres local ; la base
réelle en porte 56 000 — comptez le double) :

| appel | temps | requêtes SQL |
|---|---|---|
| `GET /v1/market` | 64 ms | 3 |
| `GET /v1/market/facets` | 49 ms | 11 |
| `GET /v1/searches` (50 recherches, le plafond) | 509 ms | 102 |
| `GET /v1/sweep` (50 recherches) | 1 012 ms | 202 |
| `GET /v1/sweep` (50 recherches à découper) | 1 646 ms | 352 |
| `GET /v1/sweep` (500 recherches) | 11 121 ms | 2 002 |
| `GET /v1/follows/feed` (25 000 suivis) | 1 589 ms, **15,25 Mo** | 2 |

---

## CRITIQUE

### A1 — Corps de requête sans plafond : la mémoire du service tombe avant même l'authentification

`api/adscope_api/main.py:31` (aucun middleware de taille sur l'application),
`api/adscope_api/main.py:63` (`post_observations`),
`api/adscope_api/intake.py:126` (`items: list[ObservationIn] = Field(min_length=1, max_length=100)`).

**Scénario.** `POST /v1/observations` avec un corps de 400 Mo, **sans en-tête
`Authorization`**. FastAPI lit et met en mémoire le corps entier avant de
résoudre les dépendances : `require_license` refuse ensuite, mais le mal est
fait. Le plafond de cent items (`intake.py:126`) est un plafond *pydantic*,
posé après que `ObservationsIn._one_by_one` a déjà validé item par item tout ce
que le corps portait.

**Preuve** (sonde jouée, uvicorn de test sur 8932, base isolée) :

```
RSS au repos : 95 Mo
  corps  50,0 Mo sans Authorization -> code 401, 0,06 s, RSS serveur  286 Mo
  corps 200,0 Mo sans Authorization -> code 401, 0,18 s, RSS serveur 1006 Mo
  corps 400,0 Mo sans Authorization -> code 401, 0,43 s, RSS serveur 1727 Mo
```

Et avec une clé valable, le coût CPU s'ajoute — la validation des items est
payée intégralement avant le 422 :

```
 200 000 items, corps 32,3 Mo -> code 422,  3,71 s, RSS serveur  708 Mo
 500 000 items, corps 80,9 Mo -> code 422,  9,65 s, RSS serveur 1775 Mo
```

**Effet.** Un seul appel anonyme, à peine une demi-seconde, porte l'instance à
1,7 Go. Sur un plan Render à 512 Mo ou 2 Go, c'est l'OOM kill : le service
redémarre, et au passage le limiteur de débit en mémoire repart à zéro (A10).

**Correctif.** Un middleware qui refuse en 413 tout `Content-Length` au-delà
d'environ 1 Mo (cent items pèsent ~15 ko) *et* qui coupe la lecture d'un corps
sans `Content-Length` au-delà du même seuil ; le même plafond posé au proxy ;
`uvicorn --limit-concurrency` pour borner le nombre de corps en vol.

---

### A2 — `POST /v1/observations` sans plafond de débit ni quota : une clé écrit sans fin dans la base commune

`api/adscope_api/main.py:63-77` (aucun `guard`, aucun quota),
`api/adscope_api/observations.py:48-73` (`_locked` insère l'annonce inconnue,
`site`/`site_id` libres), `api/adscope_api/usage.py` (`bump` compte, ne borne
jamais).

**Scénario.** Mallory, marchand comme un autre, a sa clé de licence — elle est
en clair sur son poste, l'extension la porte. Elle poste des lots de cent
observations dont les `site_id` sont inventés. Chaque item crée une ligne
`listings`, un point de prix, une ligne `usage_days`. Rien ne l'arrête.

**Preuve** (sonde jouée, HTTP réel sur la base isolée, 4 connexions, 15 s) :

```
avant : 25 000 annonces | 59 624 points de prix | base 26 Mo
4 connexions, 15 s : 14 700 observations acceptées (965 /s)
après : 39 700 annonces | 74 324 points de prix | base 41 Mo
```

965 annonces par seconde depuis un portable : **~3,5 millions de fausses
annonces et ~3,5 Go de base par heure**, pour une clé.

Et ces annonces ne sont pas dans un coin : elles sont le marché de tout le
monde. Sonde `probe_forgery`, 5 appels × 100 items depuis la clé de Mallory :

```
  5 appels × 100 items -> 1 annonces avant, 501 après
  visibles dans /v1/market pour tous : 501 résultats
```

Puis, dans l'email du matin de Karim (compte distinct, recherche enregistrée
« Renault Clio ») : `adscope — 1 baisse et 14 mouvements ce matin`, dont
quatorze lignes « Renault Clio — nouvelle annonce à 1 0xx € » entièrement
fabriquées. Le produit dit exactement ce que l'attaquant veut qu'il dise.

**Correctif.** Un quota journalier par licence — `usage_days` porte déjà le
compte, il ne reste qu'à trancher dessus — et un plafond de débit par clé
(bucket `observations` dans `rate_limit.LIMITS`). Surtout : n'accepter la
*création* d'une annonce inconnue que d'une licence `automated` (le crawler) ou
d'un `site_id` que la file de balayage ou de revisite a réellement servi ; une
clé de marchand ne devrait pouvoir qu'enrichir une annonce qui existe.

---

### A3 — Observations forgées : un faux prix, et une fausse date de publication irréversible

`api/adscope_api/observations.py:87-104` (le point de prix est écrit sur la foi
de n'importe quelle licence), `api/adscope_api/publication.py:14-24`
(`min`/`max` : les bornes ne reviennent jamais),
`api/adscope_api/intake.py:52-53` (`published_at`/`bumped_at` sans aucune
borne), `api/adscope_api/gauge.py:30-37` (`BOUNDS` ne les connaît pas).

**Scénario 1 — le faux prix.** Une annonce Clio à 12 000 €, suivie par la
recherche enregistrée de Karim. Mallory poste `{"site":"lbc",
"site_id":"2999999","price":3500}`. Un point de prix est ajouté, marqué
changement (`confirmation=False`), et la règle de baisse le voit.

```
POST /v1/observations (prix 3 500 € au lieu de 12 000) -> 200 {'accepted': 1, 'refused': 0}
série de prix en base : [(12000, False, False), (3500, False, True)]
```

Email du matin de Karim, ligne 1 :

> Renault Clio IV dci — 12 000 € → 3 500 € · -8 500 € depuis le premier prix ·
> en ligne depuis 375004 jours · constatée entre le 3 sept. et le 23 sept. —
> Hauts-de-Seine (92)

**Scénario 2 — la date, et l'irréversibilité.** `published_at` est un `datetime`
sans borne, et `publication.apply` en prend le `min` : une date absurde une fois
écrite ne peut plus être corrigée par aucune observation honnête.

```
POST published_at=1000-01-01 -> 200 | avant 2026-08-14 | après 1000-01-01
observation honnête ensuite (vraie date) -> published_at reste 1000-01-01
age_days calculé par market_query.age_expr : 375 004
```

**Effet.** L'annonce empoisonnée coiffe tout `sort=age_desc`, passe n'importe
quel `min_age_days`, franchit les seuils de `feed_query._crossed`, fausse les
statistiques `/v1/sellers` d'un concurrent — et rien ne la répare. À l'échelle
d'A2, c'est le jugement du produit qu'on retourne : un concurrent peut faire
croire à tous les marchands qu'un segment s'écroule, ou noyer les vraies
baisses sous du bruit.

**Scénario 3 — la résurrection.** `observations.py:131`
(`listing.disappeared_at = listing.absent_since = None`) : une observation
forgée efface une disparition constatée deux fois, que `models.py` annonce comme
irréversible.

```
POST /v1/observations -> 200 | disappeared_at/absent_since : (None, None)
```

**Correctif.** Borner `published_at` et `bumped_at` dans `gauge.BOUNDS` (par
exemple entre 2000-01-01 et `now + 1 jour`) et ignorer ce qui en sort, comme
pour `price`/`year`/`mileage`. Réserver l'autorité sur les bornes de publication
et sur l'effacement de `disappeared_at` aux licences `automated`. Pour le prix :
`price_points.license_key_hash` existe déjà — n'accorder autorité qu'à un prix
confirmé par deux émetteurs distincts, ou écarter des alertes un point isolé
d'un seul émetteur.

---

## HAUTE

### A4 — `require_operator` laisse passer n'importe quelle clé de licence

`api/adscope_api/operator.py:32-37`. La branche `Bearer` appelle `resolve` et
rend la licence sans plus de contrôle : la porte ne referme que le chemin
cookie. `tests/test_operator.py::test_a_license_key_passes_both_routes` fige ce
comportement.

**Scénario 1 — la fuite.** La clé de Mallory sur `GET /v1/sweep` rend le
périmètre commercial de Karim, mot pour mot, sous forme d'URL leboncoin :

```
https://www.leboncoin.fr/recherche?category=2&price=0-9000&owner_type=private
&sort=price&order=asc&page=1&u_car_brand=Peugeot,PEUGEOT&u_car_model=PEUGEOT_208
&locations=d_92
```

Marque, modèle, département, plafond de prix, type de vendeur : ce qu'un
concurrent paierait pour savoir. `sweep._queries` (`sweep.py:47-50`) ne filtre
sur aucun compte — c'est voulu pour la file, mais la porte devait être celle de
l'opérateur.

**Scénario 2 — la file commune vidée.** `POST /v1/revisits` marque
`next_detail_crawl = now + 7 jours` sur chaque fiche servie
(`revisit.py:128-130`). Rien ne borne le nombre d'appels.

```
fiches éligibles avant : 6 953
20 appels × limit=100 -> 2 000 fiches servies à Mallory (URL comprises)
fiches éligibles après : 4 953 ; 2 000 annonces repoussées de 7 jours
```

70 appels — quelques secondes — suffisent à repousser d'une semaine tout ce que
la base a d'éligible : plus de revisite, plus de détection de disparition, pour
tous les marchands à la fois. Et Mallory repart avec les URL.

**Correctif.** Sur la branche `Bearer` d'`operator.py`, exiger
`license_.automated` (la colonne existe, `scripts/mark_automated.py` la pose) ou
`license_.account_id is None`. Les deux tests d'`test_operator.py` à reprendre
en conséquence.

---

### A5 — `GET /v1/sweep` : coût non borné, recalculé à chaque appel, que `pages` ne réduit pas

`api/adscope_api/sweep.py:53-72` (`_entries` : pour *chaque* recherche
enregistrée de *tous* les comptes, une `coverage_of`, un `cut`, puis un
`translate` par coupe), `api/adscope_api/sweep_split.py:53-79` (`cut` récursif :
jusqu'à 15 `_count` par recherche), `api/adscope_api/sweep.py:96` (le budget
`pages` est appliqué **après** que tout a été calculé).

**Preuve** (sonde jouée, 25 000 annonces) :

```
/v1/sweep,   1 recherche  à découper :      46 ms,     9 requêtes SQL
/v1/sweep,  10 recherches à découper :     129 ms,    72 requêtes SQL
/v1/sweep,  50 recherches à découper :   1 646 ms,   352 requêtes SQL
/v1/sweep,  50 recherches (sans coupe):  1 012 ms,   202 requêtes SQL
/v1/sweep, 500 recherches            : 11 121 ms, 2 002 requêtes SQL
```

500 recherches, c'est dix comptes au plafond de `MAX_SEARCHES = 50`
(`saved_searches.py:34`) : le produit y arrive tout seul. `?pages=1` ne change
rien au coût.

**Scénario.** Vingt appels concurrents à `GET /v1/sweep?pages=1`, avec une clé
de licence quelconque (A4), sur 500 recherches. La réserve de connexions
(`db.py:9` : `create_engine` sans arguments → `pool_size=5`,
`max_overflow=10`) est prise, et tout le reste attend :

```
référence au repos    : GET /v1/market -> 200 en 0,067 s
pendant l'attaque     : GET /v1/market -> 200 en 12,610 s
20 × /v1/sweep        : de 15,1 s à 20,4 s
```

`/v1/market` passe de 67 ms à 12,6 s — **188 fois plus lent** — depuis un
portable, sur 25 000 annonces. Sur Render, avec 56 000 annonces et une instance
partagée, c'est une panne.

**Correctif.** Ne calculer que ce que le budget peut porter (trier les
recherches avant de les découper, s'arrêter dès que `pages` est atteint) ;
mémoriser la file quelques minutes — elle est commune, elle ne dépend pas de
l'appelant ; poser un `statement_timeout` sur la connexion et
`uvicorn --limit-concurrency`. Et refermer la porte (A4) : cette route n'a
aucune raison d'être ouverte à une clé de marchand.

---

### A6 — Le plafond par IP du limiteur devient global derrière le proxy Render

`api/adscope_api/rate_limit.py:21-29` (`LIMITS`), `rate_limit.py:75`
(`ip = request.client.host`). Le commentaire de `guard` note la dette ; la
conséquence mérite d'être dite en clair, parce qu'elle change de nature au
go-live.

**Scénario.** Sur Render, l'API est derrière un proxy. `proxy_headers` est actif
par défaut dans uvicorn mais `forwarded_allow_ips` vaut `127.0.0.1` : le pair
n'étant pas la boucle locale, `X-Forwarded-For` n'est pas honoré et
`request.client.host` rend **l'adresse du proxy, la même pour tout le monde**.
Le plafond « par IP » devient un plafond global :

- `login` : 30 tentatives par quart d'heure → un attaquant en fait 30 en deux
  secondes, et **plus aucun marchand ne peut se connecter** pendant quinze
  minutes (429, message « Trop de tentatives »).
- `signup` : 10 par heure pour le service entier.
- `forgot`/`resend` : 10 par heure pour le service entier — plus personne ne
  peut récupérer son mot de passe.
- `verify`/`reset` : 30 par quart d'heure, et le plafond par email est `None`
  sur ces deux buckets : le seul garde-fou est justement celui qui devient
  global.

Symétriquement, si le correctif est `--forwarded-allow-ips='*'`, alors
`X-Forwarded-For` devient une donnée du client et le plafond par IP tombe
complètement.

**Preuve.** Par lecture (uvicorn `Config.forwarded_allow_ips` par défaut `None`
→ `127.0.0.1`), plus la mesure du plafond lui-même : 30 appels
`/v1/auth/forgot` d'une seule IP → 5 emails, puis 429 sur tout le reste.

**Correctif.** Poser `--forwarded-allow-ips` sur la plage du proxy Render (pas
`*`) et lire le saut de confiance le plus à droite de `X-Forwarded-For` ; et
garder, pour chaque bucket, un plafond par email/par compte qui ne dépend pas de
l'IP — aujourd'hui `verify` et `reset` n'en ont aucun.

---

### A7 — `PUT /v1/families` et `POST /v1/follows` sans plafond : écriture illimitée, et la file commune passe en rang 0

`api/adscope_api/families.py:84-88` (`payload: list[Family]`, aucune longueur
maximale), `api/adscope_api/follows.py:60-91` (aucun plafond de suivis par
licence), `api/adscope_api/revisit.py:79-96` (`_wanted`/`_rank` : suivi ou
famille surveillée → rang 0, devant tout).

**Preuve** (sonde jouée) :

```
     10 familles, corps 0,00 Mo -> 200,     7 ms,      10 lignes en base
  5 000 familles, corps 0,18 Mo -> 200,   129 ms,   5 000 lignes en base
100 000 familles, corps 3,77 Mo -> 200, 2 771 ms, 100 000 lignes en base,
                                                   réponse 3,37 Mo
3 000 POST /v1/follows en 7,4 s, codes {201}, 3 000 suivis,
  3 000 annonces en rang 0 de la file de revisite
```

**Scénario.** Un compte pose 100 000 familles en un appel (la route les écrit
toutes et les rend toutes, 3,37 Mo de réponse), ou suit toutes les annonces de
la base. `revisit._wanted` étant un `EXISTS` sans licence, la file de revisite —
commune à tous les marchands — ne sert plus que du rang 0 : le tri qui « décide
vraiment de ce qu'on saura » (docstring de `revisit.py`) ne trie plus rien. Le
plafond de 50 recherches enregistrées (`saved_searches.py:34,105`) montre que
la règle était connue ; elle n'a pas été portée ici.

**Correctif.** Un plafond sur `list[Family]` (par exemple 200, la route
remplace de toute façon) et sur le nombre de suivis par licence ; paginer
`GET /v1/follows` (`follows.py:108`, aujourd'hui sans limite) ; et, dans
`_rank`, ne compter comme rang 0 que les N suivis les plus récents d'une
licence, pour qu'un compte ne puisse pas s'approprier la file entière.

---

### A8 — `GET /v1/follows/feed` : tout le suivi chargé en Python, et l'email du matin paie le même prix

`api/adscope_api/feed_query.py:107-119` (`feed_for` : `select(Listing)` joint
sur `Follow`, `selectinload(Listing.prices)`, aucune limite),
`api/adscope_api/market.py:66-75` (la route, sans pagination),
`api/adscope_api/alert_follows.py:45-77` (`follows_for` appelle la même
fonction, chaque nuit).

**Preuve** (sonde jouée, une licence qui suit les 25 000 annonces) :

```
GET /v1/follows            :   175 ms, réponse  1,88 Mo
GET /v1/follows/feed       : 1 589 ms, réponse 15,25 Mo
email du matin (candidats) : 1 597 ms, 2 255 candidats pour 15 lignes affichées
```

**Effet.** Un `GET` de quelques octets rend 15 Mo et tient une connexion 1,6 s :
amplification ×~20 000, répétable sans limite. Et le script du matin
(`scripts/send_digests.py`) paie 1,6 s et 2 255 candidats par compte glouton
pour n'afficher que quinze lignes — un compte suffit à allonger la fenêtre
d'envoi de tous les autres.

**Correctif.** Paginer `/v1/follows/feed` (comme `/v1/market`, `limit`/`offset`)
ou borner la fenêtre ; dans `follows_for`, ne charger que les suivis qui ont un
changement dans la fenêtre, en SQL, plutôt que tout le suivi en mémoire ; plus
le plafond d'A7.

---

## MOYENNE

### A9 — `forgot` et `resend` : cinq emails par heure et par destinataire, sans plafond journalier

`api/adscope_api/rate_limit.py:21-29` (`forgot`/`resend` : 5 par email et par
heure), `api/adscope_api/accounts.py:112-116`,
`api/adscope_api/login_tokens.py:21` (`MAX_PENDING = 5`, mais les jetons
expirent en 30 min — le plafond ne freine donc pas le rythme horaire).

**Preuve** (sonde jouée, horloge avancée d'une heure par tour) :

```
après 1 h et 12 appels : 5 emails écrits dans `mails`
après 2 h et 24 appels : 10 emails
...
après 6 h et 72 appels : 30 emails
codes rendus : {202: 30, 429: 42}
```

**Scénario.** Cinq emails par heure vers la même boîte, 120 par jour, sans fin.
Au go-live 2, avec un vrai fournisseur (`mail_outbox.post` est le seul point à
remplacer, dit sa docstring), c'est un vecteur de harcèlement et une plainte
pour abus chez le fournisseur — la réputation d'envoi part avec, et l'email du
matin, qui est le produit, cesse d'arriver.

**Correctif.** Un plafond journalier par destinataire (trois `forgot` par jour
suffisent), tenu **en base** et non en mémoire (A10), avec un délai croissant
entre deux envois.

### A10 — Le limiteur ne survit ni à un redémarrage ni à une seconde instance

`api/adscope_api/rate_limit.py:35` (`_hits`, un dictionnaire de module).

La docstring l'assume. Deux conséquences à noter au go-live : un redémarrage
remet tous les compteurs à zéro — et A1 donne à n'importe qui le moyen de
provoquer ce redémarrage à volonté, ce qui annule *tous* les plafonds
d'authentification ; et deux instances Render doublent chaque plafond sans que
rien ne le dise. Preuve : par lecture.

**Correctif.** Porter les compteurs dans Postgres (une table
`(bucket, clé, minute)`), ou tenir explicitement une seule instance et écrire
la contrainte au runbook de déploiement.

### A11 — Oracle d'existence de compte sur `POST /v1/auth/signup`, et compte + licence créés à chaque tentative

`api/adscope_api/accounts.py:47-70` (le 409 en `accounts.py:58`),
`api/adscope_api/auth_signup.py:55-64`.

**Preuve** (sonde jouée) :

```
compte existant   -> 409 {'detail': 'Un compte existe déjà avec cet email. Connectez-vous.'}
compte inexistant -> 202 {'sent': True}
comptes créés par la sonde : 2 | licences créées par la sonde : 2
```

**Scénario.** La différence 409/202 dit si une adresse est cliente d'adscope —
information commerciale, pour une liste de garages que n'importe qui se procure.
Le plafond (5 par email, 10 par IP et par heure) la rend lente, et A6 la rend
presque impraticable derrière le proxy — d'où la gravité moyenne et non haute.
Second effet : chaque adresse inconnue crée une ligne `accounts` **et** une
ligne `licenses` avant toute vérification (`accounts.py:52-56`).

**Correctif.** Répondre 202 dans les deux cas et dire « vous avez déjà un
compte, connectez-vous » **par email**, à l'adresse concernée. Et ne frapper la
licence qu'à la vérification, pas à la tentative d'inscription.

### A12 — `POST /v1/digests/visit` et `POST /v1/alerts/unsubscribe` : écritures non authentifiées, sans plafond de débit

`api/adscope_api/digests.py:61-68` (`row.visits += 1`, `digests.py:67`),
`api/adscope_api/alert_settings.py:90-96`.

Aucune des deux ne passe par `rate_limit.guard`. Qui détient un jeton — un email
du matin transféré — peut incrémenter `visits` sans fin (une écriture et un
verrou de ligne par appel, sur la table des emails), et la différence 404/204
est un oracle sur la validité d'un jeton. Les jetons font 16 octets
(`digest_send.py`, `alert_settings.settings_of`) : la force brute est hors
d'atteinte, c'est le débit qui manque de garde-fou. Preuve : par lecture.

**Correctif.** Un bucket `guard` par IP sur les deux routes, et un plafond sur
`visits`.

---

## BASSE

### A13 — `GET /v1/market/facets` : onze à douze agrégats par appel, sans plafond de débit

`api/adscope_api/market_facets.py:40-89`. Mesuré : 49 ms et 11 requêtes SQL sans
filtre, 29 ms et 12 avec `brand`+`model`, sur 25 000 annonces — le double sur la
base réelle. Ce n'est pas une panne à soi seul, mais c'est la route que l'écran
de recherche appelle à chaque frappe, et aucune clé n'a de plafond dessus : cent
appels par seconde d'une seule clé valent onze cents agrégats sur toute la table.

**Correctif.** Un plafond de débit par licence sur les routes de lecture, et un
cache court sur la cascade sans filtre (elle est la même pour tous).

### A14 — `MarketParams` : `brand`, `model`, `department`, `region` sans longueur maximale

`api/adscope_api/market_params.py:35-41`. `q` est borné à 120 caractères, les
autres non. Le chemin « recherche enregistrée » est borné indirectement
(`SearchIn.query`, 2 000 caractères, `saved_searches.py:38`) ; le chemin
`GET /v1/market?department=…` répété ne l'est que par la taille d'URL
qu'accepte h11 (~16 ko), soit un `IN` d'un millier de valeurs. Preuve : par
lecture.

**Correctif.** `max_length` sur `brand` et `model` (64 et 128, les largeurs des
colonnes) et une longueur maximale sur les quatre listes.

---

## Ce que je n'ai pas retenu

- **Le plafond des recherches enregistrées.** `MAX_SEARCHES = 50` tient
  (`saved_searches.py:105`, 409 au-delà) : un compte ne peut pas créer 10 000
  recherches. Il peut en revanche, à cinquante, coûter 509 ms et 102 requêtes
  SQL à chaque `GET /v1/searches` (`with_coverage` appelle `coverage.status_of`
  par ligne) — mesuré, mais c'est son propre écran qui ralentit, et la route
  reste sous la seconde. À surveiller si `MAX_SEARCHES` monte.
- **`BatchIn.ids`** est borné à 30 (`schemas.py:15`).
- **Le corps du mot de passe** est borné à 256 caractères avant Argon2id
  (`auth_signup.py:31`), et le limiteur tranche avant tout hachage : la route
  n'est pas l'amplificateur qu'elle aurait pu être. Vérifié : un mot de passe de
  5 000 caractères rend 422 sans hacher.
- **`/v1/auth/login`** ne distingue pas un compte inconnu d'un mauvais mot de
  passe (401 dans les deux cas, `passwords.waste_time()` pour le premier) :
  mesuré, pas d'oracle là.
- **Les jetons en vol** (`login_tokens.MAX_PENDING = 5`) tiennent : jamais plus
  de cinq jetons valables par compte et par usage, mesuré.
- **`q` et l'injection `LIKE`** : `search._escaped` échappe `\`, `%` et `_` ;
  `?q=%` ne rend pas la base entière.
- **Le CSRF** (`sessions.check_csrf`) couvre bien les écritures par cookie, et
  les routes non authentifiées de messagerie l'exigent aussi.
- **Aucun nom de vendeur particulier** ne sort de l'email du matin, même
  lorsque l'observation forgée en porte un (vérifié sur la sortie d'A3 : le
  « Garage fantôme » posé par la sonde n'apparaît nulle part).

---

## Ordre de traitement suggéré

1. **A1** — un middleware de taille de corps. Une trentaine de lignes, et c'est
   le seul défaut qui tue l'instance depuis l'extérieur, sans clé.
2. **A4** — deux lignes dans `operator.py`. Ferme la fuite des périmètres et le
   vidage de la file de revisite, et retire à A5 son levier public.
3. **A3** — borner `published_at`/`bumped_at` dans `gauge`. Petit, et le seul
   dégât de l'audit qui soit *irréversible* une fois écrit en base.
4. **A2** — quota par licence sur `/v1/observations`, adossé à `usage_days`.
5. **A7**, **A8** — les plafonds manquants (familles, suivis, pagination du
   feed).
6. **A6**, **A10** — à traiter avec la mise en ligne Render, pas avant : ce sont
   des choix de déploiement autant que de code.
7. **A5**, **A9**, **A11**, **A12**, **A13**, **A14** — dans l'ordre du temps
   disponible.
