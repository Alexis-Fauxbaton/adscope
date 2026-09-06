import test from 'node:test'
import assert from 'node:assert/strict'
import { ad, block, world } from './world.mjs'

// Le diagnostic répond à une seule question : quelle annonce l'extension a-t-elle
// retenue, et est-ce celle que l'URL désigne ? Deux annonces dans le bloc, comme
// une fiche qui porte ses annonces similaires.
const PRO = '3254194817'
const PRIVATE = '3263931610'
const TWO = block(ad(PRO), ad(PRIVATE))

test("sur une fiche, le diagnostic dit l'annonce retenue et son accord avec l'URL", () => {
  const w = world('0', { path: `/ad/voitures/${PRIVATE}`, data: TWO })
  w.load('detail.js')
  const s = w.status()
  assert.equal(s.kind, 'detail')
  assert.equal(s.nextData, true)
  assert.equal(s.listings, 2)
  assert.equal(s.pickedId, PRIVATE)
  assert.equal(s.urlId, PRIVATE)
  assert.equal(s.matchesUrl, true)
  assert.equal(s.sellerType, 'private')
})

test("le désaccord entre l'annonce retenue et l'URL est consigné", () => {
  // L'URL désigne une annonce absente du bloc : le panneau se rabat sur la
  // première, et le diagnostic doit le dire au lieu de le taire.
  const w = world('0', { path: '/ad/voitures/9999999999', data: TWO })
  w.load('detail.js')
  const s = w.status()
  assert.equal(s.pickedId, PRO)
  assert.equal(s.urlId, '9999999999')
  assert.equal(s.matchesUrl, false)
  assert.equal(s.sellerType, 'pro')
})

test('sur une page de résultats, le diagnostic compte les annonces et la répartition', () => {
  const w = world(PRO, { path: '/voitures/occasions', data: TWO })
  w.load('listing.js')
  const s = w.status()
  assert.equal(s.kind, 'listing')
  assert.equal(s.url, '/voitures/occasions')
  assert.equal(s.listings, 2)
  assert.equal(s.pro, 1)
  assert.equal(s.badges, 1)
})

test('un seul des deux scripts écrit le diagnostic de la page', () => {
  // Les deux content scripts tournent sur toutes les pages du site : sans règle,
  // le dernier rendu écraserait le diagnostic de l'autre.
  const results = world(PRO, { path: '/voitures/occasions', data: TWO })
  results.load('listing.js')
  results.load('detail.js')
  assert.equal(results.status().kind, 'listing')

  const detail = world(PRO, { path: `/ad/voitures/${PRO}`, data: TWO })
  detail.load('listing.js')
  detail.load('detail.js')
  assert.equal(detail.status().kind, 'detail')
})

test("sur une fiche, les cartes d'annonces similaires n'écrasent pas son diagnostic", () => {
  // listing.js tourne aussi sur les fiches : les annonces similaires lui font
  // poser des pastilles, et son rendu peut suivre celui de la fiche.
  const w = world(PRO, { path: `/ad/voitures/${PRO}`, data: TWO })
  w.load('detail.js')
  w.load('listing.js')
  assert.equal(w.status().kind, 'detail')
})

test("sur une fiche, le diagnostic dit d'où vient l'annonce lue", () => {
  // Le bloc `__NEXT_DATA__` décrit la fiche d'entrée ; la suivante n'arrive que
  // par la charge que le navigateur reçoit. La popup doit distinguer les deux.
  const w = world('0', { path: `/ad/voitures/${PRO}`, data: block(ad(PRO)) })
  w.load('detail.js')
  assert.equal(w.status().source, 'page')

  w.goto(PRIVATE)
  w.receive({ props: { ad: ad(PRIVATE) } }, 'detail')
  assert.equal(w.status().pickedId, PRIVATE)
  assert.equal(w.status().source, 'live')
})
