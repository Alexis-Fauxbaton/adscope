# Lot C — la page de résultats : flèche de baisse, tri et filtre par ancienneté

Branche `feat/api`, à partir de `3db236b` (le formateur d'âge venait d'être corrigé). Rien
n'a été poussé. `crawler/`, `scripts/`, `docs/` et les `.html` de la racine n'ont pas été
touchés — les pages sauvegardées ont seulement été **lues**, et c'est d'elles que sortent les
prises du registre.

Tests : **359 verts** côté extension (346 avant le lot, +13), **250 verts** côté API,
inchangés. Chaque test ajouté nomme la ligne de production qui le fait rougir, et chacune a
été cassée pour le vérifier — la liste est à la fin.

## 1. La flèche de baisse sur la carte

`src/view.js` gagne `fall(r)` : `↓ 1 200 €`, montant absolu, rien d'autre.

    const fall = (r) => (r && r.price_delta_since_first < 0 ? `↓ ${money(r.price_delta_since_first)}` : null)

C'est ce fragment que `badge()` rend désormais en second nœud de la pastille, à la place du
`▼ −800 € en 12 j` qu'elle portait. Le délai et le signe restent au panneau (`drop`,
`tracking`) : **une chose par carte**. Chiffres tabulaires posés sur
`.adscope-badge-tracked`, pour que les montants s'alignent d'une carte à l'autre.

**Une régression corrigée au passage.** `src/listing.js` calculait le poids visuel avec
`s.notable || tracked` : une simple baisse de prix peignait toute la pastille en orangé. Or
l'orangé n'existe que pour ce que le site cache, et une baisse est au contraire ce qu'adscope
a mesuré — elle a son filet indigo, elle n'a pas de couleur d'alerte. Le `|| tracked` est
retiré.

## 2. La barre de tête — `src/sort.js` (99 lignes) et `src/order.js` (69)

    adscope   [Trier par ancienneté]  [≥ 30 j]  [≥ 90 j]      sur les 23 annonces de cette page

- **Trier par ancienneté** réordonne les cartes déjà chargées, plus anciennes d'abord ;
  second clic, l'ordre du site revient. `sort` est stable : à âge égal, le rang du site tient.
- **≥ 30 j** / **≥ 90 j** masquent les autres cartes (`[data-adscope-hidden]`, `display:none`),
  réversible ; le second seuil remplace le premier, il ne s'y ajoute pas. Masquer, jamais
  retirer — une carte sortie du document perdrait sa pastille et son rang.
- **Le périmètre est écrit** : « sur les N annonces de cette page ». Le site en annonce
  9 541 au-dessus des vingt-trois cartes relevées ; le nombre de la barre ne doit jamais
  passer pour celui-là. Aucune requête n'est émise — ni page suivante, ni API.
- **Une annonce sans date** n'a pas d'ancienneté à faire valoir : elle ne prend pas la tête du
  tri et ne passe aucun seuil. Ni tête de liste par défaut, ni bénéfice du doute.

**L'âge vient de la pastille.** `listing.js` écrit `data-adscope-days` sur la pastille qu'il
vient de poser ; `order.read()` le relit. Aucun second calcul, et une annonce sans date ne
porte pas l'attribut plutôt que d'en porter un faux.

**Le lazy-load.** `listing.js` appelle `ADS.sort.sync()` à la fin de chaque rendu — donc sur
l'observateur déjà en place. Une carte arrivée après un tri reprend son rang d'ancienneté ;
l'ordre du site, lui, la garde au bout, là où le défilement l'a mise.

**Les emplacements, pas la liste.** `order.arrange()` pose un repère à chaque emplacement de
carte, y replace les cartes dans l'ordre voulu, retire les repères. Ce qui partage le
conteneur sans être une carte ne bouge donc pas d'un rang — et il y en a : la page relevée
porte **trois `appNexusPlaceholder` et un encart `searchCard--propulse`** entre ses vingt-huit
enfants. Un test les tient.

## 3. Le conteneur, déclaré par site

Le registre (`src/sites.js`) déduit le conteneur de ce que le site déclare de ses cartes :
`cards` est la prise sur une carte, `wrap` le bloc qui l'entoure quand la prise est posée
dedans ; leur parent commun est le conteneur. Aucun site n'a de conteneur à nommer, et rien
ne s'ancre sur une classe d'empaquetage.

| site | `cards` | `wrap` |
|---|---|---|
| La Centrale | `a[data-testid="vehicleCardV2"]` | `[data-tracking-meta]` |
| leboncoin | `article` | — |

**Vérifié sur la page sauvegardée à la racine** (`Voiture occasion - La Centrale.html`, parsée
hors dépôt) : la première carte remonte à `div.searchCard` puis à `div.searchCardContainer`,
qui porte 28 enfants — 24 cartes d'annonce (23 distinctes, la mise en avant `boostVo`
reparaissant plus bas) et 4 emplacements publicitaires. `data-testid="vehicleCardV2"` y
apparaît 24 fois, exactement sur les cartes. La classe `searchCardContainer` aurait aussi
tenu, mais `lacentrale.test.mjs` interdit — à raison — de nommer un nœud par une classe dans
ce module.

