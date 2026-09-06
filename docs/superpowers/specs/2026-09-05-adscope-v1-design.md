# adscope V1 — extension Chrome, API et crawler

Date : 2026-09-05
Périmètre : extension, API, crawler. Le détail d'ingénierie du crawler fera l'objet
d'un document dédié ; le présent document en fixe la politique et les interfaces.

Cette version remplace une première conception en local pur, abandonnée au profit
d'une architecture mutualisée.

## 1. Objet

Extension Chrome destinée aux marchands et mandataires automobiles. Elle affiche, sur
les pages de La Centrale, deux informations que le site ne met pas en avant :

1. **L'ancienneté réelle de l'annonce**, y compris lorsque le vendeur l'a republiée
   pour remettre son compteur à zéro.
2. **L'historique des prix** constaté depuis la première observation.

Les observations sont mutualisées : chaque utilisateur alimente un pool commun, complété
par un crawler. La couverture croît avec la base installée.

## 2. Contraintes

- Manifest V3.
- `host_permissions` limitées à `https://www.lacentrale.fr/*` et au domaine de l'API.
  Jamais `<all_urls>`.
- L'extension n'émet aucune requête vers une page que l'utilisateur n'a pas consultée
  lui-même. Elle lit le DOM des pages ouvertes et dialogue avec l'API, rien d'autre.
- Pas de code hébergé à distance.
- L'utilisateur reste sur la page source. Aucun lien sortant vers un concurrent, aucune
  recherche d'annonces hébergée par adscope.
- Ni télémétrie, ni affiliation.
- **Seuls des constats dérivés sont conservés** : identifiant, empreinte, prix,
  horodatage, ancienneté. Ni descriptions, ni photos, ni reproduction des fiches.

## 3. Reconnaissance du site (relevé du 2026-09-05)

### Fiche annonce

- **JSON-LD `Car` complet** dans `script[type="application/ld+json"]` : `offers.price`
  (`"9900"`), `offers.seller.address.postalCode` (`"75015"`), `mileageFromOdometer.value`
  (`"62686"`), `dateVehicleFirstRegistered` (`"2018"`), `brand`, `model`,
  `vehicleTransmission`, `fuelType`.
- **Ancienneté affichée en clair** dans `[class*="ReferencesInfo"]` :
  `Réf. pro : P308129 | Réf. annonce : W103336930` puis `Publiée il y a 60 jours`.
- Pas de `datePublished` dans le JSON-LD.
- `__NEXT_DATA__` inexploitable : `props` ne contient aucune donnée d'annonce.
- Classes CSS hashées (`ReferencesInfo_refs__0sGLk`) : les sélecteurs de présentation ne
  sont pas fiables dans la durée.

Pièges à ne pas confondre avec la date de publication : `firstTrafficDate`
(`"2018-09-14"`) est la première mise en circulation ; `creationDate` et `createdDate`
se rapportent au concessionnaire.

### Page de résultats

- **L'ancienneté n'y figure pas.** `Publiée il y a` est absent de toute la page.
- **Les cartes portent le reste** : marque, modèle, version, année, boîte, kilométrage,
  énergie, prix. **24 cartes par page** — une requête rafraîchit 24 annonces.
- Localisation hétérogène : département sur certaines cartes, nom de ville sur d'autres,
  là où la fiche donne un code postal complet.
- Les URL d'images encodent la référence d'annonce
  (`pictures.lacentrale.fr/classifieds/W103336930_STANDARD_0.jpg`, suffixe `_0`, `_1`…)
  et sont **signées par rendu** : changer la taille ou le watermark invalide la signature.
- Le site marque d'un `Déjà consultée` les annonces déjà ouvertes. Non exploité.

La navigation automatisée reçoit un 403 au premier appel. Sans incidence pour
l'extension ; c'est en revanche le principal risque du crawler (§10).

## 4. Identification des annonces

**Clé primaire** : identifiant natif extrait de l'URL, préfixé par le site
(`lc:87103336930`).

**Empreinte secondaire** : hash du véhicule, calculée et stockée dès la V1 mais **non
exploitée pour fusionner**. Elle permettra de rattacher l'historique d'une annonce
republiée sous un nouvel identifiant. Elle est stockée maintenant parce que les
empreintes du passé ne se recalculent pas.

L'extension et le crawler la calculent tous les deux. Les deux implémentations doivent
produire un hash identique, faute de quoi les jeux de données ne pourront jamais être
joints.

### Algorithme (identique JS et Python)

Normalisation d'une chaîne : NFD, suppression des caractères de catégorie `Mn`,
majuscules, remplacement de toute suite hors `[A-Z0-9]` par une espace, `trim`.

Clé : `[brand, model, version, year, mileage]` jointe par `|`. Les trois premiers sont
normalisés, `year` et `mileage` convertis en chaîne sans arrondi. Un champ absent devient
une chaîne vide, la position est conservée.

