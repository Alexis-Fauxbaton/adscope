# Robustesse de l'extension : contexte perdu et fiche périmée

Base : `27b283e` · commits : `b480a9d`, `f50f554`
Suite : 91 tests, tous verts (`cd extension && node --test tests/*.test.mjs`), contre 77
au départ.

> La base annoncée était `4505627`. Une session voisine a réécrit ce sommet pendant le
> travail (`92671cf` puis `27b283e`, même message « Passe l'API sous uv… ») ; les deux
> commits sont posés sur `27b283e`, branche `feat/api`, rien n'est poussé. Le dossier
> `crawler/` n'a pas été touché.

## 1. Le content script orphelin — `b480a9d`

**Le défaut.** Une mise à jour poussée par le Store remplace l'extension sans toucher aux
onglets ouverts : les content scripts de l'ancienne version continuent d'y tourner. Leur
`MutationObserver` les rappelle, et le premier appel `chrome.*` lève « Extension context
invalidated » — sans effet visible, mais dans la console de chaque onglet leboncoin de
chaque utilisateur, et dans les rapports d'erreur du Store.

**La forme retenue.** Un module `src/context.js`, chargé en premier, qui expose deux
choses et rien d'autre :

```js
const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id) } catch { return false } }
const lost = (e) => !alive() || /context invalidated/i.test((e && e.message) || '')
```

- **La détection** se lit sur `chrome.runtime.id`, qui disparaît avec le contexte. C'est
  la seule marque lisible sans provoquer l'erreur qu'on veut éviter, et la lire ne coûte
  rien. La lecture est elle-même protégée : `chrome` peut être démonté, et
  `chrome.storage` disparaître avant `chrome.runtime`.
- **La garde `guard(fn)`** couvre les deux bouts de la même panne : l'identifiant déjà
  disparu (l'appel n'est pas tenté), et l'appel qui lève quand même (c'est le cas décrit
  pour `sync.js`, où `lastError` est testé dans le rappel mais où l'envoi lui-même peut
  lever avant). **Toute autre erreur remonte** : la garde absorbe une condition connue,
  pas les défauts du code. C'est ce que verrouille le premier test.
- **L'arrêt** est porté par `observe(fn)`, qui retient l'observateur créé. À la première
  garde déclenchée, tous sont déconnectés, définitivement — rien ne redonne son contexte
  à un script orphelin. Ce qui est déjà affiché reste : le script s'arrête, il n'efface
  rien.

**Où la garde est posée** : les deux rendus (`listing.js`, `detail.js`), l'écriture du
diagnostic (`diag.js`), l'envoi au suivi (`sync.js`, dont le `try/catch` local devient
inutile et disparaît) et l'écoute des charges publiées par le monde MAIN (`feed.js`).
Cette dernière compte : le script de monde MAIN, lui, n'est pas orphelin et continue de
publier ce que le navigateur reçoit — sans garde, un onglet mort se remettrait à peindre
des pastilles à chaque page suivante.

**Les tests** — `tests/context.test.mjs`, cinq tests unitaires sur la garde et quatre
d'intégration dans le monde de fabrique, qui gagne `invalidate()` : plus d'identifiant de
runtime, et tout appel `chrome.*` qui lève. Vérifiés rouges avant le correctif — les
observateurs restaient actifs, le diagnostic levait, la charge reçue était peinte. Le
test du contexte invalidé de `sync.test.mjs` a rejoint ce fichier, où il s'exerce sur le
module réel plutôt que sur un `chrome` de fabrique.

## 2. La fiche lue dans le bloc périmé — `f50f554`

**Le défaut.** `__NEXT_DATA__` n'est écrit qu'au rendu serveur. `detail.js` le lisait
encore : d'une fiche à l'autre sans rechargement, le panneau décrivait l'annonce
précédente. Le correctif de `f37d20e` (choisir l'annonce que l'URL désigne) limitait les
dégâts — le panneau se repliait sur la première annonce du bloc et son marquage restait
en désaccord avec l'URL, donc le rendu se rejouait — mais il ne pouvait jamais se
corriger : la bonne annonce n'arrivait jamais dans le bloc.

