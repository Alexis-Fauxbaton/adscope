# adscope V1 — extension Chrome, enrichissement des annonces La Centrale

Date : 2026-09-05
Périmètre : extension uniquement. Le crawler backend fera l'objet d'un cycle séparé.

## 1. Objet

Extension Chrome destinée aux marchands et mandataires automobiles. Elle affiche,
sur les pages de La Centrale, deux informations que le site ne met pas en avant :

1. **L'ancienneté réelle de l'annonce**, y compris lorsque le vendeur l'a republiée
   pour remettre son compteur à zéro.
2. **L'historique des prix** constaté depuis la première observation.

Le traitement est intégralement local. Aucune requête réseau n'est émise par
l'extension, sous aucune forme.

## 2. Contraintes non négociables

- Manifest V3.
- Stockage `chrome.storage.local` exclusivement. Aucun backend, aucune remontée.
- `host_permissions` limitées à `https://www.lacentrale.fr/*`. Jamais `<all_urls>`.
- Aucune requête vers une page que l'utilisateur n'a pas consultée lui-même.
  Pas de crawl, pas de préchargement, pas de revalidation en tâche de fond.
- Aucune collecte de données utilisateur, déclarable tel quel sur la fiche Store.
- Pas de code hébergé à distance.
- L'utilisateur reste sur la page source. Aucun lien sortant vers un concurrent.
- Ni télémétrie, ni affiliation.

## 3. Reconnaissance du site (relevé du 2026-09-05)

Relevé sur une fiche réelle (`/auto-occasion-annonce-87103336930.html`) :

- **JSON-LD `Car` présent et complet** dans `script[type="application/ld+json"]` :
  `offers.price` (`"9900"`), `offers.priceCurrency`, `offers.seller.address.postalCode`
  (`"75015"`), `mileageFromOdometer.value` (`"62686"`), `dateVehicleFirstRegistered`
  (`"2018"`), `brand`, `model`, `vehicleTransmission`, `fuelType`.
- **L'ancienneté est affichée en clair** dans un bloc `[class*="ReferencesInfo"]` :
  `Réf. pro : P308129 | Réf. annonce : W103336930` puis `Publiée il y a 60 jours`.
- **Pas de `datePublished`** dans le JSON-LD.
- **`__NEXT_DATA__` est inexploitable** : `props` ne contient aucune donnée d'annonce.
  L'extraction repose donc sur le JSON-LD et le DOM.
- **Classes CSS hashées** (`ReferencesInfo_refs__0sGLk`). Les sélecteurs de présentation
  ne sont pas fiables dans la durée.

Pièges identifiés, à ne pas confondre avec la date de publication :

- `firstTrafficDate` (`"2018-09-14"`) est la première mise en circulation du véhicule.
- `creationDate` et `createdDate` présents dans le HTML se rapportent au concessionnaire.

La navigation automatisée reçoit un 403 au premier appel. Sans incidence pour
l'extension, qui lit le DOM d'une page chargée par l'utilisateur dans sa propre session.

## 4. Identification des annonces

**Clé primaire** : identifiant natif extrait de l'URL, préfixé par le site.
`lc:87103336930`. Exact, aucun faux positif, porte l'historique.

**Empreinte secondaire** : hash du véhicule, stockée dès la V1 mais **non exploitée**.
Elle servira à rattacher l'historique d'une annonce republiée sous un nouvel
identifiant. Elle est stockée maintenant parce que les empreintes du passé ne
peuvent pas être recalculées rétroactivement.

L'empreinte est également calculée par le crawler Python. Les deux implémentations
doivent produire un hash identique, faute de quoi les deux jeux de données ne
pourront jamais être joints.

### Algorithme (identique JS et Python)

Normalisation d'une chaîne :

1. Normalisation Unicode NFD.
2. Suppression des caractères de catégorie `Mn` (diacritiques).
3. Passage en majuscules.
4. Remplacement de toute suite de caractères hors `[A-Z0-9]` par une espace.
5. `trim`.

Clé : `[brand, model, year, mileage, postalCode]` jointe par `|`.
`brand`, `model` et `postalCode` sont normalisés ; `year` et `mileage` sont convertis
en chaîne sans arrondi. Un champ absent devient une chaîne vide, la position est
conservée.