Empreinte : `sha256(clé, utf-8)`, hexadécimal, **12 premiers caractères**.

**Le code postal est délibérément exclu du hash.** La fiche expose un code postal complet
(`75015`), les cartes affichent tantôt un département (`93`), tantôt un nom de ville
(`PARIS`). L'inclure produirait deux empreintes différentes pour le même véhicule selon
la page d'observation, ce qui romprait précisément le rapprochement recherché. La
localisation est stockée à part, comme signal de désambiguïsation à la fusion.

Le kilométrage n'est pas arrondi. Le rapprochement d'annonces dont il a évolué se fera
par distance, au moment où la fusion sera activée.

### Vecteurs de test

Vérifiés identiques en JS et en Python le 2026-09-05. À placer dans
`shared/fingerprint-vectors.json`, assertés des deux côtés.

| clé normalisée | empreinte |
|---|---|
| `PEUGEOT\|308 II PHASE 2\|1 2 PURETECH 110 STYLE\|2018\|62686` | `54b22edbd39c` |
| `PEUGEOT\|308 II PHASE 2\|1 5 BLUEHDI 130 STYLE\|2019\|87545` | `b15b5ff0e88a` |
| `CITROEN\|C4 PICASSO\|1 6 BLUEHDI 120 SHINE\|2016\|118400` | `13b6e4bc4bc1` |
| `BMW\|SERIE 3 F30\|320D XDRIVE\|2019\|88123` | `946e1f6a35ed` |
| `\|\|\|\|` | `45ca31c3315a` |

## 5. Extraction

Cascade à trois niveaux, premier succès retenu :

1. **Données structurées** — JSON-LD `Car`. Contrat sémantique, survit aux refontes CSS.
2. **Attributs sémantiques** — `data-testid`, `itemprop`, `id`.
3. **Heuristique texte** — ancienneté par `/Publi[ée]e? il y a (\d+) (jour|mois|an)/` ;
   prix par le nœud correspondant à `/\d[\d\s.]*€/` de plus grande taille de police dans
   la moitié haute du document.

**L'unité du libellé d'ancienneté doit toujours être transmise**, dans le champ
`published_precision` (`day` | `month` | `year`). Ce n'est pas un détail de confort : un
libellé « il y a 2 mois » reste constant une trentaine de jours pendant que le temps
avance, ce qui ferait avancer la borne haute de publication et déclencherait une
republication fictive dès le huitième jour d'observation. Une observation d'unité
grossière est un **minorant d'ancienneté** : elle peut abaisser `site_published_first`,
jamais relever `site_published_last`. Voir §9.

**En cas d'échec complet, rien n'est injecté.** Jamais d'encart dégradé ni de « N/A ». Un
compteur local `misses` est incrémenté et affiché dans la popup : c'est le signal qui
permet à l'utilisateur de constater que le site a changé et de le signaler.

Tous les sélecteurs sont confinés dans `extension/src/sites/lacentrale.js`, qui exporte
`{ match, listingId, price, publishedDaysAgo, vehicle, cards }`. Aucun autre fichier ne
contient de sélecteur ; ajouter un site consiste à ajouter un fichier.

## 6. Extension

### Service worker

Le content script ne dialogue **jamais** directement avec l'API : la page est servie en
`https`, l'API en développement écoute en `http://localhost`, et le navigateur bloque la
requête (contenu mixte, CSP de page). Le service worker s'exécute sous l'origine de
l'extension et n'a ni l'une ni l'autre contrainte.

Il porte l'appel API, le cache, la clé de licence et le regroupement des envois. Le
content script communique avec lui par message.

### Flux

```
content script            service worker              API
──────────────            ──────────────              ───
extrait {id, prix,
 tuple, ancienneté}
        │
        └─ message ──────▶ cache local ─── hit ──┐
                                 │               │
                                 └─ POST /observations
                                    POST /listings/batch
                                           │
                                 ◀─────────┘ signaux
        ◀────── signaux ─────────┘
   injecte / met à jour
```

### Affichage progressif

**L'encart ne doit jamais attendre le réseau.** Il s'affiche immédiatement avec ce que la
page contient — l'ancienneté y est écrite — puis se complète à la réponse de l'API. Pas
d'écran vide, pas de saut visuel.

### Cache local

`chrome.storage.local` n'est plus la base de données mais un **cache et un repli hors
ligne**. Une clé par annonce, `a:lc:87103336930`, contenant les derniers signaux connus
et leur horodatage. La page de résultats lit ses 24 entrées en un seul `get([...])`.

Purge opportuniste au chargement, une fois par jour au plus, gardée par `_meta.purged` :
suppression au-delà de 30 jours sans consultation. Le cache n'a plus à être durable,
la base l'est. Pas de permission `alarms`.

