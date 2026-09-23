# Audit « données personnelles et RGPD » — 2026-09-23

Périmètre : `api/` (FastAPI + Postgres), `web/` (site servi sous `/app`),
`extension/` (MV3). Branche `feat/api`. Angle : ce que la base retient sur une
personne, combien de temps, qui y accède, et ce qui manque avant la mise en
ligne sur Render avec un fournisseur d'email et une publication au Chrome Web
Store.

Toutes les sondes ont tourné sur une base isolée `adscope_data_probe`, créée
puis détruite, par `TestClient` — jamais sur `adscope`, jamais sur l'API réelle.

---

## 1. Inventaire : ce que la base stocke sur une personne

### 1.1 Le marchand (notre client)

| Table, colonne | Quoi | Pourquoi | Durée aujourd'hui | Qui y accède |
|---|---|---|---|---|
| `accounts.email` | adresse email | identifiant de connexion | sans borne | le compte (`GET /v1/me`), l'opérateur en base, `scripts/mail_outbox.py:21-25` |
| `accounts.password_hash` | Argon2id | connexion | sans borne | personne (jamais rendu) |
| `accounts.pending_password_hash` | Argon2id résiduel | mort, gardé (`auth_models.py:34-38`) | sans borne | personne |
| `accounts.created_at`, `email_verified_at` | dates | vérification | sans borne | — |
| `licenses.label` | **l'adresse email, recopiée** (`accounts.py:54`) | libellé de licence | sans borne, **survit à la suppression du compte** | `GET /v1/me`, `scripts/usage_report.py:32` |
| `licenses.key_hash`, `active`, `expires_at`, `automated` | la clé (hachée) | porte de l'API | sans borne | — |
| `sessions` (`token_hash`, `created_at`, `last_seen_at`, `expires_at`) | sessions navigateur, **dernière activité** | rester connecté | 90 j glissants ; **la ligne, elle, sans borne** | — |
| `login_tokens` (`token_hash`, `purpose`, `used_at`, `pending_password_hash`) | liens de vérification / réinitialisation | parcours mot de passe | 30–60 min de validité ; **la ligne sans borne** | — |
| `mails` (`kind`, `subject`, `text`, `created_at`) | **le corps de l'email, jeton en clair** | boîte d'envoi locale | sans borne | `scripts/mail_outbox.py` |
| `saved_searches` (`name`, `query`, seuils, `paused`) | les filtres du marchand — marque, modèle, département, fourchettes de prix | alertes F1 | sans borne | le compte |
| `account_settings` (`digest_enabled`, `include_follows`, `unsubscribe_token_hash`) | réglage email + **jeton en clair qui ne tourne jamais** | email du matin | sans borne | le compte, + qui détient le jeton |
| `digests` (`subject`, `text`, `html`, `token`, `visits`, `first_visit_at`) | **chaque email du matin en entier** + journal de visites | idempotence, mesure | sans borne | le compte (`GET /v1/digests`) |
| `alerts_sent` (`kind`, `listing_id`, `ref`, `sent_at`) | **ce qui a été dit à qui, annonce par annonce** | unicité des alertes | sans borne | — |
| `follows` (`license_key_hash`, `listing_id`, `followed_at`) | les annonces mises de côté | suivi | sans borne | la licence |
| `tracked_families` (`brand`, `model`) | le périmètre surveillé | file de revisite | sans borne | la licence |
| `usage_days` (licence, jour, annonce, passages) | **quelles annonces vues quel jour** | mesure d'usage | 3 jours (`usage.py:23`) | `scripts/usage_report.py` |
| `usage_summaries` (licence, jour, annonces, passages) | **journal d'activité quotidien** | mesure d'usage | **« sans borne », par conception** (`usage_models.py:44`) | `scripts/usage_report.py` |
| `price_points.license_key_hash` | **qui a observé ce prix, à la seconde** | attribution | sans borne (`SET NULL` si la licence part) | — |

Il n'y a pas de table de journal HTTP dans l'API : aucun `logging` de requête
(`grep logging` ne rend que trois journaux métier : `disappearance`, `revisit`,
`vocab`). Les journaux d'accès viendront d'uvicorn et du proxy Render — hors
dépôt, mais ils porteront IP + URL et devront avoir une durée écrite.