Empreinte : `sha256(clé, utf-8)`, hexadécimal, **12 premiers caractères**.

Le kilométrage n'est pas arrondi. Le rapprochement d'annonces dont le kilométrage
a évolué se fera par distance, au moment où la détection de republication sera activée.

### Vecteurs de test

Vérifiés identiques en JS et en Python le 2026-09-05. À placer dans
`shared/fingerprint-vectors.json` et à asserter des deux côtés.

| brand | model | year | mileage | CP | clé normalisée | empreinte |
|---|---|---|---|---|---|---|
| PEUGEOT | 308 II phase 2 | 2018 | 62686 | 75015 | `PEUGEOT\|308 II PHASE 2\|2018\|62686\|75015` | `7c3d517a035c` |
| Citroën | C4 Picasso  1.6 BlueHDi | 2016 | 118400 | 69003 | `CITROEN\|C4 PICASSO 1 6 BLUEHDI\|2016\|118400\|69003` | `d3c993ccd417` |
| Renault | Mégane IV Estate | 2021 | 45000 | 33000 | `RENAULT\|MEGANE IV ESTATE\|2021\|45000\|33000` | `fb3f6cd58600` |
| BMW | Série 3 (F30) 320d | 2019 | 88123 | 06000 | `BMW\|SERIE 3 F30 320D\|2019\|88123\|06000` | `04a8af6998a2` |
| (vide) | (vide) | (vide) | (vide) | (vide) | `\|\|\|\|` | `45ca31c3315a` |

## 5. Extraction

Cascade à trois niveaux, dans l'ordre, premier succès retenu :

1. **Données structurées** — JSON-LD `Car`. Contrat sémantique, survit aux refontes CSS.
2. **Attributs sémantiques** — `data-testid`, `itemprop`, `id`.
3. **Heuristique texte** — pour l'ancienneté, `/Publi[ée]e? il y a (\d+) (jour|mois|an)/`.
   Pour le prix, le nœud correspondant à `/\d[\d\s.]*€/` de plus grande taille de police
   dans la moitié haute du document.

**En cas d'échec de la cascade, rien n'est injecté.** Jamais d'encart dégradé, jamais
de « N/A ». Un compteur local `misses` est incrémenté et affiché dans la popup : c'est
le signal qui permet à l'utilisateur de constater que le site a changé et de le
signaler. Aucune donnée ne quitte le poste.

Tous les sélecteurs sont confinés dans `extension/src/sites/lacentrale.js`, qui exporte :

```
{ match(url), listingId(url), price(doc), publishedDaysAgo(doc),
  vehicle(doc), cards(doc) }
```

Aucun autre fichier ne contient de sélecteur. Ajouter un site consiste à ajouter
un fichier dans ce répertoire.

## 6. Stockage

### Schéma

Une clé par annonce. Lecture O(1), pas de read-modify-write sur un blob unique,
pas de corruption si deux onglets écrivent simultanément. La page de résultats lit
ses trente annonces en un seul `get([...])`.

```
"a:lc:87103336930": {
  f:  1757000000000,   // première observation (ms)
  l:  1757600000000,   // dernière observation (ms)
  p:  [[ts, 10900], [ts, 9900]],   // prix horodatés
  n:  7,               // nombre d'observations
  fp: "7c3d517a035c",  // empreinte
  sp: "2026-07-07",    // date de publication site, la plus ancienne observée
  spr:"2026-07-07"     // date de publication site, la plus récente observée
}
```

Clé de métadonnées :

```
"_meta": { started: ts, purged: ts, misses: n }
```

### Règles d'écriture

- Un point de prix n'est ajouté **que si le prix diffère du dernier point enregistré**.
  Recharger dix fois la page ne crée pas dix entrées. La croissance est bornée par les
  changements réels.
- `l` et `n` sont mis à jour à chaque observation.
- `sp` ne recule jamais : `sp = min(sp, date calculée)`. `spr` ne recule jamais non plus.
- L'écriture a lieu **depuis les fiches et depuis les cartes de résultats**. Trente
  annonces captées par page de résultats consultée, sans aucune requête réseau : les
  cartes sont déjà affichées sur une page ouverte par l'utilisateur. C'est ce qui rend
  l'historique exploitable en jours plutôt qu'en semaines.

