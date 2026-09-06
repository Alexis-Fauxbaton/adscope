import test from 'node:test'
import assert from 'node:assert/strict'
import { ad, block, world } from './world.mjs'

// Deux annonces dans le même bloc de données, comme une fiche qui porterait ses
// annonces similaires : 3254194817 est un vendeur professionnel, 3263931610 un
// particulier — le panneau dit lequel, donc son texte trahit l'annonce choisie.
const PRO = '3254194817'
const PRIVATE = '3263931610'
const TWO = block(ad(PRO), ad(PRIVATE))

test("l'annonce décrite est celle que l'URL désigne, pas la première du bloc", () => {
  const w = world('0', { path: `/ad/voitures/${PRIVATE}`, data: TWO })
  w.load('detail.js')
  assert.equal(w.panel().getAttribute('data-adscope-detail'), PRIVATE)
  assert.match(w.panel().textContent, /particulier/)
  assert.doesNotMatch(w.panel().textContent, /professionnel/)
})

test("sans identifiant dans l'URL, la première annonce est décrite", () => {
  // Une page de résultats : aucune annonce n'y est « celle de l'URL », et
  // detail.js y pose quand même son panneau.
  const w = world('0', { path: '/voitures/occasions', data: TWO })
  w.load('detail.js')
  assert.equal(w.panel().getAttribute('data-adscope-detail'), PRO)
  assert.match(w.panel().textContent, /professionnel/)
})

test("quand aucune annonce ne correspond à l'URL, le panneau reste et se corrige", () => {
  // Cas d'une navigation monopage prise entre deux états : l'URL est déjà la
  // nouvelle, le bloc de données porte encore l'ancienne fiche. Le repli sur la
  // première annonce garde un panneau à l'écran, et comme son marquage ne peut
  // pas s'accorder avec l'identifiant de l'URL, le rendu est rejoué à chaque lot
  // jusqu'à ce que la bonne annonce arrive — l'écart se referme tout seul.
  const w = world('0', { path: '/ad/voitures/9999999999', data: TWO })
  w.load('detail.js')
  assert.equal(w.panel().getAttribute('data-adscope-detail'), PRO)
  assert.match(w.panel().textContent, /Lu sur la page/)

  w.visit(ad(PRIVATE))
  w.mutate(1)
  assert.equal(w.panel().getAttribute('data-adscope-detail'), PRIVATE)
  assert.match(w.panel().textContent, /particulier/)
})

test('plusieurs annonces dans le bloc ne font pas rejouer le rendu à chaque lot', () => {
  const w = world('0', { path: `/ad/voitures/${PRIVATE}`, data: TWO })
  w.load('detail.js')
  assert.deepEqual(w.counts, { extract: 1, scan: 1 })

  w.mutate(20)
  assert.deepEqual(w.counts, { extract: 1, scan: 1 })
  assert.equal(w.panel().getAttribute('data-adscope-detail'), PRIVATE)
})

// Un horodatage d'annonce, écrit en heure locale comme ceux de leboncoin.
const stamp = (days) => {
  const t = new Date(Date.now() - days * 86400000)
  const p = (n) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`
}

const aged = (onlineDays, bumpedDaysAgo) => ({
  ...ad(PRO),
  list_id: 4000000001,
  first_publication_date: stamp(onlineDays),
  index_date: stamp(bumpedDaysAgo),
})

test('le panneau suit le seuil de la pastille, pas la seule réactualisation', () => {
  const recent = world('0', { path: `/ad/voitures/${PRO}`, data: block(ad(PRO)) })
  recent.load('detail.js')
  assert.equal(recent.panel().className, 'adscope-panel')

  const old = world('0', { path: '/ad/voitures/4000000001', data: block(aged(400, 2)) })
  old.load('detail.js')
  assert.equal(old.panel().className, 'adscope-panel adscope-panel--notable')
  assert.match(old.panel().textContent, /1 an/)
})

// La navigation monopage telle qu'elle se produit : le navigateur reçoit la
// fiche suivante et `__NEXT_DATA__` reste celui de la fiche d'entrée — il n'est
// jamais réécrit après le rendu serveur.
test('la fiche suivante est lue dans la charge reçue, pas dans le bloc figé', () => {
  const w = world('0', { path: `/ad/voitures/${PRO}`, data: block(ad(PRO)) })
  w.load('detail.js')
  assert.match(w.panel().textContent, /professionnel/)

  w.goto(PRIVATE)
  w.receive({ props: { ad: ad(PRIVATE) } }, 'detail')
  assert.equal(w.panel().getAttribute('data-adscope-detail'), PRIVATE)
  assert.match(w.panel().textContent, /particulier/)
  assert.doesNotMatch(w.panel().textContent, /professionnel/)
  // Et l'annonce entre au suivi, comme celles d'une page de résultats.
  assert.deepEqual(w.queued(), [PRO, PRIVATE])
})

test("une fiche préchargée attend que l'URL la désigne", () => {
  // Next préfetche les fiches liées : leur charge arrive avant tout clic, et
  // c'est l'URL — jamais l'ordre d'arrivée — qui dit laquelle est lue.
  const w = world('0', { path: `/ad/voitures/${PRO}`, data: block(ad(PRO)) })
  w.load('detail.js')
  w.receive({ props: { ad: ad(PRIVATE) } }, 'detail')
  assert.equal(w.panel().getAttribute('data-adscope-detail'), PRO)

  w.goto(PRIVATE)
  w.mutate(1)
  assert.equal(w.panel().getAttribute('data-adscope-detail'), PRIVATE)
  assert.match(w.panel().textContent, /particulier/)
})

// La règle, sur la fiche comme sur la liste : on ne suit que ce qu'on montre. Le
// panneau décrit une annonce, une seule ; les autres du bloc — annonces
// similaires, fiches que Next a préchargées — ne sont pas affichées ici. Rouge
// sur `ADS.sync.send([listing])` de src/detail.js : avec `send(listings)`, une
// fiche verse au suivi tout ce que son bloc transporte.
test("la fiche ne verse au suivi que l'annonce que son panneau décrit", () => {
  const w = world('0', { path: `/ad/voitures/${PRIVATE}`, data: TWO })
  w.load('detail.js')
  assert.equal(w.panel().getAttribute('data-adscope-detail'), PRIVATE)
  assert.deepEqual(w.queued(), [PRIVATE])
})

// Mais les annonces similaires d'une fiche, elles, ont leurs cartes à l'écran :
// c'est listing.js qui les pastille, et elles entrent au suivi par là. La règle
// tient sur l'affichage, jamais sur l'origine de la donnée.
test("les annonces similaires qui ont une carte entrent au suivi", () => {
  const w = world(PRO, { path: `/ad/voitures/${PRIVATE}`, data: TWO })
  w.load('detail.js')
  w.load('listing.js')
  assert.ok(w.badge(), 'la carte de la fiche similaire est pastillée')
  assert.deepEqual(w.queued().sort(), [PRIVATE, PRO].sort())
})
