# Correctifs résiduels

Deux défauts relevés en revue sur la branche `feat/api`, corrigés en deux commits
thématiques, test d'abord.

Base : `6d185c2` · commits : `4e8bbb6`, `065a3e7`
Suite : 44 tests, tous verts (`cd extension && node --test tests/*.test.mjs`).

## 1. Panneau figé en navigation monopage — `extension/src/detail.js`

**Le défaut.** L'estampille qui évite de refaire le travail lourd à chaque lot de
mutations se comparait au siteId gravé dans le panneau déjà posé :

```js
if (el && el.getAttribute(SRC) === stampOf(el.getAttribute(MARK))) return
```

Le panneau se comparait donc à lui-même. Sur leboncoin, qui est une application
monopage, le passage d'une fiche à la suivante laisse le panneau en place : sa propre
estampille correspondait toujours, le rendu était court-circuité, et le lecteur voyait
l'ancienneté du véhicule qu'il venait de quitter sur la fiche de celui qu'il regardait —
une donnée fausse avec l'aplomb d'une donnée vraie.

**Le correctif.** L'annonce lue se lit dans l'URL, pas dans le panneau :

```js
const readId = (el) => (location.pathname.match(/\d{6,}/) || [])[0] || el.getAttribute(MARK)
```

Le court-circuit exige désormais deux accords — même annonce *et* même origine de
données — et le marquage du panneau est réécrit à chaque rendu (le `setAttribute(MARK)`
est sorti du bloc de création). Le gain de coût est intact : le test existant vérifie
toujours qu'aucune relecture du JSON ni balayage du DOM n'a lieu sur 20 lots de
mutations.

La bascule sur le marquage du panneau (`|| el.getAttribute(MARK)`) couvre les pages sans
identifiant dans l'URL — les résultats de recherche, où le panneau existe aussi.

**Le test** — `extension/tests/dom.test.mjs`, « la fiche suivante chasse la précédente en
navigation monopage ». Le monde de test gagne `visit(ad)`, qui change l'URL et la charge
`__NEXT_DATA__` sans toucher au DOM posé, exactement ce que fait une navigation monopage.
Deux annonces successives, un vendeur professionnel puis un particulier. Sans le
correctif il échoue sur le marquage resté à `3254194817`.

## 2. Popup figée sur un corps JSON primitif — `extension/popup/config.js`

**Le défaut.** `!body || !('label' in body)` supposait un objet. Une réponse 200 dont le
corps est `"ok"`, `5` ou `true` est du JSON valide : `res.json()` résout, et `in` lève
`TypeError: Cannot use 'in' operator to search for 'label' in ok`. Rien ne l'interceptait
jusqu'à `popup.js`, la popup restait sur « Test en cours… » indéfiniment — soit
précisément les réponses d'un proxy, d'un portail captif ou d'un serveur mal réglé, les
situations que le bouton « Tester » existe pour diagnostiquer.

**Le correctif.** `if (!body || typeof body !== 'object' || !('label' in body))` : le
verdict rendu est `unreachable`, celui qui accuse l'adresse et non la licence.

**Les tests** — `extension/tests/config.test.mjs`, un test par forme de corps primitif
(`"ok"`, `5`, `true`). Chacun échouait avec le `TypeError` attendu avant le correctif.

## Réserve

Sur une fiche, `fromDocument` rend la première annonce trouvée dans `__NEXT_DATA__`. Si
la charge d'une fiche portait d'abord un tableau d'annonces similaires, l'annonce lue ne
serait pas celle de l'URL : le panneau se rendrait alors à chaque lot de mutations (perte
du gain de coût, pas d'affichage faux — le marquage dirait l'annonce effectivement
décrite). Aucune donnée de fiche n'est présente dans les fixtures pour trancher ; le cas
échéant, `listings.find((l) => l.siteId === id)` réglerait à la fois le choix de
l'annonce et le coût.
