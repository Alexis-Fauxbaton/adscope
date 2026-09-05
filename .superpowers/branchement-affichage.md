# Branchement de l'affichage sur l'API

## 1. « Remontée » → « Réactualisée »

`index_date` bouge autant pour une remontée payante que pour une correction de texte.
Le mot « remontée » affirmait une cause que la donnée ne porte pas. Tous les libellés
visibles disent désormais « réactualisée » : pastille (`⟳ réactualisée il y a 2 j`),
ligne du panneau (`Réactualisée`), mention sous la citation du site. Les commentaires
de `leboncoin.js` et les intitulés de tests suivent. L'identifiant de code `bumped`
reste inchangé — il nomme un écart entre deux dates, pas une opération commerciale.

## 2. Deux modules nouveaux

`src/view.js` compose les libellés à partir de deux origines qui ne se mélangent jamais :
`s`, les signaux calculés sur la page ouverte, et `r`, ceux du suivi mutualisé.
Il ne touche pas au DOM, ce qui le rend testable sous node. `panel()` rend un modèle
`{page, claim, tracked}` que `detail.js` transforme en nœuds.

`src/sync.js` porte l'aller-retour. Une seule émission par page (`sent`), quel que soit
le nombre de rendus rejoués par le MutationObserver, et quel que soit le module appelant :
`listing.js` et `detail.js` appellent tous deux `ADS.sync.send`, le second est sans effet.
Les abonnés (`onSignals`) sont rappelés à la réponse ; un abonné tardif reçoit ce qui est
déjà arrivé.

## 3. Rien n'attend le réseau

Le rendu local est inchangé dans son déroulé : pastilles et panneau sont posés avec la
seule page, immédiatement. `send()` est appelé après. À la réponse, chaque nœud est
réécrit sur place — pas de suppression puis réinsertion, donc pas de saut.

Une estampille `data-adscope-src` vaut `page` ou `sync` sur chaque nœud posé. Elle sert
deux fois : elle autorise la réécriture unique à l'arrivée des signaux, et elle évite que
le MutationObserver ne boucle, puisqu'un rendu qui ne change rien n'écrit rien.

Dégradation : `{ok:false}` — pas de licence, API injoignable, erreur — laisse l'affichage
exactement dans son état local. `chrome.runtime.lastError` est lu, sinon Chrome le
rapporte dans la console de la page ; l'appel est enveloppé pour le cas du contexte
d'extension invalidé pendant une navigation.

## 4. Ce que les signaux ajoutent

- **Baisse de prix** : `price_delta_since_first` négatif → `▼ −800 € en 12 j`, sur la
  pastille et sur le panneau. Une hausse ou un delta nul ne produit rien.
- **Suivi mutualisé** : `Suivie depuis 12 j · 3 vues`, et à défaut de baisse
  `Prix stable depuis 5 j` — une donnée pour un marchand, pas un « aucun changement ».
- **La contradiction, nommée** : quand l'annonce a été réactualisée et que la date
  affichée par le site a été lue dans la page, le panneau ajoute
  `leboncoin affiche « aujourd'hui à 21:14 »` suivi de
  `date de réactualisation, pas de publication`. C'est l'argument du produit, écrit en
  toutes lettres. Sans réactualisation ou sans date lue, la ligne n'apparaît pas : rien
  n'est inventé.

**Séparation des origines** : le panneau est découpé en deux sections légendées, `LU SUR
LA PAGE` et `SUIVI ADSCOPE`, et les lignes du suivi portent un filet de couleur. La
citation du site est encadrée en pointillés, à part des deux. La pastille suit la même
règle : `view.badge` rend deux fragments (`{page, tracked}`) que `paint` pose dans deux
`span` distincts, celui du suivi portant `.adscope-badge-tracked` et le même filet indigo
que le panneau. Aucune donnée du site n'est présentée comme une observation adscope, ni
l'inverse.

## 5. Coût du rendu sous l'observateur

L'observateur est branché sur `document.body` en `subtree` d'une SPA qui mute sans arrêt.
`render()` commence donc par la comparaison d'estampille, avant toute extraction : le
panneau déjà posé porte le `siteId` dans son attribut de marquage, ce qui suffit à décider
sans rouvrir `__NEXT_DATA__` (100 à 300 Ko de JSON à parser) ni rebalayer le document à la
recherche de la date affichée. Un lot de mutations qui ne change rien ne coûte plus qu'un
`querySelector` et une lecture d'attribut. Le travail lourd n'a lieu que deux fois par
consultation : au premier rendu, puis à l'arrivée des signaux.

## 6. Tests — 33 au total (13 conservés, 20 ajoutés)

`tests/view.test.mjs` (11) : fusion des signaux sur les fixtures d'annonces plus une
fixture `signals-batch.json` calquée sur `SignalsOut`. Couvre la baisse, le prix stable,
la contradiction présente et absente, la séparation des deux sections, et le rendu
identique avec `null` ou `undefined` en guise de signaux.

`tests/sync.test.mjs` (7) : émission unique malgré les rendus répétés, page sans annonce,
transmission aux abonnés, abonné tardif, et les trois dégradations — `{ok:false, no-key}`,
`lastError` avec réponse vide, exception à l'émission. Un faux `chrome` sert de service
worker, le module est rechargé à chaque test.

`tests/dom.test.mjs` (2) : un DOM minimal — une centaine de lignes, sans dépendance —
rejoue les deux content scripts. Il vérifie que la fiche n'extrait ni ne balaie plus rien
sur vingt lots de mutations successifs (le test échoue sur la version antérieure du
rendu), et que la pastille pose bien un nœud par origine, la baisse n'apparaissant que
dans celui du suivi.

`node --test tests/*.test.mjs` → 33/33. `pytest` côté API → 61/61, inchangé.

## Ce qui n'est pas fait

- Pas de cache local (`a:lc:<id>`) ni de repli hors ligne : la spec le prévoit, il n'entre
  pas dans ce lot.
- Pas de jsdom ni de `package.json` : la logique d'affichage vit dans `view.js`, couverte
  sans navigateur, et le stub de `dom.test.mjs` ne couvre que les appels que les deux
  content scripts font réellement.
- `detail.js` pose encore son panneau sous le `h1` d'une page de résultats faute de date
  lue — comportement antérieur, non traité ici.
