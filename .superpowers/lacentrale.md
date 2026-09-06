# La Centrale, second site de l'extension

Branche `feat/api`, partie de `dbf8384`. Deux fichiers ajoutés, **aucun code partagé
modifié** : `extension/src/sites/lacentrale.js` (150 lignes) et
`extension/tests/lacentrale.test.mjs` (11 tests).

## Ce que la page transporte, et où

Relevé sur les deux fiches et la page de résultats sauvegardées à la racine.

| | fiche | résultats |
|---|---|---|
| porteur | `var CLASSIFIED_MORE_INFOS = {…}` | `window.__PRELOADED_STATE_LISTING__ = {…}` |
| date exacte | `data.financing.combined.creationDate` | `search.hits[].item.firstOnlineDate` |
| référence | `classifiedReference` | `reference` |
| vendeur | `customerType`, `SellerInformationData.account.publishedName` | `customerType`, `contacts.nomPublie`, `contacts.siret` |
| véhicule | JSON-LD `Car` + `data.vehicle.label` (la version) | `item.vehicle` |
| réactualisation | rien | `lastUpdate` (epoch en secondes) |

Deux choses n'étaient pas dans le relevé et changent la lecture du site :

1. **Ces charges ne sont pas dans l'arbre de `__NEXT_DATA__`.** Elles voyagent dans des
   scripts en ligne, en affectations JavaScript ; `__NEXT_DATA__` n'en porte qu'une copie
   échappée, à l'intérieur de chaînes. L'extracteur lit donc le texte des scripts et
   découpe l'objet qui suit le `=` en comptant les accolades hors chaîne.
2. **Les deux surfaces ne se confondent jamais** : une fiche porte `creationDate` et zéro
   `firstOnlineDate`, une page de résultats l'inverse. Une seule lecture suffit pour les
   deux — `fromDocument` rend la fiche si la page en porte une, les cartes sinon.

## Décisions qui engagent

- **`sellerId` = `customerReference`, pas le siret.** Le siret n'existe que sur les cartes ;
  la fiche n'a que `customerReference` (`C045122`), présent des deux côtés. Prendre le siret
  donnerait deux identités au même marchand selon la page lue, et casserait l'agrégation par
  vendeur de l'API. Le siret ne sort donc jamais de la page — exactement le sort réservé au
  `siren` de leboncoin. Un test vérifie qu'il n'apparaît nulle part dans la sortie.
- **L'identité n'est retenue que pour `PRO`.** La fiche plafonnée du relevé est celle d'un
  particulier : elle porte `contacts.lastname: "F"`, jamais transmis.
- **L'URL se déduit de la référence** : le site remplace la lettre de tête par son code
  ASCII (`W103538172` → `87103538172`). Vérifié sur les 23 annonces de la page de
  résultats, 23 sur 23 — aucun lien du DOM n'est nécessaire.
- **`bumpedAt` sur une fiche vaut `null`.** Rien n'y correspond à `lastUpdate` ; on
  n'invente pas. Sur une carte, l'écart doit dépasser un jour pour valoir réactualisation,
  et le libellé décrit le fait sans en nommer la cause.
- **`capped`, un signal en propre.** Au-delà de 60 jours le libellé du site est faux par
  omission : l'écart suffit à l'alerte, sans réactualisation. En deçà du plafond, l'alerte
  reste celle de leboncoin — ancienne, et encore poussée. Les trois autres bornes (1 j,
  31 j, 14 j) sont reprises telles quelles : elles ont été mesurées sur leboncoin, pas ici.
- **`claim(signals, libellé)`** rend le modèle que le panneau de leboncoin attend déjà :
  `La Centrale affiche « Publiée il y a 60 jours » — compteur plafonné à 60 jours`. Il ne
  se déclenche que passé le plafond : sous 60 jours le site dit vrai, il n'y a rien à
  opposer.
- **Les sélecteurs ne touchent aucune classe.** `displayed()` cherche un nœud feuille dont
  le texte commence par « Publiée il y a » ; un test relit le fichier source et échoue s'il
  contient `__SLIVb` ou `__0sGLk`.

## Vérifié hors ligne sur les pages réelles

Les tests tournent contre les fixtures, sans réseau. En plus, l'extracteur a été passé sur
les trois pages sauvegardées (script jetable, non commité) :

- fiche non plafonnée → `publishedAt` 2026-08-14, **23 jours**, libellé « Publiée il y a
  23 jours », `claim` nul ;
- fiche plafonnée → `publishedAt` 2021-09-22, **1 810 jours** là où la page dit 60,
  `claim` posé, vendeur particulier sans identité ;
