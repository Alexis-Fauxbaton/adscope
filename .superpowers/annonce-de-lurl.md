# L'annonce décrite est celle de l'URL

SHA de départ : `e1e7ba3e0ac8a0bcfbf58d6c5139f6728d0d6378` (branche `feat/api`).

## Le défaut

`extension/src/detail.js` prenait la première annonce rendue par
`ADS.leboncoin.fromDocument` (`const [listing] = listings`) sans vérifier qu'elle
était celle de la page ouverte. Le bloc `__NEXT_DATA__` peut en porter plusieurs
— une fiche et ses annonces similaires, une page de résultats et son bandeau. Si
la bonne n'était pas la première, le panneau décrivait un autre véhicule avec le
même aplomb qu'une donnée juste.

## Le correctif

`urlId()` est extrait de `readId` et sert désormais aussi à choisir l'annonce :

    const pick = (listings, id = urlId()) => listings.find((l) => l.siteId === id) || listings[0]

Repli sur la première annonce dans deux cas seulement : l'URL ne porte aucun
identifiant (page de résultats, où `detail.js` pose aussi un panneau), ou elle en
porte un absent du bloc.

### Le cas « aucune annonce ne correspond »

C'est celui d'une navigation monopage prise entre deux états : l'URL est déjà la
nouvelle, le bloc de données porte encore l'ancienne fiche. Trois conduites
possibles : ne rien poser, retirer le panneau, ou se replier sur la première
annonce. Le repli l'emporte parce qu'il est le seul qui se corrige : le panneau
porte le marquage de l'annonce affichée, jamais celui de l'URL, donc l'accord de
la ligne 84 ne peut pas se faire et le rendu est rejoué à chaque lot jusqu'à ce
que la bonne annonce arrive. Retirer le panneau le ferait clignoter à chaque
navigation ; ne rien poser laisserait la fiche nue sur une page de résultats.
Verrouillé par `tests/detail.test.mjs`, qui vérifie les deux temps : le panneau
posé sur le repli, puis le panneau corrigé au lot suivant.

## L'effet de bord sur le coût

Confirmé et mesuré. Avant le correctif, quand la mauvaise annonce était choisie,
le marquage du panneau ne pouvait jamais s'accorder avec l'identifiant lu :
21 lots de mutations donnaient 21 extractions et 21 balayages du DOM. Après, ils
en donnent un seul de chacun. Le test qui l'exprime échoue sur `{extract: 21,
scan: 21}` si l'on remet `const [listing] = listings`.

## Les tests

Le DOM de fabrique de `tests/dom.test.mjs` est extrait dans `tests/world.mjs`,
inchangé sauf deux paramètres — `path` et `data` — qui disent quelle fiche l'URL
désigne et quelles annonces le bloc porte. `dom.test.mjs` tombe à 49 lignes,
`world.mjs` en fait 99, aucun fichier ne dépasse 150 lignes.

`tests/detail.test.mjs` ajoute quatre tests, tous écrits avant le correctif :

1. deux annonces, l'URL désignant la seconde — le panneau la décrit ; échouait
   sur `'3254194817'` au lieu de `'3263931610'` ;
2. URL sans identifiant — la première annonce est décrite (passait déjà, verrouille
   le repli) ;
3. URL portant un identifiant absent du bloc — panneau posé sur le repli, puis
   corrigé ;
4. coût sur plusieurs annonces — échouait sur `{extract: 21, scan: 21}`.

Le test de navigation monopage de `dom.test.mjs` reste vert sans retouche.

Suites : 48 tests d'extension verts (44 avant), 61 tests d'API verts, inchangés.

## Non traité

`ADS.sync.send(listings)` continue d'envoyer toutes les annonces trouvées, y
compris les similaires. C'est le comportement voulu — le suivi se nourrit de tout
ce que la page montre — et il est indépendant du choix du panneau.
