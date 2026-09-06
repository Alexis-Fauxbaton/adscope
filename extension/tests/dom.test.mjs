import test from 'node:test'
import assert from 'node:assert/strict'
import { ad, world } from './world.mjs'

test('la fiche ne refait pas le travail lourd à chaque lot de mutations', () => {
  const w = world('0')
  w.load('detail.js')
  assert.deepEqual(w.counts, { extract: 1, scan: 1 })

  // Le carrousel, le lazy-loading et l'en-tête collant mutent en permanence.
  w.mutate(20)
  assert.deepEqual(w.counts, { extract: 1, scan: 1 })

  // Un seul rendu de plus quand les signaux arrivent, puis plus rien.
  w.arrive({ [w.panel().getAttribute('data-adscope-detail')]: { tracked_days: 12, observations: 3, price: 29190 } })
  assert.deepEqual(w.counts, { extract: 2, scan: 2 })
  w.mutate(20)
  assert.deepEqual(w.counts, { extract: 2, scan: 2 })
  assert.ok(w.panel().textContent.includes('Suivi adscope'))
})

test('la pastille pose un nœud par origine', () => {
  const w = world('3254194817')
  w.load('listing.js')
  const first = w.badge().children
  assert.deepEqual(first.map((c) => c.className), ['adscope-badge-page'])

  w.arrive({ 3254194817: { price: 29190, price_delta_since_first: -800, price_delta_days_since_first: 12 } })
  const [page, tracked] = w.badge().children
  assert.equal(tracked.className, 'adscope-badge-tracked')
  assert.match(tracked.textContent, /^▼ −800/)
  assert.ok(!page.textContent.includes('▼'))
})

test('la fiche suivante chasse la précédente en navigation monopage', () => {
  const w = world('0')
  w.visit(ad('3254194817'))
  w.load('detail.js')
  assert.equal(w.panel().getAttribute('data-adscope-detail'), '3254194817')
  assert.match(w.panel().textContent, /professionnel/)

  // Le panneau posé survit au passage à la fiche suivante : le laisser tel quel
  // afficherait l'ancienneté du véhicule que le lecteur vient de quitter.
  w.visit(ad('3263931610'))
  w.mutate(1)
  assert.equal(w.panel().getAttribute('data-adscope-detail'), '3263931610')
  assert.match(w.panel().textContent, /particulier/)
  assert.doesNotMatch(w.panel().textContent, /professionnel/)
})