### 1.2 Le vendeur observé

- **Professionnel** : `listings.seller_id` + `listings.seller_name` (raison
  commerciale). Donnée d'entreprise, servie à tous les marchands par
  `/v1/market` (`market_items.py:70`) et `/v1/sellers/{site}/{seller_id}`
  (`main.py:124-130`). Légitime.
- **Particulier** : le nom n'est pas stocké (`observations.py:112-117`, vérifié
  par sonde), mais **tout le reste l'est et sans borne** : `site_id` (donc
  l'URL de l'annonce, `urls.py:30-32`), `postal_code` **complet**, `department`,
  `price_points` (l'historique de prix daté), `published_at`, `year`, `mileage`,
  `fuel`, `gearbox`. Voir D5.

### 1.3 Ce que l'extension retient sur l'utilisateur

- `chrome.storage.local.status` (`extension/src/diag.js:17-38`) : **l'URL de la
  page consultée, query string comprise** (`location.pathname +
  location.search` — donc les critères de recherche tapés sur le site),
  `sellerName`, `sellerId`, le contenu de la carte affichée, l'horodatage.
  Une seule entrée, écrasée à chaque page.
- `chrome.storage.local['a:<site>:<id>']` (`extension/src/cache.js:14`) : les
  signaux de chaque annonce vue, **30 jours**.
- `licenseKey`, `apiBase` en clair dans le même stockage.
- Rien de tout cela ne quitte le poste. Mais **ce qui part**, à chaque page de
  résultats et à chaque fiche, c'est la liste des annonces vues
  (`POST /v1/observations`), attribuée à la licence donc au compte : la base
  reconstruit l'activité de navigation du marchand sur leboncoin et La Centrale
  (`usage_days`, `price_points.license_key_hash`). C'est, au sens du Chrome Web
  Store, de la collecte d'« historique web » et d'« activité de l'utilisateur ».

---

## 2. Trouvailles, par gravité

### D1 — CRITIQUE. Aucune suppression de compte, et un `DELETE` naïf laisse l'email en base

`api/adscope_api/main.py:32-41` (routeurs montés) — l'inventaire complet des
38 routes ne porte **ni suppression de compte, ni export**.

Scénario : Karim résilie et écrit « supprimez mon compte ». Il n'existe ni
route, ni script, ni commande. Alexis ouvre `psql` et tape
`DELETE FROM accounts WHERE email = …`. Résultat mesuré :

```
accounts           1 -> 0   effacé (cascade)
sessions           2 -> 0   effacé (cascade)
login_tokens       1 -> 0   effacé (cascade)
mails              1 -> 0   effacé (cascade)
licenses           2 -> 2   SURVIT      <-- label = l'adresse email
saved_searches     1 -> 0   effacé (cascade)
account_settings   1 -> 0   effacé (cascade)
alerts_sent        1 -> 0   effacé (cascade)
digests            1 -> 0   effacé (cascade)
follows            1 -> 1   SURVIT
tracked_families   1 -> 1   SURVIT
usage_days         2 -> 2   SURVIT
usage_summaries    1 -> 1   SURVIT
price_points       2 -> 2   SURVIT
  key_hash=c494d36f8e79… account_id=None label='karim@essai.example'
```

Preuve : sonde E (`TestClient` + `DELETE FROM accounts`, base isolée).
`licenses.account_id` est `ON DELETE SET NULL` (`license_models.py:28-30`) —
choix justifié pour l'historique de marché, mais il emporte avec lui le
`label`, qui **est l'adresse email** (D2), et il laisse `follows`,
`tracked_families`, `usage_days`, `usage_summaries` vivants, tous clefés sur
`license_key_hash` (`follow_models.py:36-41`, `usage_models.py:29-35`) : le
profil complet du marchand résilié reste lisible et rattaché à son adresse.

Ce qu'une suppression devrait faire, table par table :

- **effacer** : `accounts`, `sessions`, `login_tokens`, `mails`,
  `saved_searches`, `account_settings`, `alerts_sent`, `digests`, `follows`,
  `tracked_families`, `usage_days` ;
- **anonymiser** : `licenses.label` (→ `'compte supprimé'` ou l'empreinte),
  `licenses.active = false`, `licenses.account_id = NULL` ;
- **garder, dépersonnalisé** : `usage_summaries` et
  `price_points.license_key_hash` seulement si l'empreinte de clé est rendue
  non réidentifiable (la licence ne porte plus l'adresse) — sinon les effacer ;
  `listings` et `price_points` eux-mêmes sont de l'historique de marché et
  restent.

Correctif : `DELETE /v1/account` (cookie de session + mot de passe courant +
`X-Adscope`), qui appelle une fonction `accounts.erase(session, account_id)`
tenant la liste ci-dessus dans un seul commit, plus un test qui compte les
lignes restantes table par table (le même comptage que la sonde). Et
`scripts/erase_account.py` pour la demande reçue par email.

### D2 — HAUTE. L'adresse email est recopiée dans `licenses.label`

`api/adscope_api/accounts.py:54-56` :
`session.add(License(key_hash=…, label=email[:64], account_id=created_id))`.

Scénario : l'inscription écrit l'adresse dans une seconde table, hors du cycle
de vie du compte (`SET NULL`, D1). `scripts/usage_report.py:32` l'imprime en
clair (`print(f"{lic['label']}  …")`) à chaque relevé d'usage, et `GET /v1/me`
la rend sous le nom `label` (`auth_email.py:74-76`). Preuve : sonde B —
`licenses.label = 'karim@essai.example'`.

Correctif : libeller la licence par ce qu'elle est, jamais par qui la porte —
`label = f"compte {created_id}"`, ou l'empreinte courte de la clé. L'adresse se
lit par jointure sur `accounts` quand elle est vraiment nécessaire
(`usage_report` peut joindre, comme `mail_outbox.py:21` le fait déjà). Migration
à prévoir pour les lignes existantes.

### D3 — HAUTE. `mails.text` garde en clair, sans borne, le lien et son jeton

`api/adscope_api/mail_outbox.py:16-18` et `auth_models.py:78-98`
(`text: Mapped[str] = mapped_column(Text)`), alimenté par `accounts.py:40-41`.

Scénario : une inscription écrit dans `mails.text`
`« Suivez ce lien : http://…/app/#/verification?token=3DjhObe8… »`. Le même
jeton n'existe dans `login_tokens` que sous forme d'empreinte SHA-256
(`login_tokens.py:45`) — soin annulé par la ligne de boîte d'envoi, qui le
garde en clair. Preuve : sonde B —
`hash_token(jeton lu dans mails.text) == login_tokens.token_hash` → `True`, et
la ligne `mails` est toujours là après consommation du jeton. Rien ne purge
cette table.

Portée : le jeton expire en 30 à 60 min (`login_tokens.py:17`) et un `used_at`
le brûle, donc la fenêtre d'usage est courte ; ce qui reste sans borne, c'est un
historique nominatif (jointure `mails.account_id → accounts.email`) de chaque
demande de mot de passe. Au go-live 2, `post` devant être remplacé par un vrai
fournisseur, la table deviendra soit inutile soit un double du fournisseur.

Correctif : ne pas écrire le lien dans `text` (garder `kind`, `subject`,
`created_at` et un marqueur), ou purger `mails` à 30 jours par la même
mécanique que `usage.compact_daily`. Et dans tous les cas, l'effacer à la
suppression de compte — ce qui est déjà le cas par cascade.

### D4 — HAUTE. `seller_name` entre sur la seule parole de l'émetteur

`api/adscope_api/observations.py:112-117` :

```python
if observation.seller_type == "pro":
    if observation.seller_id is not None:
        listing.seller_id = observation.seller_id
        listing.seller_name = observation.seller_name
```

et `api/adscope_api/intake.py:46-48`, dont le commentaire affirme :
« Transmis pour les professionnels seuls ; **l'API le vérifie** plutôt que de
faire confiance à l'émetteur. » **Elle ne vérifie rien** : le seul contrôle est
que l'émetteur ait lui-même écrit `seller_type: "pro"`.

Scénario joué : `POST /v1/observations` avec
`{"seller_type": "pro", "seller_id": "user-8842", "seller_name": "Julien"}` →
`200 {'accepted': 1}`, puis en base
`seller_type='pro' seller_id='user-8842' seller_name='Julien'`. Preuve : sonde C.
Le prénom d'un particulier devient alors une donnée servie à **tous** les
marchands par `/v1/market` (`market_items.py:70`) et agrégée par
`/v1/sellers/lbc/user-8842` (`main.py:124-130`, qui exige seulement une licence
valide). La garantie « jamais d'identité de particulier » tient donc
entièrement à trois lignes de JavaScript côté page
(`extension/src/sites/leboncoin.js:44-47`,
`extension/src/sites/lacentrale.js:34-37`) — une régression d'extension, une
version ancienne encore installée, ou le crawler, suffisent à la percer, et
rien en base ne le rattrape ensuite.

Correctif : un garde-fou côté API, indépendant de l'émetteur. Deux pistes,
cumulables : (a) refuser `seller_name` quand `seller_id` ne ressemble pas à un
identifiant de boutique du site (préfixe `user-` chez leboncoin = particulier,
à relever) ; (b) un plafond de plausibilité — un `seller_id` porté par une
seule annonce sur toute la base n'est pas une boutique : ne pas servir son
`seller_name` avant N annonces distinctes. Et un script de rattrapage qui vide
`seller_name` là où `seller_id` n'a jamais porté plus d'une annonce.

### D5 — HAUTE. Les annonces de particuliers sont conservées sans borne, et servies après leur retrait

`api/adscope_api/models.py:31-90` (aucune colonne de purge, aucun script),
`api/adscope_api/urls.py:30-32`, `api/adscope_api/main.py:95-103`.

Scénario : un particulier de Boulogne (92100) met sa 208 en vente, un marchand
adscope ouvre sa page. La base garde, sans borne : `site='lbc'`,
`site_id='2910000002'` — donc
`https://www.leboncoin.fr/ad/voitures/2910000002`, l'adresse exacte de sa page,
reconstruite par `urls.build` —, son **code postal complet**, son département,
sa date de publication, son millésime, son kilométrage, et l'historique daté de
ses prix. Pris ensemble, avec la page pointée qui porte son prénom et son
téléphone tant qu'elle vit, c'est de la donnée indirectement identifiante.

Le particulier retire son annonce ; deux constats d'absence posent
`disappeared_at`. `/v1/market` cesse de la rendre (`market_query.py:97`), mais
`GET /v1/listings/lbc/2910000002` la rend toujours — mesuré : `200`, avec
`price_history`, `real_age_days: 40`, `observations: 1`. Preuve : sonde jouée.

La règle de projet « aucune donnée de vendeur particulier n'est conservée » est
donc inexacte telle qu'écrite : le **nom** ne l'est pas, le reste l'est.

Correctif, par ordre de coût : (a) ne stocker le code postal complet que pour
les vendeurs professionnels, et le département seul pour les particuliers —
`department` suffit à tous les filtres du produit (`market_filters.py`), le CP
complet ne sert qu'aux comparables, qui peuvent s'en passer ; (b) une purge des
annonces de particuliers `disappeared_at` depuis plus de N mois (les
`price_points` agrégés du segment peuvent survivre, dénominalisés) ; (c) faire
suivre `disappeared_at` à `get_listing` et `post_batch`, comme `/v1/market` le
fait, pour que rien ne serve une annonce retirée. Et écrire la durée choisie
dans la politique.

### D6 — MOYENNE. Aucune purge des sessions expirées ni des jetons consommés

`api/adscope_api/sessions.py:63-69` — `resolve` refuse une session périmée mais
ne supprime rien ; `login_tokens.py:63-69` — `consume` marque `used_at` et
laisse la ligne (choix justifié, mais sans purge derrière).

Scénario joué : une session posée 200 jours plus tôt, cookie présenté →
`GET /v1/follows` répond `401`, et `SELECT count(*) FROM sessions` vaut encore
`1`. Preuve : sonde F. Sur un an d'exploitation, `sessions` et `login_tokens`
accumulent un journal daté (`created_at`, `last_seen_at`) de chaque connexion
et de chaque demande de mot de passe de chaque marchand, sans durée de
conservation.

Correctif : dans `usage.compact_daily` (déjà appelé au premier lot du jour,
`main.py:70-74`), ajouter
`DELETE FROM sessions WHERE expires_at < now() - interval '30 days'` et
`DELETE FROM login_tokens WHERE expires_at < now() - interval '7 days'`.

### D7 — MOYENNE. `usage_summaries` : un journal d'activité quotidien conservé « sans borne », par conception

`api/adscope_api/usage_models.py:39-55` — la docstring l'écrit : « ces deux
nombres-ci … se gardent **sans borne** ». `usage.py:107` n'efface que le grain
fin.

Scénario : pour chaque marchand, une ligne par jour avec le nombre d'annonces
vues et de passages, gardée indéfiniment. Preuve : sonde D (deux lignes
`usage_days` écrites par deux observations) + lecture de `compact`, qui déverse
dans `usage_summaries` sans jamais en retirer. C'est une mesure commerciale
légitime, mais c'est un historique de comportement individuel : il lui faut une
durée écrite (art. 5.1.e) et une mention.

Correctif : fixer une durée (13 mois, l'usage courant en France pour la mesure)
et l'appliquer dans `compact` ; au-delà, n'agréger que des totaux par mois sans
grain quotidien.

### D8 — MOYENNE. `digests` garde chaque email en entier, avec le jeton de désabonnement dans le corps, plus un journal de visites

`api/adscope_api/alert_models.py:84-107` (`text`, `html`, `visits`,
`first_visit_at`), écrit par `digest_send.py:39-47`, qui pose dans le corps
`…/app/desabonnement.html?t={unsubscribe_token_hash}`
(`digest_text.py:77`, `digest_html.py:75`).

Scénario : chaque matin, une ligne de plus par compte, gardée sans borne, qui
contient l'intégralité du HTML de l'email — donc les annonces alertées, les
requêtes de recherche dans les liens (`digest_text.py:30` :
`#/marche?{candidate['search_query']}`) et le jeton de désabonnement en clair.
Et `POST /v1/digests/visit` (`digests.py:60-70`) est **non authentifiée** : elle
incrémente `visits` et pose `first_visit_at` pour qui présente le jeton, sans
limiteur. Preuve : sonde G — `204`, `visits=1`,
`first_visit_at=2026-09-23 10:00`, corps conservé.

Correctif : purger `digests` à 90 jours (la page « Mes alertes » n'en affiche
que 20, `digests.py:44`) ; ne pas garder `html` (il se recompose depuis
`text`) ; poser un limiteur par IP sur `/v1/digests/visit` ; et écrire dans la
politique que l'ouverture de l'email est comptée.

### D9 — MOYENNE. Le jeton de désabonnement est en clair et ne tourne jamais

`api/adscope_api/alert_models.py:57-60` et `alert_settings.py:8-17, 47` — écart
déjà documenté dans le code, mais ses conséquences ne sont pas couvertes.

Scénario : le jeton est un secret porteur, identique dans tous les emails du
matin, valable à vie, et stocké en clair dans `account_settings` **et** dans le
corps de chaque `digests` (D8). Qui met la main sur un vieil email transféré, ou
sur une copie de la base, coupe l'email du matin du compte
(`POST /v1/alerts/unsubscribe`, non authentifiée, `alert_settings.py:89-97`).
La réactivation exige une session, ce qui est le bon choix — mais la coupure
reste gratuite et indéfinie.

Correctif : dater le jeton (`unsubscribe_token_issued_at`) et le refuser au-delà
de 12 mois ; ou le remplacer par un HMAC de `account_id` avec un secret
d'application, ce qui supprime la colonne et rend la rotation possible. Au
minimum, renommer la colonne : `unsubscribe_token_hash` ne contient pas une
empreinte, et le nom trompera le prochain lecteur.

### D10 — MOYENNE. Les quatre pages du site chargent Google Fonts depuis les serveurs de Google

`web/index.html:8-10`, `web/desabonnement.html:8-10`, `web/balayage.html:8-10`,
`web/revisites.html:8-10` :

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:…" rel="stylesheet">
```

Scénario : à chaque ouverture d'une page du site, l'adresse IP du marchand et
son `User-Agent` partent vers Google (hors UE), sans base légale, sans mention,
et — sur `desabonnement.html`, atteinte depuis un lien d'email — avant tout
consentement possible. C'est exactement le cas tranché contre un exploitant en
janvier 2022 par le tribunal de Munich, et la CNIL s'aligne : une police
distante est un transfert de données, pas un détail de mise en page. Preuve :
par lecture.

Correctif : héberger Manrope soi-même (deux `.woff2`, ~40 ko, dans
`web/css/`), `@font-face` local, et retirer les trois lignes des quatre pages.
Zéro requête tierce sur tout le produit, ce qui simplifie aussi la politique de
confidentialité.

### D11 — MOYENNE. `alerts_sent` : journal permanent de ce qui a été dit à qui

`api/adscope_api/alert_models.py:64-81` — clé primaire
`(account_id, kind, listing_id, ref)`, `sent_at`, aucune purge.

Scénario : au bout d'un an, une ligne par annonce et par type d'alerte pour
chaque compte — l'historique complet de ce que chaque marchand a été invité à
regarder. C'est le journal d'unicité, nécessaire, mais son grain fait de lui un
profil. Il est bien effacé par cascade avec le compte (sonde E), ce qui règle
l'article 17 ; il manque une durée.

Correctif : purger les lignes dont `sent_at` dépasse la plus longue fenêtre
qu'`alert_rules` regarde en arrière (à relever dans `alert_rules.py`), plus une
marge — au-delà, la ligne ne peut plus empêcher aucun doublon.

### D12 — BASSE. Aucun export des données du compte

L'inventaire des 38 routes (sonde A) ne porte aucune route d'export. Les
articles 15 et 20 demandent une copie ; aujourd'hui elle se fabrique à la main
en `psql`.

Correctif : `GET /v1/account/export` (cookie + `X-Adscope`), un JSON : le
compte, ses recherches enregistrées, son réglage d'alertes, ses suivis, son
périmètre, ses relevés d'usage par jour, la liste de ses emails du matin
(sujets et dates). Les données de marché n'y sont pas — elles ne sont pas les
siennes.

### D13 — BASSE (mais à fermer tout de suite). `.gitignore` n'ignore pas la clé de licence du crawler

`.gitignore:1-9` — ni `crawler/.license`, ni `crawler/logs/`, ni
`crawler/.crawl.lock` n'y figurent ; `git check-ignore crawler/.license` ne
rend rien. Le fichier existe et n'est pas suivi (état git de départ), mais le
commentaire de `api/adscope_api/auth.py:112-114` dit qu'il porte « la clé de
licence du crawler, **en clair** ».

Scénario : un `git add -A` — le geste ordinaire d'un coup de commit pressé —
publie une clé Bearer qui ouvre `/v1/observations`, `/v1/market` et tout le
reste de la base mutualisée, et qui serait alors dans l'historique pour de bon.
Preuve : par lecture de `.gitignore` et de la sortie de `git check-ignore`.

Correctif : ajouter à `.gitignore` `crawler/.license`, `crawler/logs/`,
`crawler/.crawl.lock`, `*.license`, `.env`.

### D14 — BASSE. Le limiteur garde des adresses IP en mémoire

`api/adscope_api/rate_limit.py:35, 74-79` — `_hits[('login', 'ip:…')]` retient
l'IP jusqu'à 60 min (`MAX_WINDOW`). Donnée personnelle, en mémoire seulement,
jamais écrite : traitement légitime (sécurité), mais à mentionner dans la
politique. La note du code sur le proxy Render (« l'IP vue est celle du proxy,
le plafond par IP devient global ») reste une dette ouverte.

### D15 — BASSE. Extension : ce qui devra figurer dans la déclaration du Store

`extension/src/diag.js:17-38` (l'URL consultée avec sa query string, le nom et
l'identifiant du vendeur, la carte affichée), `extension/src/cache.js:14`
(30 jours de signaux d'annonces), `extension/popup/config.js:11` +
`extension/popup/account.js:42-44` (`apiBase` librement réglable),
`extension/manifest.json:20-22` (`optional_host_permissions: https://*/*`).

Scénario : la fiche du Store exige de déclarer les catégories collectées et une
URL de politique de confidentialité dès qu'il y en a une. Ici il faut cocher
**informations d'authentification** (clé de licence, cookie de session),
**historique web** (les identifiants d'annonces vues partent à l'API à chaque
page) et **activité de l'utilisateur**. Il n'existe aucune politique de
confidentialité dans le dépôt : l'extension ne peut pas être publiée en l'état.
Le couple `optional_host_permissions: https://*/*` + `apiBase` libre attirera
en outre une question du relecteur (« pourquoi tous les sites ? ») : la réponse
tient — c'est l'adresse de notre propre API, réglable pour le développement —
mais elle doit être écrite dans la fiche.

---

## 3. Ce que la politique de confidentialité devra contenir

Phrases prêtes à relire, à poser sur `/app/confidentialite` et à donner comme
URL au Chrome Web Store. Les nombres entre crochets sont ceux à trancher (D6,
D7, D8, D11) ; une durée non écrite n'est pas une durée.

**Qui traite, et pourquoi**

1. « Le responsable de traitement est [raison sociale], [adresse], joignable à
   [adresse de contact]. »
2. « adscope traite vos données pour vous fournir le service que vous avez
   souscrit : la mesure de l'ancienneté et des variations de prix des annonces
   automobiles que vous consultez. La base légale est l'exécution du contrat
   qui nous lie. »

**Le compte**

3. « Nous conservons votre adresse email, l'empreinte de votre mot de passe
   (Argon2id — votre mot de passe lui-même n'est jamais enregistré), la date de
   création de votre compte et la date de vérification de votre adresse. »
4. « Votre adresse email sert à vous identifier, à vous envoyer les liens de
   vérification et de réinitialisation, et à vous adresser l'email du matin si
   vous l'avez activé. Elle n'est jamais cédée ni utilisée à des fins
   publicitaires. »
5. « Votre session de navigateur est conservée par un cookie strictement
   nécessaire, `adscope_session`, valable quatre-vingt-dix jours et prolongé à
   chaque usage. Il ne sert qu'à vous reconnaître ; nous ne posons aucun cookie
   de mesure d'audience ni de publicité. »
6. « Les enregistrements de session expirés sont effacés au bout de [30] jours,
   les liens de vérification et de réinitialisation au bout de [7] jours après
   leur péremption. »

**Ce que vous enregistrez**

7. « Nous conservons les recherches que vous enregistrez (leur nom et leurs
   filtres : marque, modèle, département, fourchettes de prix, de millésime et
   de kilométrage), les annonces que vous mettez de côté, et les familles de
   véhicules que vous surveillez. Vous pouvez les supprimer à tout moment
   depuis l'application ; elles le sont aussi avec votre compte. »

**Les emails**

8. « Nous conservons une copie des emails du matin qui vous ont été adressés
   pendant [90] jours, afin que vous puissiez les relire dans l'application. »
9. « Nous comptons l'ouverture de ces emails, uniquement par le clic sur un
   lien qu'ils contiennent : nous n'utilisons aucune image de suivi, aucun pixel
   espion, aucun outil tiers de mesure d'emailing. »
10. « Vous pouvez vous désabonner de l'email du matin par le lien en pied de
    chaque envoi, sans vous connecter, ou depuis “Mes alertes”. »
11. « Les emails transactionnels sont acheminés par [fournisseur], qui reçoit
    votre adresse et le contenu du message pour les seuls besoins de
    l'acheminement. » *(à écrire au branchement du fournisseur)*

**La mesure d'usage** — le point le plus important à ne pas taire

12. « Pour facturer et mesurer le service, nous enregistrons chaque jour, pour
    votre compte, le nombre d'annonces que vous avez consultées et le nombre de
    passages. Ce relevé quotidien est conservé [13] mois, puis remplacé par des
    totaux mensuels. »
13. « Chaque relevé de prix que votre navigation produit porte l'empreinte de
    votre licence. Ces relevés constituent l'historique de marché partagé entre
    tous les utilisateurs d'adscope ; ils sont conservés sans limite de durée,
    et l'empreinte qui les rattache à vous est détachée dès la suppression de
    votre compte. »
14. « Nous conservons la trace des alertes déjà envoyées à votre compte, pour ne
    jamais vous dire deux fois la même chose, pendant [N] mois. »

**L'extension**

15. « L'extension adscope lit les pages d'annonces automobiles que vous ouvrez
    sur leboncoin.fr et lacentrale.fr, et transmet à notre serveur les
    caractéristiques des véhicules qui y figurent : identifiant de l'annonce,
    marque, modèle, version, millésime, kilométrage, prix, carburant, boîte,
    code postal et type de vendeur. »
16. « Nous n'accédons à aucune autre page de votre navigateur, à aucun autre
    site, et nous ne lisons ni vos identifiants ni vos messages sur ces
    sites. »
17. « L'extension garde sur votre poste, dans le stockage local du navigateur,
    les signaux des annonces vues (trente jours au plus, pour un affichage
    immédiat et hors ligne) et l'adresse de la dernière page consultée (pour la
    fenêtre de diagnostic). Ces données ne quittent pas votre poste ; le bouton
    “Vider le cache” de la fenêtre les efface. »
18. « Parce que nous transmettons les annonces que vous consultez, nous
    reconstituons de fait votre activité de consultation sur ces deux sites, à
    la maille de l'annonce et du jour. C'est ce que mesure le relevé d'usage du
    point 12. »

**Le vendeur observé**

19. « Pour les vendeurs professionnels, nous conservons l'identifiant de
    boutique et la raison commerciale publiés sur l'annonce : ce sont des
    données d'entreprise, et elles servent à agréger les statistiques publiques
    d'un marchand. »
20. « Pour les annonces de particuliers, nous ne conservons ni nom, ni prénom,
    ni téléphone, ni adresse, ni le texte de l'annonce. Nous conservons
    l'identifiant de l'annonce, [le département], les caractéristiques du
    véhicule, la date de publication et l'historique des prix. » *(à mettre en
    vérité par D5 : aujourd'hui c'est le code postal complet)*
21. « Si vous êtes un particulier et que vous souhaitez que les données liées à
    votre annonce soient effacées, écrivez à [adresse de contact] en indiquant
    l'adresse de l'annonce : nous l'effaçons sous un mois. » *(exige un script
    d'effacement par `site` + `site_id`, qui n'existe pas)*

**Vos droits**

22. « Vous pouvez à tout moment obtenir une copie de vos données depuis “Mon
    compte”, ou en écrivant à [adresse de contact]. » *(exige D12)*
23. « Vous pouvez supprimer votre compte depuis “Mon compte”. Sont alors
    effacés : votre adresse email et votre mot de passe, vos sessions, vos
    recherches enregistrées, vos suivis, votre périmètre, votre réglage
    d'alertes, la copie de vos emails et vos relevés d'usage quotidiens. Reste
    l'historique de marché produit par votre navigation, dont le lien avec vous
    est rompu. » *(exige D1)*
24. « Vous pouvez nous écrire pour faire rectifier votre adresse, limiter ou
    contester un traitement, et vous pouvez saisir la CNIL. »

**Hébergement et transferts**

25. « Le service est hébergé par [Render], sur des serveurs situés en
    [région]. »
26. « Aucune donnée n'est transmise à un tiers à des fins publicitaires ou
    statistiques. Le site ne charge aucune police, aucun script et aucune image
    hébergés par un tiers. » *(exige D10 — aujourd'hui cette phrase serait
    fausse)*
27. « Les journaux techniques de nos serveurs conservent votre adresse IP et
    les adresses appelées pendant [N] jours, pour la sécurité et le diagnostic
    de panne. »
28. « Nous retenons temporairement votre adresse IP en mémoire, jusqu'à une
    heure, pour limiter les tentatives de connexion répétées. »

---

## 4. Ordre de traitement suggéré

1. **D1 + D2** (suppression de compte, et l'email hors de `licenses.label`) —
   rien ne doit être mis en ligne sans ça.
2. **D10** (Google Fonts) — dix minutes de travail, et la phrase 26 devient
   vraie.
3. **D13** (`.gitignore`) — une ligne, un risque fermé.
4. **D5** (code postal des particuliers, `disappeared_at` sur les routes de
   signaux) — la règle de projet est à mettre en accord avec le code.
5. **D4** (garde-fou `seller_name` côté API) et **D3** (`mails.text`).
6. **D6, D7, D8, D9, D11** — les durées de conservation, à trancher puis à
   écrire dans un seul endroit du code (une constante par table) et dans la
   politique.
7. **D12** (export), **D15** (fiche du Store) — au moment de la publication.

Sondes conservées : `TestClient` sur base isolée `adscope_data_probe`, créée et
détruite pendant l'audit. Aucune requête vers un site externe, aucune écriture
dans `adscope`, aucun appel à l'API réelle.