Le quota reste celui par défaut ; `unlimitedStorage` n'est pas demandée. Deux protections
conservées, parce qu'elles évitent un arrêt silencieux de l'enregistrement :
plafonnement de l'historique de prix par annonce au **premier point plus les 20 plus
récents**, et interception de l'erreur de quota en écriture avec purge d'urgence puis une
seule nouvelle tentative. Le taux d'occupation est affiché dans la popup.

### Navigation SPA

La Centrale est une application Next.js : passer d'une annonce à l'autre ne recharge pas
la page et ne redéclenche pas le content script. Première source de défauts sur ce type
d'extension, traitée dès le départ.

`spa.js` instrumente `history.pushState` et `history.replaceState`, écoute `popstate`, et
retient un `MutationObserver` en repli. À chaque changement d'URL l'encart est retiré puis
réinjecté ; le nœud porte un attribut dédié, ce qui rend la détection de doublon triviale.

### Popup

Saisie et état de la clé de licence, nombre d'annonces en cache, compteur d'échecs
d'extraction, taux d'occupation, purge manuelle.

## 7. API

Quatre routes.

| route | rôle |
|---|---|
| `POST /v1/observations` | lot d'observations, extension ou crawler |
| `POST /v1/listings/batch` | signaux pour jusqu'à 30 identifiants — indispensable, une page de résultats affiche 24 cartes et doit tenir en un aller-retour |
| `GET /v1/listings/{site}/{id}` | signaux d'une fiche |
| `GET /v1/me` | validité de la licence |

FastAPI, Postgres. Limitation de débit par licence.

### Authentification

Clé de licence transmise en `Authorization: Bearer`, stockée hashée côté serveur,
révocable. L'extension la conserve dans `chrome.storage.local`. Aucune donnée personnelle
n'est requise pour utiliser l'extension.

## 8. Schéma Postgres

```
listings       site, site_id, fingerprint,
               brand, model, version, year, mileage, postal_code,
               first_seen, last_seen,
               site_published_first, site_published_last,
               disappeared_at, next_detail_crawl
               unique(site, site_id)

price_points   listing_id, observed_at, price, source ('user' | 'crawler')

licenses       key_hash, label, active, expires_at
```

**Un point de prix n'est écrit que s'il diffère du dernier connu pour l'annonce.** La
règle protège maintenant contre bien pire qu'en local : trente utilisateurs consultant la
même annonce le même jour ne doivent pas produire trente lignes.

`source` distingue les observations utilisateur du crawl ; c'est ce qui permettra de
mesurer l'apport réel de la base installée.

## 9. Détection de republication

La Centrale affiche déjà l'ancienneté, mais ce compteur repart à zéro lorsque le vendeur
republie pour masquer un véhicule qui ne se vend pas. C'est la fonction qui distingue le
produit.

À chaque observation d'une fiche, la date de publication site est calculée par
`aujourd'hui - publishedDaysAgo` et comparée à `site_published_first`. Le libellé étant
arrondi, deux observations successives peuvent produire des dates distantes d'un jour :
**le seuil de détection est de 7 jours**.

Deux cas doivent être distingués ; la V1 ne traite que le premier :

- **Sans changement d'identifiant** — le compteur repart, l'URL ne bouge pas. Détecté par
  la comparaison ci-dessus, sans recours à l'empreinte. **Périmètre V1.**
- **Sous un nouvel identifiant** — annonce supprimée puis recréée. Seule l'empreinte
  permet le rattachement. Hors périmètre ; l'empreinte est stockée pour le rendre
  possible plus tard.

**Seules les observations d'unité journalière font foi pour la borne haute.** Une
observation de précision `month` ou `year` met à jour `site_published_first` par
minimum, jamais `site_published_last`. Sans cette règle, toute annonce de plus de deux
mois déclenche une republication fictive au huitième jour de suivi — mesuré, et
précisément la contre-vérité affichée à un marchand que §16 dit vouloir éviter.

`published_days_ago` est borné à l'entrée entre 0 et 3650 jours. Les deux bornes de
publication étant monotones par construction — minimum d'un côté, maximum de l'autre —
une seule valeur aberrante empoisonne l'annonce **définitivement** : aucune observation
saine ultérieure ne peut réparer.

### Question ouverte : jusqu'à quel âge La Centrale affiche-t-elle des jours ?

Le relevé du 2026-09-05 montre « Publiée il y a 60 jours » — unité journalière à deux mois
d'âge. On ignore si le site bascule en mois au-delà d'un certain seuil, et lequel.

L'enjeu est direct : la détection de republication ne fonctionne que sur les observations
d'unité journalière. Si La Centrale passe en mois à partir de 90 jours, la fonction
distinctive du produit s'éteint précisément sur les annonces les plus anciennes, celles qui
intéressent le plus un marchand.

