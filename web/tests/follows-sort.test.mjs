import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SORT, sortFeed } from '../js/follows-sort.js'

const A = { site: 'lc', site_id: '1', price_delta_since_first: -1200, age_days: 412, last_change_at: '2026-09-17T00:00:00Z' }
const B = { site: 'lc', site_id: '2', price_delta_since_first: -300, age_days: 71, last_change_at: '2026-09-18T00:00:00Z' }
const C = { site: 'lc', site_id: '3', price_delta_since_first: 0, age_days: 592, last_change_at: '2026-09-10T00:00:00Z' }

// Rouge sur `(a.price_delta_since_first || 0) - (b.price_delta_since_first || 0)`
// dans follows-sort.js : sans lui, la plus forte baisse ne passerait pas en
// tête (−1 200 est *plus petit* que −300, il doit venir avant).
test('tri par baisse cumulée : la plus forte baisse d’abord', () => {
  assert.deepEqual(sortFeed([C, B, A], 'drop').map((i) => i.site_id), ['1', '2', '3'])
})

// Rouge sur `(b.age_days || 0) - (a.age_days || 0)` : sans lui, la plus
// ancienne annonce ne serait pas en tête.
test('tri par ancienneté : la plus vieille annonce d’abord', () => {
  assert.deepEqual(sortFeed([A, B, C], 'age').map((i) => i.site_id), ['3', '1', '2'])
})

// Rouge sur `new Date(b.last_change_at) - new Date(a.last_change_at)` : sans
// lui, le changement le plus récent ne serait pas en tête.
test('tri par récence : le changement le plus récent d’abord', () => {
  assert.deepEqual(sortFeed([A, C, B], 'recent').map((i) => i.site_id), ['2', '1', '3'])
})

// Rouge sur `|| tie(a, b)` de chaque comparateur : sans le repli, deux items
// à égalité changeraient d’ordre d’un tri à l’autre.
test('une égalité se tranche par (site, site_id), un ordre stable', () => {
  const D = { site: 'lbc', site_id: '9', price_delta_since_first: 0, age_days: 10, last_change_at: null }
  const E = { site: 'lc', site_id: '9', price_delta_since_first: 0, age_days: 10, last_change_at: null }
  assert.deepEqual(sortFeed([E, D], 'drop').map((i) => i.site), ['lbc', 'lc'])
  assert.deepEqual(sortFeed([E, D], 'age').map((i) => i.site), ['lbc', 'lc'])
})

// Rouge sur `COMPARATORS[sort] || COMPARATORS[DEFAULT_SORT]` : un tri
// inconnu (adresse trafiquée) ne doit pas planter la page, il retombe sur le
// tri par défaut.
test('un tri inconnu retombe sur le défaut', () => {
  assert.deepEqual(sortFeed([C, A], 'inconnu'), sortFeed([C, A], DEFAULT_SORT))
})
