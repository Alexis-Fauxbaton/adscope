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