À vérifier en ouvrant quelques fiches d'âges croissants, au moment d'écrire la couche
d'extraction de l'extension. La réponse borne la portée réelle de la V1.

## 9 bis. Concurrence — dette connue, bloquante avant mise en ligne

Mesuré sur la V1 et **volontairement non corrigé** : à un seul utilisateur, ces défauts
n'ont aucun effet ; ils deviennent bloquants dès que la mutualisation joue.

- **Perte de mises à jour.** `record()` lit sans verrou puis écrit des littéraux. Sur dix
  observations simultanées d'une même annonce, le compteur de vues n'avance que de 1 au
  lieu de 10, et `site_published_first` peut avancer — violation de l'invariant. Correctif
  attendu : `with_for_update()` ou incrément SQL atomique.
- **Première observation simultanée d'une annonce inconnue.** Sans `ON CONFLICT` ni
  reprise sur `IntegrityError`, deux utilisateurs ouvrant la même annonce neuve au même
  instant provoquent un 500 pour l'un d'eux.

À noter, sur le même terrain : **la règle « un point de prix par changement réel » tient
sous concurrence**, le `flush()` prenant le verrou de ligne avant la lecture du dernier
prix. Mais c'est un effet de bord, pas une intention écrite : déplacer ce `flush` casserait
la garantie sans qu'aucun test ne le signale.

## 10. Crawler — politique

Le détail d'ingénierie fait l'objet d'un document dédié. Politique retenue :

### Deux tâches de nature différente

**Balayage des résultats — quotidien, sans condition.** Parcourt les pages de résultats
du segment : découvre les nouvelles annonces, rafraîchit tous les prix, repère les
disparitions. Une requête couvre 24 annonces, soit ~210 requêtes par jour pour un segment
de 5 000 annonces. Négligeable.

**Visite des fiches — rare et arbitrée par budget.** Une fiche n'apporte que ce que la
carte n'a pas : l'ancienneté. Budget quotidien fixe, file triée par priorité :

1. **Annonces jamais vues en fiche** — sans visite, pas d'ancienneté. Obligatoire une
   fois. À 3-5 % de nouveautés par jour sur 5 000 annonces, c'est 150 à 250 requêtes :
   **c'est ce poste qui dimensionne le budget**, pas la péremption.
2. **Candidates à la disparition** — repérées absentes du balayage, confirmées par un 404.
   Produit le délai de vente et le prix final, la donnée la plus vendeuse du produit.
3. **Contrôle de republication** — cadence lente, deux à trois semaines. Le compteur ne
   bouge qu'en cas de republication, c'est rare.

Un budget, et non un seuil : « tout ce qui dépasse X jours » fait croître silencieusement
le volume avec le corpus, « les N premiers par score de péremption » borne la charge.

### Fraîcheur partagée et intervalle adaptatif

Le compteur de fraîcheur est **commun aux utilisateurs et au crawler**. Une annonce
consultée par un marchand est fraîche sans requête. Plus la base installée grandit, moins
le crawler travaille.

Les deux se complètent naturellement : les utilisateurs ouvrent des fiches — la donnée
coûteuse — pendant que le crawler balaie des résultats — la donnée bon marché.

`next_detail_crawl` suit un intervalle adaptatif : 3 jours au départ, **doublé à chaque
visite sans changement** et plafonné à 21 jours, **ramené à 1 jour dès qu'un prix bouge**.

### Le crawl direct est bloqué — mesuré le 2026-09-05

La Centrale est protégée par **DataDome** (`geo.captcha-delivery.com`, défi JavaScript).
Quatre approches testées, toutes en HTTP 403 sur une page de challenge de ~1,5 Ko :

| approche | résultat |
|---|---|
| `curl` nu | 403 |
| `curl` avec en-têtes navigateur complets | 403 |
| `curl_cffi`, empreinte TLS Chrome 124 / 131 / Safari 17 | 403 |
| Chromium Playwright neuf, headless | 403, défi non résolu après 8 s |
| Chromium Playwright neuf, fenêtre visible | 403, défi non résolu après 8 s |

Seul un navigateur à **profil persistant déjà utilisé** passait — et il a cessé de passer
au cours de la même session, après une quinzaine de chargements automatisés.

**Conséquence : la politique de crawl décrite ci-dessus n'est pas applicable en l'état.**
Les techniques qui permettraient de la rendre applicable — falsification d'empreinte
navigateur, résolution de CAPTCHA, rotation de proxys résidentiels — visent explicitement
à défaire une classification anti-automatisation. Elles sont hors périmètre de ce projet.

**La voie d'acquisition retenue est l'extension.** Le navigateur d'un marchand, sur les
pages qu'il consulte lui-même, n'est pas bloqué : c'est un usage réel, pas une
automatisation. C'est aussi le modèle de Castorus, et la raison pour laquelle il tient
depuis quinze ans. La mutualisation n'est donc plus seulement un choix de couverture,
c'est le seul canal d'acquisition viable.