Le double de test (`tests/lc-page.mjs`) reproduit maintenant cette structure, encart
publicitaire compris. Côté leboncoin, `tests/world.mjs` monte les `article` dans un conteneur
commun et accepte plusieurs cartes.

## Ce que le lot a dû corriger ailleurs

- `tests/stage.mjs` : le DOM de fabrique ne déplaçait pas les nœuds — `insertBefore` et
  `append` les dupliquaient. Un test de tri n'y aurait rien dit. Ajout de `detach`, de
  `removeChild` et de `removeAttribute`.
- Les quatre tests qui citaient `▼ −800` sur la pastille citent `↓ 800`.

## Preuve par la casse

| Test | Ligne cassée |
|---|---|
| la barre dit sur quoi elle travaille | `scope` (sort.js) · `cards` et `wrap` (lacentrale.js) |
| le tri range les plus anciennes d'abord | `oldest` (order.js) · l'écriture de `data-adscope-days` (listing.js) |
| l'encart garde son rang quand on trie | les repères d'`arrange` (order.js) |
| le filtre masque puis rétablit | `sift` (order.js) |
| la carte sans date ne passe aucun seuil | `oldest` et `sift`, sur le traitement de l'absence |
| une carte arrivée après le tri se place à son rang | `ADS.sort.sync()` (listing.js) |
| le tri lit l'ancienneté sur la pastille | la lecture de `data-adscope-days` dans `read` (order.js) |
| trier et filtrer ne demandent rien | une requête ajoutée dans `sync` |
| sur la fixture leboncoin | `cards: 'article'` (leboncoin.js) · `list` (sites.js) |
| aucune barre sur une fiche | le garde `ADS.diag.urlId` (sort.js) |
| la flèche de baisse ne met pas la carte en alerte | `weight` (listing.js) |
| sans baisse, la carte ne porte que ce que la page dit | la condition `< 0` de `fall` (view.js) |
| sans baisse, la carte ne porte aucune flèche | la condition `< 0` de `fall` (view.js) |

**Correction du 18/09, refusée en revue.** Deux des treize tests ci-dessus — « la flèche de
baisse ne met pas la carte en alerte » et « sans baisse, la carte ne porte que ce que la page
dit », tous deux dans `dom.test.mjs` — n'étaient **pas** injectés par `at(RELEVE, …)`, malgré
ce que ce paragraphe affirmait : ils appelaient `world()` puis `listing.js` en lisant
l'horloge réelle. Au jour où ce lot a été fermé, l'annonce qu'ils utilisent affichait 28 jours
en ligne — à trois jours du seuil de 31 qui bascule `old`, et avec lui `notable` : l'horloge
réelle avançant d'elle-même, ces trois jours se seraient refermés sans qu'aucune ligne de
production ne change. Les deux tests sont maintenant enveloppés dans `at(RELEVE, …)` comme
leurs voisins.

La casse a aussi trouvé trois tests que ce lot n'avait pas touchés, dans
`tests/lacentrale-dom.test.mjs` : « sur une page de résultats, chaque carte porte son
ancienneté réelle », « la carte qui dépasse le plafond du site est mise en alerte, pas les
autres » et « sous le plafond, aucune contradiction n'est inventée » lisaient aussi l'horloge
réelle. Mêmes symptômes, même remède : gelés sur `RELEVE`. Les cinq corrections sont vérifiées
en faisant tourner la suite entière avec l'horloge système décalée d'un an — 359 verts, comme
à l'horloge réelle.

Sur les treize tests ajoutés par ce lot, les dix de `sort.test.mjs` et celui de
`view.test.mjs` lisaient bien l'instant par `at(RELEVE, …)` ou une constante figée dès leur
écriture ; les âges triés sont ceux du 6 septembre 2026, jour du relevé des deux pages.

## Réserves

- ~~**La mise en avant fait doublon.**~~ **Corrigé le 18/09.** `site.card()` (`cardOf` dans
  `src/sites/lacentrale.js`, `card` dans `src/sites/leboncoin.js`) rend désormais **toutes**
  les cartes d'une annonce, dédoublonnées par nœud, jamais la seule première trouvée ;
  `src/listing.js` pastille chacune. Sur `W103496285`, le bandeau `boostVo` et sa carte
  ordinaire portent maintenant la même pastille, le même âge, et le filtre les masque
  ensemble. Preuve par la casse : `tests/lacentrale-dom.test.mjs` (« la bannière et la carte
  ordinaire de la même annonce portent la même pastille »), `tests/sort.test.mjs` (« le tri
  garde adjacentes… », « le filtre masque les deux cartes… ») et `tests/dom.test.mjs` (« sur
  leboncoin, une carte sans doublon ne porte qu'une pastille », qui vérifie que ce site, sans
  doublon, n'y perd rien).
- **Le gabarit leboncoin n'est toujours pas vérifié sur pièce.** `cards: 'article'` vient de
  ce que `card()` savait déjà de ce site, pas d'une page sauvegardée — il n'y en a aucune à la
  racine. La fixture le couvre, le vrai gabarit reste à voir.
- Le tri et le filtre ne portent que sur ce que la page a chargé : c'est la règle posée, mais
  sur une recherche à 9 541 résultats, vingt-trois cartes triées ne disent rien du stock. Ce
  que le marchand veut in fine — « les plus anciennes du périmètre » — est une vue serveur,
  pas une barre dans la page.