### Croissance et purge

Un enregistrement pèse de l'ordre de 200 octets. Le quota standard de
`chrome.storage.local` est d'environ 10 Mo, soit à peu près 50 000 annonces. Un
marchand actif en observe de l'ordre de 6 000 par mois. La capacité couvre donc
largement plus d'un an. **La permission `unlimitedStorage` n'est pas demandée**, ce qui
retire une justification à fournir au Store.

Purge opportuniste, au chargement du content script, une fois par jour au plus, gardée
par `_meta.purged`. Pas de service worker, pas de permission `alarms`.

Règle : suppression des enregistrements dont `l` remonte à plus de **180 jours**,
**sauf** si `p.length >= 2`. Un historique de prix effectif est ce que le produit a de
plus précieux et n'est pas reconstituable.

## 7. Détection de republication

C'est la fonction qui distingue le produit : La Centrale affiche déjà l'ancienneté,
mais ce compteur repart à zéro lorsque le vendeur republie pour masquer un véhicule
qui ne se vend pas.

À chaque observation d'une fiche, la date de publication site est calculée par
`aujourd'hui - publishedDaysAgo`. Elle est comparée à `sp`.

Le libellé « il y a N jours » étant arrondi, deux observations successives peuvent
produire des dates distantes d'un jour. **Le seuil de détection est donc de 7 jours** :
une republication est retenue lorsque la date calculée dépasse `sp` de plus d'une
semaine. `spr` conserve la date la plus récente pour l'affichage.

Deux cas de republication doivent être distingués. La V1 ne traite que le premier :

- **Republication sans changement d'identifiant** — le vendeur relance son annonce, le
  compteur du site repart à zéro, l'URL reste la même. Détectée par la comparaison
  ci-dessus, sans recours à l'empreinte. **C'est le périmètre V1.**
- **Republication sous un nouvel identifiant** — l'annonce est supprimée puis recréée,
  l'historique est rompu du point de vue de la clé primaire. Seule l'empreinte permet
  de les rattacher. Hors périmètre V1 ; l'empreinte est stockée dès maintenant pour
  rendre ce rattachement possible plus tard.

## 8. Affichage

### Encart, injecté sous le prix de la fiche

```
Publiée il y a 60 j                     ← lu sur la page, dès la première vue
Suivie depuis 12 j · 3 vues             ← observation adscope
9 900 €   ▼ −1 000 € en 12 j
  10 900 €  →  9 900 €    (24 août)
```

Les deux sources sont toujours distinguées visuellement. Ne jamais présenter une
donnée du site comme une observation adscope, ni l'inverse : la confusion détruirait
la confiance dans l'outil.

Cas de republication :

```
⚠ Republiée le 12 août — en ligne depuis 74 j en réalité
```

### Cas vide

C'est le cas majoritaire au démarrage et il conditionne la perception du produit.
Il est traité par l'ancienneté lue sur la page : **dès la première visite, sans aucune
donnée en base, l'encart affiche une information exacte et utile.**

Pour l'historique de prix, le libellé est « Prix stable depuis X j » plutôt que
« aucun changement » : même donnée, mais c'en est réellement une pour un marchand.

### Pastille sur les cartes de résultats

Discrète, sur chaque carte : ancienneté suivie et marqueur de baisse de prix.

**Limitation assumée** : l'ancienneté site n'est présente que sur la fiche, pas sur les
cartes. Une annonce jamais ouverte n'a donc pas de `sp` et sa pastille ne montre que
l'observation adscope, vide au premier jour. La valeur du premier jour est portée par
la fiche.

## 9. Navigation SPA

La Centrale est une application Next.js : passer d'une annonce à l'autre ne recharge
pas la page et ne redéclenche pas le content script. C'est la première source de
défauts sur ce type d'extension et le sujet est traité dès le départ.

`spa.js` instrumente `history.pushState` et `history.replaceState`, écoute `popstate`,
et retient un `MutationObserver` en repli. À chaque changement d'URL, l'encart existant
est retiré puis réinjecté. Le nœud injecté porte un attribut dédié, ce qui rend la
détection de doublon triviale.

## 10. Popup

Environ soixante lignes : nombre d'annonces suivies, date de début du suivi, compteur
d'échecs d'extraction, export JSON, purge manuelle.