Pistes restant ouvertes, par ordre de sérieux : un accord de données avec La Centrale, qui
vend déjà des services aux professionnels ; un second site moins protégé pour élargir la
couverture ; le crawl du seul contenu que le site expose délibérément aux robots.

### Risque principal (historique, avant le relevé ci-dessus)

La Centrale renvoie un 403 à la première requête automatisée. En-têtes réalistes, cadence
lente, repli Playwright. C'est le risque technique majeur du projet, devant l'extension.

Le crawler écrit directement en base. L'API sert les lectures et les observations
utilisateur.

## 10 bis. Relevé comparatif des sites — 2026-09-05

| site | HTTP nu | anti-bot | robots.txt |
|---|---|---|---|
| lacentrale.fr | 403 | DataDome, défi JS | illisible, lui-même derrière DataDome |
| leboncoin.fr | **200**, contenu complet | aucun sur ces routes | **interdit l'accès automatisé en toutes lettres** |
| autoscout24.fr | **200**, 754 Ko, JSON-LD | aucun | `Disallow: /lst?` — la page de résultats est fermée à tous |
| paruvendu.fr, largus.fr | 404 sur les URL testées | — | non évalué |

En-tête du `robots.txt` de leboncoin, mot pour mot : *« It's forbidden to use search robots
or other automatic methods to access Leboncoin.fr. Access is only permitted with special
permission from Leboncoin.fr. »*

### Ce que leboncoin expose, et qui vaut mieux que La Centrale

Sur une fiche, en clair dans le payload :

```
"first_publication_date": "2026-08-21 18:07:27"
"index_date":             "2026-09-03 13:24:42"
"price": [29990]
```

**Un horodatage exact**, pas un libellé arrondi. Cela supprime d'un coup le problème de
précision de §5 et §9 : plus de `published_precision`, plus de seuil de 7 jours, plus de
faux positif sur les libellés en mois.

Et surtout, **`index_date` est la date de dernière remontée**. L'écart entre les deux dates
est la republication, donnée directement plutôt qu'inférée. Or leboncoin trie par défaut
sur `index_date` : une annonce remontée réapparaît en tête comme si elle était neuve. C'est
exactement le fait que le site n'affiche pas et que le produit doit révéler.

**Conséquence : leboncoin est le meilleur premier site pour l'extension**, indépendamment
de toute question de crawl — l'extension lit les pages que le marchand consulte lui-même.

## 10 ter. La preuve, constatée le 2026-09-06

Sur une fiche leboncoin réelle — Volkswagen Tiguan BUSINESS 2.0 TDI, CVD Automobiles,
Palaiseau, 15 000 € :

| | |
|---|---|
| ce que **leboncoin** affiche sous le prix | `aujourd'hui à 21:14` |
| ce que **adscope** lit dans la même page | en ligne depuis **4 jours**, remontée aujourd'hui |

Le site n'omet pas l'ancienneté : il affiche `index_date` à l'endroit où le lecteur
comprend « date de publication ». Une annonce de quatre jours se présente comme neuve
parce que le vendeur a payé une remontée le soir même.

C'est la proposition de valeur du produit, désormais constatée plutôt que supposée, et
elle tient en une capture d'écran : *leboncoin vous dit « aujourd'hui », la voiture est
là depuis quatre jours.*

La donnée qui permet de le dire est déjà dans la page que le marchand a ouverte. Aucune
requête supplémentaire, aucune base, aucun historique préalable.

## 10 quater. Pagination : le bloc de données se périme — constaté le 2026-09-06

**Constaté en navigation réelle : aucune pastille n'apparaît en page 2.** Un rechargement
complet les fait revenir.

Cause établie hors ligne. leboncoin utilise le **Pages Router** de Next.js : `__NEXT_DATA__`
est écrit une seule fois au rendu serveur. Une navigation interne récupère les nouvelles
données sur `/_next/data/{buildId}/…` et met à jour l'affichage **sans jamais réécrire ce
bloc**. Le HTML servi ne contient d'ailleurs aucun lien `?page=` : les contrôles de
pagination sont créés en JavaScript, donc empruntent ce mécanisme.

L'extension lit donc les annonces de la page 1 pendant que l'utilisateur regarde la page 2.
Les identifiants ne correspondant à aucune carte présente, aucune pastille n'est posée.
Le mode de défaillance est heureusement silencieux plutôt que trompeur — rien ne s'affiche,
au lieu d'afficher du faux.

**Correction retenue** : un content script déclaré `"world": "MAIN"` observe, dans le
contexte de la page, les données que le navigateur a **déjà reçues** au fil de la
navigation, et les transmet au reste de l'extension par événement. Aucune requête
supplémentaire n'est émise : on lit ce que la page a chargé pour l'utilisateur, exactement
comme on le fait déjà avec `__NEXT_DATA__`, mais à la source qui reste à jour.