**Le filtre d'URL, distingué plutôt qu'ouvert.** `tap.js` publie désormais les deux
charges sous deux noms — `adscope:payload` pour les résultats, `adscope:detail` pour les
fiches :

```js
const kind = (url) => {
  if (url.includes('/finder/search')) return 'payload'
  if (!url.includes('/_next/data/')) return null
  return url.includes('/ad/') ? 'detail' : 'payload'
}
```

Ce qui sépare les deux est le nom de l'événement, pas l'exclusion de la fiche : les
annonces similaires d'une fiche préchargée ne peuvent toujours pas passer pour des
résultats, et un test le verrouille des deux côtés (la prise publie sous le bon nom ; la
liste ne bouge pas quand une charge de fiche arrive).

**Deux flux dans `ADS.feed`, qui ne se traitent pas pareil.**

- Les résultats : la dernière charge chasse la précédente. C'est la page affichée.
- Les fiches : aucune ne chasse l'autre. Next préfetche les fiches liées, donc une charge
  qui arrive n'est pas la fiche lue — c'est l'URL, jamais l'ordre d'arrivée, qui le dit.
  Les garder toutes (`Map` par `siteId`) fait qu'à l'ouverture, la fiche est le plus
  souvent **déjà arrivée** : le panneau est juste au premier rendu, sans attendre.

`details(doc)` rend le bloc de la page d'abord — il fait toujours foi là où l'URL ne
désigne aucune annonce, page de résultats comprise — puis les fiches reçues depuis. Le
choix par l'URL (`pick`) et le court-circuit du rendu ne changent pas ; `detail.js` se
rejoue en plus sur `ADS.feed.onDetail`, comme `listing.js` sur `onData`, la navigation
n'étant pas garantie de produire un lot de mutations qu'on observe.

**Le diagnostic** de la fiche gagne sa source, comme celui des résultats : c'est la ligne
qui, dans la popup, dit à l'œil nu que la fiche lue ne vient plus du bloc figé. La popup
partage désormais la ligne « Source » entre ses deux vues, et « Annonces dans le bloc »
devient « Annonces connues » — le compte ne porte plus seulement le bloc.

**Les tests** — `tests/detail.test.mjs` : le passage d'une fiche à l'autre **sans que
`__NEXT_DATA__` soit réécrit** (le monde gagne `goto(id)`, qui ne change que l'URL, là où
`visit(ad)` réécrivait le bloc et masquait le sujet), et la fiche préchargée qui attend
que l'URL la désigne. `tests/diag.test.mjs` : la source rapportée. Tous rouges avant le
correctif, sur le marquage resté à l'annonce précédente. Les tests du monde MAIN partent
dans `tests/tap.test.mjs` : `feed.test.mjs` frôlait la limite de 150 lignes, et la prise
`window.fetch` n'a rien à voir avec la pagination du monde isolé.

## Ce qui reste ouvert

1. **Rien n'a été observé dans un vrai navigateur.** Que la navigation vers une fiche
   passe bien par un `fetch` de `/_next/data/…/ad/…json` reste à confirmer sur la page.
   Si ce n'était pas le cas, l'extension retomberait sur le comportement d'hier : le
   panneau se replie et se marque en désaccord avec l'URL, la popup le dit — rien de faux
   affiché, mais rien de corrigé.
2. **Les fiches préchargées entrent au suivi.** `detail.js` verse à `ADS.sync` toutes les
   annonces connues, donc aussi celles que Next a préfetchées et que le lecteur n'ouvrira
   pas. C'est cohérent avec `listing.js`, qui pousse tous les résultats de la page, et
   c'est de l'observation gratuite pour le pool ; c'est aussi un peu plus de trafic vers
   l'API que ce que le lecteur regarde.
3. **La réserve de mémoire est minuscule mais réelle** : les fiches reçues sont gardées
   pour la vie de l'onglet, sans purge. Quelques dizaines d'annonces normalisées.
4. **`ADS.context.observe` fige la cible** (`document.body`, `childList` + `subtree`) :
   c'est l'unique usage des deux content scripts, et le seul moyen de garantir qu'aucun
   observateur n'échappe à l'arrêt. Un observateur d'une autre forme demanderait de
   rouvrir la signature.
