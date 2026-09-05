import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const { normalize, signals } = createRequire(import.meta.url)(
  join(here, '../src/sites/leboncoin.js'),
)

const ads = JSON.parse(readFileSync(join(here, 'fixtures/leboncoin-ads.json'), 'utf8'))
const listings = ads.map(normalize)
const NOW = new Date('2026-09-05T12:00:00Z')

test('la fixture produit des annonces exploitables', () => {
  assert.equal(listings.length, 35)
  assert.ok(listings.every((l) => l.siteId && l.publishedAt && l.bumpedAt))
})

test('le prix est extrait comme entier', () => {
  const first = listings.find((l) => l.siteId === '3254194817')
  assert.equal(first.price, 29990)
  assert.equal(first.brand, 'Hyundai')
  assert.equal(first.year, 2022)
  assert.equal(first.mileage, 73000)
})

test('les professionnels sont identifiables', () => {
  assert.equal(listings.filter((l) => l.isPro).length, 7)
})

test('une remontée franche est détectée', () => {
  const l = listings.find((l) => l.siteId === '3254194817')
  const s = signals(l, NOW)
  assert.equal(s.bumped, true)
  assert.equal(s.onlineDays, 14)
  assert.equal(s.bumpedDaysAgo, 2)
})

test('une annonce jamais remontée ne déclenche rien', () => {
  const l = normalize({
    list_id: 1, price: [9900], owner: { type: 'pro' }, attributes: [],
    first_publication_date: '2026-09-01 10:00:00',
    index_date: '2026-09-01 10:04:00',
  })
  const s = signals(l, NOW)
  assert.equal(s.bumped, false)
  assert.equal(s.bumpedDaysAgo, null)
  assert.equal(s.onlineDays, 4)
})

test('un écart inférieur à 24 h ne compte pas comme remontée', () => {
  const l = normalize({
    list_id: 2, price: [1], owner: { type: 'pro' }, attributes: [],
    first_publication_date: '2026-09-01 10:00:00',
    index_date: '2026-09-02 09:00:00',
  })
  assert.equal(signals(l, NOW).bumped, false)
})

test('la fixture ne contient aucune donnée personnelle', () => {
  const raw = readFileSync(join(here, 'fixtures/leboncoin-ads.json'), 'utf8')
  for (const forbidden of ['siren', 'user_id', 'store_id', 'name', 'has_phone']) {
    assert.equal(raw.includes(`"${forbidden}"`), false, `${forbidden} présent dans la fixture`)
  }
})

const { duration, ago } = createRequire(import.meta.url)(join(here, '../src/format.js'))

test('les durées se lisent en français', () => {
  assert.equal(duration(0), "moins d'un jour")
  assert.equal(duration(1), '1 j')
  assert.equal(duration(15), '15 j')
  assert.equal(duration(45), '1 mois')
  assert.equal(duration(400), '1 an')
  assert.equal(duration(800), '2 ans')
})

test('une antériorité ne produit jamais « il y a aujourd\'hui »', () => {
  assert.equal(ago(0), "aujourd'hui")
  assert.equal(ago(1), 'hier')
  assert.equal(ago(2), 'il y a 2 j')
  for (const n of [0, 1, 2, 30, 400]) assert.ok(!ago(n).includes("il y a aujourd'hui"))
})

test('une annonce banale n\'est pas signalée', () => {
  const fresh = normalize({
    list_id: 9, price: [1], owner: { type: 'pro' }, attributes: [],
    first_publication_date: '2026-09-05 20:59:10',
    index_date: '2026-09-05 20:59:10',
  })
  assert.equal(signals(fresh, NOW).notable, false)
})

test('une annonce ancienne ou remontée est signalée', () => {
  const old = normalize({
    list_id: 10, price: [1], owner: { type: 'pro' }, attributes: [],
    first_publication_date: '2026-08-20 10:00:00',
    index_date: '2026-08-20 10:00:00',
  })
  assert.equal(signals(old, NOW).notable, true)

  const bumped = listings.find((l) => l.siteId === '3254194817')
  assert.equal(signals(bumped, NOW).notable, true)
})

test('la fixture réelle ne signale que la minorité utile', () => {
  const pro = listings.filter((l) => l.isPro)
  const notable = pro.filter((l) => signals(l, NOW).notable)
  assert.ok(notable.length < pro.length, 'le filtre ne réduit rien')
  assert.ok(notable.length >= 1, 'le filtre supprime tout')
})