- résultats → **29 annonces** (23 résultats + la mise en avant + 6 similaires, dédoublonnées),
  anciennetés de 5 à 325 jours, **12 au-delà du plafond**, aucun siret dans la sortie.

Le relevé annonçait 23 cartes : ce sont les seuls résultats proprement dits. Les sept autres
sont les annonces du bloc mis en avant, que la page transporte aussi ; elles sont rendues
parce qu'elles sont réellement sur la page, et les pastilles ne se posent que là où une carte
existe.

Coût de lecture : 3 à 7 ms par page, dont un blob de 122 Ko.

## Tests

`extension/tests/lacentrale.test.mjs`, 11 tests. Écrits avant le code : premier passage rouge
sur le module absent, puis rouge test par test contre un squelette aux fonctions vides. La
ligne de production qui fait rougir chacun :

| test | ligne |
|---|---|
| fiche non plafonnée → 23 j | `publishedAt: date(c.creationDate)` (95) |
| fiche plafonnée → 1 810 j, jamais 60 | même ligne + `const capped = online > CAP_DAYS` (136) |
| contradiction nommée | `const claim = …` (145) |
| libellé lu par le texte | `PUBLISHED` (118) et `displayed` (119) |
| 23 cartes, dates exactes | `publishedAt: date(c.firstOnlineDate)` (81) |
| `lastUpdate` / fiche sans remontée | `bumpedAt:` (84) et (97) |
| type de vendeur | `const type = …` (55) |
| identité du professionnel | branche `PRO` de `seller` (69) |
| aucune identité de particulier, aucun siret | branche par défaut de `seller` (69) |
| véhicule, prix, URL | champs de `card`/`detail` et `url:` (61) |
| page étrangère → rien | `isDetail` / `isCard` (51-52) |

Le dernier test passe déjà contre le squelette vide : c'est une garde, pas une exigence
nouvelle — elle interdit qu'un élargissement futur des prédicats attrape une charge
leboncoin.

Suites complètes : `node --test tests/*.test.mjs` → **200 verts** (189 + 11) ;
`./.venv/bin/pytest tests/ -q` → **149 verts**. L'API n'a rien demandé : `site` y est une
colonne de 8 caractères, `lc` y entre sans changement.

## Ce que ce lot n'a pas fait, et qui reste à faire

Le module est complet et testé, mais **il n'est branché nulle part** : le `manifest.json`
n'a pas été touché. L'ajouter seul planterait la page — `src/listing.js:2` et
`src/detail.js:2` font `const { signals } = ADS.leboncoin`, qui n'existe pas sur
lacentrale.fr.

L'isolation par site tient pour l'extraction ; **elle ne tient pas pour la lecture**. Sept
points du code partagé nomment leboncoin en dur :

| fichier | ce qui est figé |
|---|---|
| `src/listing.js:2`, `src/detail.js:2` | `ADS.leboncoin.signals` |
| `src/feed.js:16,42,48` | `ADS.leboncoin.fromPayload` / `fromDocument` |
| `src/sync.js:59,62` | `site: 'lbc'` dans les deux messages, au lieu de `listing.site` |
| `src/view.js:65` | le libellé « leboncoin affiche » et sa note |
| `src/detail.js:6` | la forme du libellé de date (« il y a 3 jours à 15:36 ») |
| `src/detail.js` (`urlId`) | l'identifiant d'annonce lu comme `\d{6,}` — une référence La Centrale est `W103538172` |
| `manifest.json:18,21,34` | les `matches` et la liste des scripts |

Le branchement demande donc un résolveur de site partagé (`ADS.site`, choisi sur le
domaine) et le remplacement de ces sept ancrages. Le module expose déjà les fonctions qui
lui correspondent — `fromDocument`, `fromScripts`, `signals`, `claim`, `displayed` — pour
que ce lot-là n'ait rien à réécrire ici.

## Réserves

- **Un seul échantillon plafonné**, comme le disait le relevé. `creationDate` a été
  confirmé sur les deux fiches disponibles ; rien ne garantit qu'il soit présent sur
  toutes. Sans lui, la fiche ne rend rien plutôt qu'un chiffre faux.
- Les squelettes de page des tests reproduisent la forme des pages sauvegardées ; ils sont
  écrits dans le test, pas extraits. Les valeurs, elles, viennent des fixtures fournies.
- `displayed()` n'a été éprouvé que sur les deux fiches sauvegardées. Le libellé y est un
  nœud feuille ; si le site l'entoure un jour d'un `<b>`, la lecture le manquera — sans
  conséquence sur l'ancienneté, qui ne dépend pas du DOM.