Ce défaut vaudra pour tout site en application monopage. À vérifier sur chaque nouveau
site : le bloc de données initial suit-il la navigation ?

## 10 quinquies. Mesure de marché — 2026-09-06, 1 792 annonces

Premier relevé à volume réel, sur des annonces automobiles leboncoin.

| | annonces | réactualisées | taux |
|---|---|---|---|
| **professionnels** | 249 | 194 | **78 %** |
| particuliers | 1 787 | 108 | 6 % |

**Un facteur treize.** Quatre annonces de marchand sur cinq sont remises en avant, contre
une sur seize chez les particuliers. Ce sont deux comportements distincts, et le produit
rend visible celui que le site rémunère.

Âge réel des annonces réactualisées : **155 sur 285 dépassent le mois**. Ce n'est donc pas
du bruit de fraîcheur, c'est du stock qui ne tourne pas.

Cas les plus parlants du relevé :

```
BMW 635        en ligne 2 235 j (6 ans)   réactualisée il y a 2 j    15 000 €
Peugeot 5008   en ligne   823 j           réactualisée le jour même  17 890 €
Citroën        en ligne   571 j           réactualisée la veille     23 980 €
Volvo S60      en ligne   383 j           réactualisée il y a 3 j    27 870 €
```

### Ce que ce chiffre change dans la conception

À 78 %, **la réactualisation n'est plus un signal** : c'est le comportement normal d'un
marchand, qui paie pour rester visible. Une alerte qui se déclenche sur quatre cartes
professionnelles sur cinq ne discrimine rien — c'est le défaut déjà rencontré avec les
pastilles « moins d'un jour », sous une autre forme.

Le signal est **l'annonce ancienne qui est réactualisée** : celle dont le vendeur maintient
artificiellement la visibilité parce qu'elle ne part pas.

L'affichage doit donc mettre l'ancienneté au premier plan et la réactualisation en
aggravant, et non l'inverse. Le seuil d'alerte devient « en ligne depuis plus d'un mois
**et** réactualisée récemment » plutôt que « réactualisée ». Sur ce relevé, cela ramène les
alertes professionnelles d'environ 194 à 130, chacune désignant réellement du stock dormant.

### Seuils retenus — mesurés le 2026-09-06 sur les 7 110 annonces en base

`notable` = **en ligne depuis 31 jours ou plus** *et* **réactualisée** *et* **réactualisée
il y a 14 jours ou moins**.

- **31 jours** : la borne où l'affichage cesse de compter en jours et dit « 1 mois ».
  L'alerte s'allume exactement quand le libellé change d'unité.
- **14 jours** : sur les annonces pro anciennes et réactualisées, 1 903 sur 1 948 le sont
  depuis moins de 14 jours ; les 45 restantes s'étalent jusqu'à 55 jours. La coupure tombe
  dans un creux de la distribution, et écarte les remises en avant qui ne soutiennent plus
  rien.

Effet mesuré sur la base : la part des cartes professionnelles en alerte passe de **87,8 %
à 47,3 %** (3 533 → 1 904), celle des particuliers de **76,0 % à 1,4 %** (2 349 → 44).
Rapporté au relevé de 1 792 annonces, cela ramène les alertes professionnelles de 194 à
environ 121.

**L'annonce ancienne jamais réactualisée** (`dormant`, 228 pro et 904 particuliers) reçoit
un poids intermédiaire, pas l'alerte : le site affiche déjà sa vraie date, il n'y a aucune
contradiction à dénoncer. Elle est de surcroît plafonnée — aucune annonce non réactualisée
ne dépasse 60 jours en base, durée de vie d'une annonce leboncoin. L'alerte est réservée à
l'écart entre ce que le site montre et ce qui est vrai.

### Usage commercial

« 78 % des annonces de marchands sont remises en avant » explique en une phrase pourquoi le
classement de leboncoin n'est pas fiable. Suivi de la BMW de six ans, l'argument se passe de
démonstration.

## 10 sexies. Statistiques par vendeur — décidé le 2026-09-06

### La répartition entre pastille et popup

La pastille **alerte**, la popup **informe**. Tout ce qui mérite d'être lu sans interrompre
va dans la popup. C'est la réponse structurelle au problème rencontré deux fois — pastilles
« moins d'un jour » partout, puis alertes de réactualisation sur 88 % des cartes
professionnelles : une pastille qui parle tout le temps ne dit plus rien.

### Ce que la popup montrera sur une fiche

```
Ce vendeur — CVD Automobiles
29 annonces en ligne
18 depuis plus d'un mois        62 %
médiane d'ancienneté            47 j
baisse moyenne constatée        −3,2 % au bout de 6 semaines
```

