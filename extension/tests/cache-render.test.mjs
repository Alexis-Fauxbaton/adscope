import test from 'node:test'
import assert from 'node:assert/strict'
import { ad, block, world } from './world.mjs'

const ID = '3254194817'
const KNOWN = { price: 29190, price_delta_since_first: -800, price_delta_days_since_first: 12, tracked_days: 12 }
const FRESHER = { price: 28390, price_delta_since_first: -1600, price_delta_days_since_first: 20, tracked_days: 20 }

const listing = () => world(ID, { path: '/voitures/occasions', data: block(ad(ID)), cache: { [ID]: KNOWN } })
const detail = () => world(ID, { path: `/ad/voitures/${ID}`, data: block(ad(ID)), cache: { [ID]: KNOWN } })

// Le cache n'a d'intérêt que s'il s'affiche : le réseau, lui, arrive quand il
// arrive, et l'utilisateur ne doit pas l'attendre pour voir ce qu'on savait.
test('la pastille montre le suivi connu avant toute réponse du réseau', () => {
  const w = listing()
  w.load('listing.js')
  const [, , tracked] = w.badge().children
  assert.equal(tracked.className, 'adscope-badge-tracked')
  assert.match(tracked.textContent, /^↓ 800/)
})

test('la réponse du réseau réécrit la pastille posée depuis le cache', () => {
  const w = listing()
  w.load('listing.js')
  w.arrive({ [ID]: FRESHER })
  assert.match(w.badge().children[2].textContent, /^↓ 1/)
})

// Le panneau ne porte plus la baisse (décision de revue : la légende de suivi
// tient en une ligne, sans le prix) ; `tracked_days` reste le fait qui change
// entre le cache et le réseau, et qui prouve que le panneau relit l'un puis
// l'autre.
test('le panneau de la fiche affiche lui aussi le cache, puis le réseau', () => {
  const w = detail()
  w.load('detail.js')
  assert.match(w.panel().textContent, /Suivie depuis 12 j/)
  w.arrive({ [ID]: FRESHER })
  assert.match(w.panel().textContent, /Suivie depuis 20 j/)
})

test('le diagnostic distingue ce qui vient du cache de ce qui vient du réseau', () => {
  const w = listing()
  w.load('listing.js')
  assert.deepEqual(w.status().sources, { cache: 1, network: 0 })
  w.arrive({ [ID]: FRESHER })
  assert.deepEqual(w.status().sources, { cache: 0, network: 1 })
})

test("une page dont rien n'est connu ne prétend pas venir du cache", () => {
  const w = world(ID, { path: '/voitures/occasions', data: block(ad(ID)) })
  w.load('listing.js')
  assert.deepEqual(w.status().sources, { cache: 0, network: 0 })
  assert.equal(w.badge().children.length, 2)
})
