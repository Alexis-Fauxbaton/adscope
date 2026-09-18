import test from 'node:test'
import assert from 'node:assert/strict'
import { CARDS, page, results } from './lc-page.mjs'
import { at } from './stage.mjs'
import { world } from './world.mjs'

// Le jour du relevé des deux pages sauvegardées. Aucune de ces épreuves ne lit
// l'horloge : les âges triés sont ceux que la pastille porte au 6 septembre 2026,
// et une horloge qui avance les ferait tous glisser d'un cran par jour.
const RELEVE = '2026-09-06T18:00:00Z'

const bar = (w) => w.body.querySelector('.adscope-bar')
const keys = (w) => bar(w).descendants.filter((n) => n.tag === 'button')
const press = (w, label) => keys(w).find((b) => b.textContent === label).click()
const refs = (w) => w.order().filter((r) => r !== 'promo')
const daysOf = (w, ref) => Number(w.badge(ref).getAttribute('data-adscope-days'))
const shown = (w) => refs(w).filter((r) => w.badge(r).parentElement.getAttribute('data-adscope-hidden') === null)

const listing = (cards = CARDS) =>
  at(RELEVE, () => {
    const w = page({ path: '/listing', scripts: results(cards), cards: cards.map((c) => c.reference) })
    w.load('listing.js')
    return w
  })

// Le compte affiché est celui de la page chargée, jamais celui de la recherche :
// le site en annonce 9 541 au-dessus de ces vingt-trois cartes. Rouge sur `scope`
// de src/sort.js — lui retirer « de cette page » laisse un nombre sans périmètre —
// et rouge sur `cards` comme sur `wrap` de src/sites/lacentrale.js, sans lesquels
// le registre ne trouve aucun conteneur et la barre ne se pose pas.
test('la barre dit sur quoi elle travaille : les annonces de cette page', () => {
  const w = listing()
  assert.match(bar(w).textContent, /sur les 23 annonces de cette page/)
  assert.deepEqual(keys(w).map((b) => b.textContent), ['Trier par ancienneté', '≥ 30 j', '≥ 90 j'])
})

// Rouge sur `oldest` de src/order.js : trié dans l'autre sens, ou pas trié du
// tout, la première carte n'est plus la plus ancienne et la suite remonte.
test("le tri range les plus anciennes d'abord, le second clic rétablit l'ordre du site", () => {
  const w = listing()
  const site = w.order()
  press(w, 'Trier par ancienneté')
  const ages = refs(w).map((r) => daysOf(w, r))
  assert.equal(ages[0], 216)
  assert.deepEqual(ages, [...ages].sort((a, b) => b - a))
  // Les mêmes cartes, toutes : trier n'en perd ni n'en double aucune.
  assert.deepEqual([...refs(w)].sort(), [...site.filter((r) => r !== 'promo')].sort())
  press(w, 'Trier par ancienneté')
  assert.deepEqual(w.order(), site)
})

// L'encart publicitaire de la page relevée n'est pas une annonce : il n'a pas
// d'âge, et le site est payé pour le rang qu'il occupe. Rouge sur les repères de
// `arrange` (src/order.js) — ranger les cartes à la suite le pousserait au bout.
test("l'encart glissé entre deux annonces garde son rang quand on trie", () => {
  const w = listing()
  assert.equal(w.order()[1], 'promo')
  press(w, 'Trier par ancienneté')
  assert.equal(w.order()[1], 'promo')
})

// Rouge sur `sift` de src/order.js : sans le seuil, tout reste affiché ; sans le
// retrait de l'attribut, le second clic ne rend rien.
test('le filtre masque ce qui est sous le seuil, et le second clic le rétablit', () => {
  const w = listing()
  const all = refs(w)
  press(w, '≥ 30 j')
  const kept = shown(w)
  assert.ok(kept.length && kept.length < all.length)
  for (const r of all) assert.equal(kept.includes(r), daysOf(w, r) >= 30, r)
  // Le second seuil remplace le premier, il ne s'y ajoute pas.
  press(w, '≥ 90 j')
  for (const r of all) assert.equal(shown(w).includes(r), daysOf(w, r) >= 90, r)
  press(w, '≥ 90 j')
  assert.deepEqual(shown(w), all)
})

