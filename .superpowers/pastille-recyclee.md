# La pastille recyclée

Base : `feat/api`, SHA de départ `e2e1450`.

## Le défaut

Dans `extension/src/listing.js`, `paint` sortait par un court-circuit qui ne
comparait que l'origine des données :

```js
if (el && el.getAttribute(SRC) === stamp) return false
```

et le marquage `data-adscope` n'était écrit qu'à la création du nœud. Les deux
sites retrouvent une carte par l'identifiant dans son lien ; quand une
application monopage réattribue un nœud de carte à une autre annonce —
pagination, filtre, liste virtualisée — la carte retrouvée est la bonne mais
porte encore la pastille de l'annonce précédente. Les deux estampilles valant
`'page'`, rien ne se réécrivait.

## La reproduction, échouée d'abord

`tests/dom.test.mjs`, « la carte recyclée pour une autre annonce porte la
pastille de celle-ci » : la carte est rendue pour l'annonce `3254194817`, puis
le même élément du DOM voit son lien passer à `3263931610`, et un lot de
mutations rejoue le rendu. Le harnais a reçu pour cela `recycle(id)` dans
`tests/world.mjs` — le lien change, l'élément reste.

Sur le code fautif, au 6 septembre 2026 :

- attendu (la pastille de `3263931610`, en ligne depuis la veille) :
  `moins d'un jour en ligne`, classe `adscope-badge--private` ;
- obtenu : `16 j en ligne · ⟳ réactualisée il y a 3 j`, marquage resté
  `data-adscope="3254194817"`.

L'assertion tombait sur le marquage : `+ '3254194817' / - '3263931610'`. La
suite de 285 tests ne voyait pas cette condition.

## Le correctif

La logique déjà retenue dans `extension/src/detail.js` : l'identité entre dans
la comparaison, et le marquage est réécrit à chaque rendu, hors du bloc de
création.

```js
if (el && el.getAttribute(MARK) === listing.siteId && el.getAttribute(SRC) === stamp) return false
...
el.setAttribute(MARK, listing.siteId)
```

Le gain de coût est conservé : une carte dont la pastille porte déjà la bonne
annonce et la bonne origine sort toujours sans être repeinte. Un second test le
garde — « la pastille déjà juste n'est pas refaite à chaque lot de mutations » :
après vingt lots, les nœuds posés dans la pastille sont les mêmes objets. Retirer
le court-circuit le fait échouer, la garde n'est donc pas décorative.

## Ailleurs

Le motif ne traîne nulle part ailleurs : les seules lectures de marquage du code
d'extension sont les deux lignes de `listing.js` et de `detail.js`, et les deux
vérifient désormais l'identité avant l'estampille. Le court-circuit voisin de
`feed.js` signe la charge de la page par la longueur de ses scripts : il ne
décide d'aucune identité d'annonce, il évite seulement une extraction, et sa
portée est le document.

## Vérification

- `extension` : 287 tests verts (285 d'avant, plus les deux ajoutés).
- `api` : 149 tests verts.