Ce n'est plus « cette annonce est vieille » mais **« ce marchand a du stock qui dort et il
finit par baisser »**. C'est un argument de négociation, et le vendeur ne peut pas le
masquer : il se déduit de ses propres annonces, publiées volontairement.

### La décision de stockage

**L'identifiant de vendeur n'est retenu que pour les professionnels.** Un `store_id` de
marchand est de la donnée d'entreprise sur une activité commerciale ; l'identifiant d'un
particulier serait de la donnée personnelle, et agréger les annonces d'un particulier n'a
aucun sens — il vend une voiture.

Même ligne que celle tracée pour l'affichage (§ 2), appliquée au stockage, et formulable
telle quelle dans la politique de confidentialité : *nous agrégeons les annonces des
vendeurs professionnels, jamais celles des particuliers*.

### Un principe de mesure

La popup interrogera l'API pour calculer ces statistiques : **l'appel est le signal**. On
saura qu'elle a été ouverte, sur quelle fiche et à quelle fréquence, sans un seul événement
de télémétrie ni catégorie supplémentaire dans la déclaration Store.

C'est la troisième fois que la mesure tombe gratuitement d'une fonctionnalité existante —
après le compteur d'observations et le rattachement à la licence. D'où le principe :
**ne jamais ajouter de collecte pour mesurer ce que l'usage produit de lui-même.**

## 11. Affichage

### Encart, sous le prix de la fiche

```
Publiée il y a 60 j                     ← lu sur la page, dès la première vue
Suivie depuis 12 j · 3 vues             ← observations mutualisées
9 900 €   ▼ −1 000 € en 12 j
  10 900 €  →  9 900 €    (24 août)
```

Les deux sources sont toujours distinguées visuellement. Ne jamais présenter une donnée du
site comme une observation adscope, ni l'inverse : la confusion détruirait la confiance.

Republication :

```
⚠ Republiée le 12 août — en ligne depuis 74 j en réalité
```

### Cas vide

Traité par l'ancienneté lue sur la page : **dès la première visite, sans aucune donnée en
base, l'encart affiche une information exacte et utile.** Pour l'historique de prix, le
libellé est « Prix stable depuis X j » plutôt que « aucun changement » — même donnée, mais
c'en est réellement une pour un marchand.

### Pastille sur les cartes de résultats

Ancienneté et marqueur de baisse de prix, en un seul appel `POST /listings/batch` pour les
24 cartes.

## 12. Chrome Web Store

**But unique** :

> Afficher l'ancienneté et l'historique de prix des annonces automobiles consultées par
> l'utilisateur, à partir d'observations mutualisées.

**Déclaration de données** : l'extension collecte de l'**activité de navigation sur le
web** — les annonces consultées sur lacentrale.fr sont transmises au serveur adscope. À
déclarer explicitement. Données non revendues, non utilisées à d'autres fins, non
utilisées pour évaluer une solvabilité.

**Politique de confidentialité** obligatoire, à une URL publique, décrivant précisément ce
qui est transmis et conservé.

**`host_permissions`** : `https://www.lacentrale.fr/*` pour lire les annonces, et le
domaine de l'API pour l'échange. Deux justifications à rédiger.

**`permissions`** : `storage` seul. Ni `tabs`, ni `activeTab`, ni `unlimitedStorage`, ni
`alarms`, ni `web_accessible_resources`, ni CSP personnalisée.

**Autres points avant dépôt** :

- Mention explicite de non-affiliation à La Centrale.
- Captures 1280×800 : l'encart doit être présentable dès le PoC.
- Pas de bundler ni de minification. Le reviewer lit la source.
- Vérifier la disponibilité du nom « adscope ».

**Pas d'imports ES entre content scripts** : MV3 ne les prend pas en charge sans
`web_accessible_resources`. Les fichiers sont déclarés dans l'ordre dans `js: [...]`,
partagent le même scope et publient dans un unique espace de noms `ADS`.

Le régime de review est celui de Keepa ou Honey : plus long que pour une extension sans
collecte, mais parfaitement passable.

## 13. Développement local puis Render

Le backend tourne d'abord sur le poste de développement, puis sur Render.

**Le manifeste ne peut pas partir au Store avec `localhost` dans `host_permissions`.**
`extension/manifest.json` est la version de production ; `scripts/dev-manifest.sh` en
dérive la variante de développement. À prévoir maintenant plutôt qu'au moment du dépôt.

**Le crawler tournera depuis une IP résidentielle.** Moins exposée au blocage qu'une IP de
datacenter, mais un blocage priverait la connexion personnelle de l'accès au site.
Acceptable en PoC, à revoir à la montée en volume.

## 14. Arborescence