// Une carte sans date n'a pas d'ancienneté à faire valoir : ni la tête du tri,
// ni le bénéfice du doute sous un seuil. Rouge deux fois dans src/order.js : sur
// l'absence traitée comme un âge très grand dans `oldest`, qui la mettrait en
// tête, et sur `!(days >= floor)` dans `sift`, qu'un « on ne masque pas ce qu'on
// ignore » laisserait passer le filtre.
test("la carte sans date ne passe aucun seuil et ne prend pas la tête", () => {
  const [first, ...rest] = CARDS
  const w = listing([{ ...first, firstOnlineDate: null }, ...rest])
  press(w, 'Trier par ancienneté')
  assert.equal(w.order().at(-1), first.reference)
  press(w, '≥ 30 j')
  assert.ok(!shown(w).includes(first.reference))
})

// Le lazy-load du site : une carte de plus, arrivée après le tri. Elle doit
// prendre son rang d'ancienneté, pas rester au bout où le site l'a posée.
// Rouge sur l'appel `ADS.sort.sync()` de src/listing.js, qui rejoue le tri à
// chaque rendu.
test('une carte arrivée après le tri se place à son rang', () => {
  const w = listing()
  press(w, 'Trier par ancienneté')
  const late = { ...CARDS[0], reference: 'W103000001', firstOnlineDate: '2019-01-01T09:00:00.000Z' }
  at(RELEVE, () => {
    w.lazy(late)
    w.mutate(1)
  })
  assert.equal(w.order()[0], late.reference)
  assert.equal(refs(w).length, 24)
  // Et l'ordre du site la garde au bout, là où le défilement l'a mise.
  press(w, 'Trier par ancienneté')
  assert.equal(w.order().at(-1), late.reference)
})

// L'âge n'est pas recalculé : il est lu sur la pastille que listing.js vient de
// poser. Le nombre réécrit à la main ne se lit nulle part ailleurs — ni dans la
// charge, ni dans le texte. Rouge sur la lecture de `data-adscope-days` dans
// `read` (src/order.js) : le tri le prendrait ailleurs, ou nulle part.
test("le tri lit l'ancienneté sur la pastille, il n'en refait aucune", () => {
  const w = listing()
  const last = refs(w).at(-1)
  w.badge(last).setAttribute('data-adscope-days', '9999')
  press(w, 'Trier par ancienneté')
  assert.equal(w.order()[0], last)
})

// La limite du produit : la page chargée, rien d'autre. Rouge à la première
// requête qu'un tri ou un filtre déclencherait — page suivante, ou API.
test("trier et filtrer ne demandent rien : ni au site, ni à l'API", () => {
  const net = []
  const fetched = globalThis.fetch
  const xhr = globalThis.XMLHttpRequest
  globalThis.fetch = (...a) => (net.push(a), Promise.resolve())
  globalThis.XMLHttpRequest = class {
    open(...a) { net.push(a) }
    send(...a) { net.push(a) }
  }
  try {
    const w = listing()
    const sent = w.messages().length
    const asked = w.asked().length
    for (const label of ['Trier par ancienneté', '≥ 30 j', '≥ 90 j', 'Trier par ancienneté', '≥ 90 j']) press(w, label)
    assert.deepEqual(net, [])
    assert.equal(w.messages().length, sent)
    assert.equal(w.asked().length, asked)
  } finally {
    globalThis.fetch = fetched
    globalThis.XMLHttpRequest = xhr
  }
})

// L'autre site, sur sa fixture : le conteneur est celui que le registre déduit
// de la prise déclarée par son module — `cards: 'article'` —, et la barre s'y
// pose sans qu'aucune ligne partagée ne nomme le site. Rouge sur cette
// déclaration de src/sites/leboncoin.js, comme sur `list` de src/sites.js.
test('sur la fixture leboncoin, la barre trie les cartes du conteneur déclaré', () => {
  const w = at(RELEVE, () => {
    const w = world('3263931610', { path: '/voitures/occasions', also: ['3254194817', '3250252623'] })
    w.load('listing.js')
    return w
  })
  assert.match(bar(w).textContent, /sur les 3 annonces de cette page/)
  press(w, 'Trier par ancienneté')
  assert.deepEqual(w.order(), ['3250252623', '3254194817', '3263931610'])
  press(w, 'Trier par ancienneté')
  assert.deepEqual(w.order(), ['3263931610', '3254194817', '3250252623'])
})

// Les annonces similaires d'une fiche ne sont pas une page de résultats : la
// barre n'y a rien à trier. Rouge sur le garde `ADS.diag.urlId` de src/sort.js.
test("aucune barre sur une fiche, où les cartes ne sont pas des résultats", () => {
  const w = at(RELEVE, () => {
    const w = world('3254194817', { path: '/ad/voitures/3254194817' })
    w.load('listing.js')
    return w
  })
  assert.equal(bar(w), null)
})
