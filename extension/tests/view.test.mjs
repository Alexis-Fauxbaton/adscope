import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { normalize, signals } = require(join(here, '../src/sites/leboncoin.js'))
require(join(here, '../src/format.js'))
const view = require(join(here, '../src/view.js'))

const load = (name) => JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'))
const listings = load('leboncoin-ads.json').map(normalize)
const remote = Object.fromEntries(load('signals-batch.json').map((s) => [s.site_id, s]))
const NOW = new Date('2026-09-05T12:00:00Z')

const of = (siteId) => {
  const listing = listings.find((l) => l.siteId === siteId)
  return [listing, signals(listing, NOW), remote[siteId]]
}

// Espaces insécables produits par format.money.
const NB = '\u00a0'
const NARROW = '\u202f'

test('la pastille dit « réactualisée », jamais « remontée »', () => {
  const [l, s] = of('3254194817')
  const text = view.badge(l, s, null)
  assert.match(text, /⟳ réactualisée il y a 2 j · en ligne depuis 14 j/)
  assert.ok(!text.includes('remont'))
})

test('sans API la pastille tient avec la seule page', () => {
  const [l, s] = of('3254194817')
  assert.equal(view.badge(l, s, null), view.badge(l, s, undefined))
  assert.ok(!view.badge(l, s, null).includes('▼'))
})

test('la baisse de prix vient des signaux et s\'ajoute à la pastille', () => {
  const [l, s, r] = of('3254194817')
  assert.equal(view.badge(l, s, r), `⟳ réactualisée il y a 2 j · en ligne depuis 14 j · ▼ −800${NB}€ en 12 j`)
})

test('une hausse ou un prix stable ne produit aucune baisse', () => {
  const [l, s, r] = of('3250252623')
  assert.equal(view.drop(r), null)
  assert.equal(view.drop({ price_delta_since_first: 500, price_delta_days_since_first: 3 }), null)
  assert.equal(view.drop(null), null)
})

test('le panneau nomme la contradiction affichée par le site', () => {
  const [l, s, r] = of('3254194817')
  const { claim } = view.panel(l, s, r, "aujourd'hui à 21:14")
  assert.equal(claim.label, 'leboncoin affiche')
  assert.equal(claim.says, "aujourd'hui à 21:14")
  assert.match(claim.note, /réactualisation/)
})

test('sans réactualisation ou sans date lue, aucune contradiction n\'est inventée', () => {
  const [l, s, r] = of('3254194817')
  assert.equal(view.panel(l, s, r, null).claim, null)
  const calm = normalize({
    list_id: 7, price: [1], owner: { type: 'pro' }, attributes: [],
    first_publication_date: '2026-09-01 10:00:00', index_date: '2026-09-01 10:02:00',
  })
  assert.equal(view.panel(calm, signals(calm, NOW), null, "aujourd'hui à 21:14").claim, null)
})

test('le panneau sépare ce qui est lu de ce qui est suivi', () => {
  const [l, s, r] = of('3254194817')
  const p = view.panel(l, s, r, "aujourd'hui à 21:14")
  assert.deepEqual(p.page.map((x) => x.label), ['En ligne depuis', 'Réactualisée', 'Vendeur'])
  assert.deepEqual(p.tracked, [
    { label: 'Suivie depuis', value: '12 j · 3 vues' },
    { label: 'Prix', value: `29${NARROW}190${NB}€  ▼ −800${NB}€ en 12 j`, strong: true },
  ])
})

test('un prix inchangé se dit « stable depuis », pas « aucun changement »', () => {
  const [l, s, r] = of('3250252623')
  const p = view.panel(l, s, r, null)
  assert.deepEqual(p.tracked, [
    { label: 'Suivie depuis', value: '5 j · 1 vue' },
    { label: 'Prix', value: 'stable depuis 5 j' },
  ])
})

test('sans signaux le panneau garde ses lignes de page et rien d\'autre', () => {
  const [l, s] = of('3254194817')
  const p = view.panel(l, s, null, "aujourd'hui à 21:14")
  assert.equal(p.tracked.length, 0)
  assert.equal(p.page[0].value, '14 j')
  assert.ok(p.claim)
})

test('les montants portent les espaces insécables du français', () => {
  const { money } = require(join(here, '../src/format.js'))
  assert.equal(money(-1000), `1${NARROW}000${NB}€`)
  assert.equal(money(800), `800${NB}€`)
})