```
adscope/
├── extension/                    ← seul contenu du ZIP Store
│   ├── manifest.json
│   ├── src/
│   │   ├── sites/lacentrale.js   ~70   tous les sélecteurs
│   │   ├── extract.js            ~60   cascade d'extraction
│   │   ├── fingerprint.js        ~25   empreinte
│   │   ├── cache.js              ~80   cache local, purge, quota
│   │   ├── api.js                ~60   client API (service worker)
│   │   ├── sw.js                 ~70   service worker, messages, licence
│   │   ├── format.js             ~30   durées, montants, deltas
│   │   ├── spa.js                ~30   changements d'URL
│   │   ├── detail.js             ~70   encart de la fiche
│   │   ├── listing.js            ~60   pastilles des cartes
│   │   └── ui.css                ~80
│   ├── popup/{popup.html,popup.js}
│   └── icons/
├── api/                          ← FastAPI + Postgres
├── crawler/                      ← Python
├── shared/
│   ├── fingerprint.md
│   └── fingerprint-vectors.json  ← asserté par les tests JS et Python
├── docs/superpowers/specs/
├── scripts/
│   ├── package-extension.sh      ← zippe le contenu de extension/
│   └── dev-manifest.sh
└── README.md
```

Aucun fichier au-dessus de 150 lignes. Aucune étape de build pour l'extension, qui reste
chargeable en « extension non empaquetée ». `manifest.json` devant être à la racine du
ZIP, le script archive le *contenu* de `extension/`.

Volume attendu : de l'ordre de 1 500 lignes réparties sur trois composants, contre 400
pour la version locale abandonnée.

## 15. Hors périmètre V1

- **Dédup multi-sites.** Suppose deux sites en production et un corpus. Étudiée : les
  hashes perceptuels seuls ne suffisent pas (§16), un embedding contrastif sera nécessaire.
- **Exploitation de l'empreinte pour fusionner.** Calculée et stockée, rien de plus.
- **leboncoin.** Son payload `__NEXT_DATA__` expose l'annonce en JSON structuré,
  contrairement à celui de La Centrale ; c'est le candidat naturel pour le second site.
- **Stockage de photos ou de descriptions.** Exclu par principe (§2).

## 16. Étude versée au dossier — hashes perceptuels

Mesuré le 2026-09-05 sur 12 photos réelles de Peugeot 308 (66 paires, 12 transformations
chacune), en vue de la dédup multi-sites.

Distances inter-voitures : dHash min **17**, médiane 27. pHash min **12**, médiane 28.

Robustesse, distance maximale observée : redimensionnement et JPEG ≤ 3 ; saturation 3 ;
luminosité 5 ; **watermark différent 7 en dHash contre 16 en pHash** ; recadrage 3 % → 8,
7 % → 20, 12 % → 27 ; miroir 43.

**Conclusion.** Le seuil utile est **dHash ≤ 8** : aucun faux positif sur l'échantillon, et
il capte le cas dominant du fichier identique republié. Le recadrage au-delà de 7 % et le
miroir lui échappent — il n'existe aucun seuil séparant « même photo recadrée à 7 % » de
« voiture différente ». dHash est préférable à pHash sur le critère décisif, le changement
de watermark, garanti entre deux sites.

Précision élevée, rappel moyen : c'est le bon compromis, une fusion erronée affichant une
contre-vérité à un marchand quand un doublon manqué ne fait que perdre une occasion.

Rappel récupérable sans stocker d'images : hasher **toutes** les photos et rapprocher dès
qu'une seule paire passe sous le seuil ; stocker aussi le hash de l'image retournée pour
le miroir ; toujours confirmer par le tuple technique, jamais fusionner sur la photo seule.

Réserves : 66 paires seulement — sur 500 000 annonces le minimum inter-voitures descendra
nettement — et test mené sur des vignettes 352×264.

Un **autoencodeur serait le mauvais outil** : son latent est optimisé pour la
reconstruction, pas pour la similarité, et deux voitures identiques de couleur se
reconstruisent pareil. Un embedding contrastif pré-entraîné (DINOv2, CLIP) est à la fois
plus adapté à la tâche, plus compact et non inversible en pratique.

## 17. Décisions d'exploitation

Le crawl et la mutualisation sont actés en connaissance des risques exposés : en opérant
depuis une infrastructure identifiable, l'exploitant devient l'acteur désigné, et
l'exposition au titre du droit des producteurs de bases de données — extraction comme
réutilisation — se concentre sur lui. Le dépôt est maintenu privé.

La position retenue est défendable parce qu'elle est exacte : **des constats dérivés sur
des annonces consultées, jamais une réplication de la base.** Ni descriptions, ni photos,
ni recherche d'annonces hébergée, ni lien détournant l'utilisateur. La déclaration au
Chrome Web Store est complète et conforme à ce que le produit fait réellement.

Un avis d'avocat spécialisé en propriété intellectuelle reste recommandé avant
commercialisation.