L'export transforme la promesse « 100 % local » en quelque chose que l'utilisateur
vérifie de ses yeux, et constitue un argument RGPD gratuit.

## 11. Chrome Web Store

**But unique**, à reprendre tel quel dans le formulaire :

> Afficher l'historique local d'observation des annonces automobiles consultées par
> l'utilisateur.

Tout ce qui n'entre pas dans cette phrase est hors périmètre V1.

**Manifeste minimal** :

```json
"permissions": ["storage"],
"host_permissions": ["https://www.lacentrale.fr/*"]
```

Ni `tabs`, ni `activeTab`, ni `unlimitedStorage`, ni `alarms`, ni
`web_accessible_resources`, ni CSP personnalisée, ni service worker.

**Confidentialité** : Google range l'historique de navigation parmi les données
utilisateur, et l'extension enregistre bien quelles annonces ont été consultées. La
formulation exacte et défendable est donc : *aucune donnée collectée ni transmise*, le
traitement étant strictement local. Une politique de confidentialité doit malgré tout
être publiée à une URL accessible ; son absence allonge la review.

**Autres points à préparer avant dépôt** :

- Mention explicite de non-affiliation à La Centrale dans la description.
- Captures 1280×800 : l'encart doit être présentable dès le PoC.
- Pas de bundler ni de minification. Modules ES lisibles, le reviewer lit la source.
- Vérifier la disponibilité du nom « adscope », générique et susceptible d'entrer en
  conflit avec une marque existante.

**Pas d'imports ES entre content scripts** : MV3 ne les prend pas en charge sans passer
par `web_accessible_resources`, ce qui ajoute de la surface de review sans contrepartie.
Les fichiers sont déclarés dans l'ordre dans `js: [...]`, partagent le même scope et
publient chacun dans un unique espace de noms `ADS`.

## 12. Arborescence

```
adscope/
├── extension/                    ← seul contenu du ZIP Store
│   ├── manifest.json
│   ├── src/
│   │   ├── sites/lacentrale.js   ~70   tous les sélecteurs
│   │   ├── extract.js            ~60   cascade d'extraction
│   │   ├── fingerprint.js        ~25   empreinte
│   │   ├── store.js              ~80   get / record / purge / export
│   │   ├── format.js             ~30   durées, montants, deltas
│   │   ├── spa.js                ~30   changements d'URL
│   │   ├── detail.js             ~70   encart de la fiche
│   │   ├── listing.js            ~60   pastilles des cartes
│   │   └── ui.css                ~80
│   ├── popup/{popup.html,popup.js}
│   └── icons/
├── crawler/                      ← Python, cycle séparé
├── shared/
│   ├── fingerprint.md
│   └── fingerprint-vectors.json  ← asserté par les tests JS et Python
├── docs/superpowers/specs/
├── scripts/package-extension.sh  ← zippe le contenu de extension/
└── README.md
```

Aucun fichier au-dessus de 150 lignes. Aucune étape de build pour l'extension, qui
reste chargeable en « extension non empaquetée » pendant le développement.

`manifest.json` devant se trouver à la racine du ZIP, le script d'empaquetage archive
le *contenu* de `extension/`, et non le dossier lui-même.

## 13. Hors périmètre V1

- Le crawler backend et toute API. Projet distinct, cycle de conception propre.
- L'exploitation de l'empreinte pour fusionner les historiques. Elle est calculée et
  stockée, rien de plus.
- leboncoin. Son payload `__NEXT_DATA__`, contrairement à celui de La Centrale, expose
  l'annonce en JSON structuré ; c'est le candidat naturel pour le second site.
- Toute requête réseau émise par l'extension.

## 14. Décision d'exploitation à noter

Le crawler backend est acté comme projet parallèle, décidé en connaissance des risques
exposés : en opérant depuis une infrastructure identifiable, l'exploitant devient
l'acteur désigné, et l'exposition au titre de l'extraction substantielle de base de
données se concentre sur lui plutôt que de se diluer dans le trafic des utilisateurs.
Le dépôt est maintenu privé.

L'extension V1 ne lit pas ce backend. Le jour où elle le fera, la déclaration Store,
le but unique et les `host_permissions` devront être repris.
