import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
require(join(here, '../src/sites.js'))
require(join(here, '../src/sites/read.js'))
const { normalize, signals } = require(join(here, '../src/sites/leboncoin.js'))

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
  assert.equal(listings.filter((l) => l.sellerType === 'pro').length, 7)
})

test('une réactualisation franche est détectée', () => {
  const l = listings.find((l) => l.siteId === '3254194817')
  const s = signals(l, NOW)
  assert.equal(s.bumped, true)
  assert.equal(s.onlineDays, 14)
  assert.equal(s.bumpedDaysAgo, 2)
})

test('une annonce jamais réactualisée ne déclenche rien', () => {
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

test('un écart inférieur à 24 h ne compte pas comme une réactualisation', () => {
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

// Une annonce d'âge choisi : les horodatages sont écrits en heure locale, comme
// ceux de leboncoin, pour que l'écart avec NOW soit exact sous tout fuseau.
const stamp = (days) => {
  const t = new Date(NOW - days * 86400000)
  const p = (n) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`
}

const aged = (onlineDays, bumpedDaysAgo = null) =>
  normalize({
    list_id: 9, price: [1], owner: { type: 'pro' }, attributes: [],
    first_publication_date: stamp(onlineDays),
    index_date: stamp(bumpedDaysAgo === null ? onlineDays : bumpedDaysAgo),
  })

test('une annonce banale n\'est pas signalée', () => {
  assert.equal(signals(aged(0), NOW).notable, false)
})

// Mesuré sur les 7 110 annonces en base le 2026-09-06 : 76 % des annonces
// professionnelles sont réactualisées. Alerter là-dessus, c'est alerter sur tout.
test('la réactualisation seule ne suffit plus à alerter', () => {
  assert.equal(signals(aged(6, 1), NOW).notable, false)
  assert.equal(signals(aged(20, 2), NOW).notable, false)
})

test('l\'alerte demande l\'ancienneté et la réactualisation ensemble', () => {
  assert.equal(signals(aged(31, 2), NOW).notable, true)
  // La borne : à 30 j la pastille compte encore en jours, l'alerte attend le mois.
  assert.equal(signals(aged(30, 2), NOW).notable, false)
  // La BMW du relevé du 2026-09-06 : six ans en ligne, réactualisée l'avant-veille.
  assert.equal(signals(aged(2235, 2), NOW).notable, true)
})

test('une réactualisation qui date ne maintient plus rien en avant', () => {
  assert.equal(signals(aged(400, 14), NOW).notable, true)
  assert.equal(signals(aged(400, 15), NOW).notable, false)
})

// Du stock qui dort sans qu'on paie pour le cacher : la page dit déjà son âge,
// il n'y a aucune contradiction à dénoncer — la mention discrète suffit.
test('l\'annonce ancienne jamais réactualisée est appuyée, pas alertée', () => {
  const s = signals(aged(45), NOW)
  assert.equal(s.bumped, false)
  assert.equal(s.notable, false)
  assert.equal(s.dormant, true)
  assert.equal(signals(aged(20), NOW).dormant, false)
  assert.equal(signals(aged(45, 2), NOW).dormant, false)
})

test('une page de résultats triée par fraîcheur reste silencieuse', () => {
  const loud = listings.filter((l) => signals(l, NOW).notable || signals(l, NOW).dormant)
  assert.deepEqual(loud, [], 'une page de fraîcheur ne contient rien à signaler')
})

test('le type de vendeur est porté comme donnée, pas comme booléen', () => {
  const types = new Set(listings.map((l) => l.sellerType))
  assert.deepEqual([...types].sort(), ['private', 'pro'])
  assert.equal(listings.filter((l) => l.sellerType === 'private').length, 28)
})

// Relevé sur une page réelle le 2026-09-06 : `owner` porte `store_id`, `name`,
// `user_id` et `siren` — **pour les particuliers aussi**, avec un prénom en
// guise de nom. Le tri ne peut donc pas se faire sur la présence du champ : il
// se fait sur le type de vendeur, et seul le professionnel est retenu.
test("l'identifiant du vendeur professionnel est retenu", () => {
  const l = normalize({
    list_id: 3, price: [1], attributes: [],
    first_publication_date: '2026-09-01 10:00:00', index_date: '2026-09-01 10:00:00',
    owner: {
      store_id: '76697703', user_id: 'b4ac8071-8ad0-4b14-9b21-eee8960795e8',
      type: 'pro', name: 'CVD AUTOMOBILES', siren: '984694505',
    },
  })
  assert.equal(l.sellerId, '76697703')
  assert.equal(l.sellerName, 'CVD AUTOMOBILES')
})

test("celui d'un particulier ne l'est pas, son nom encore moins", () => {
  const l = normalize({
    list_id: 4, price: [1], attributes: [],
    first_publication_date: '2026-09-01 10:00:00', index_date: '2026-09-01 10:00:00',
    owner: { store_id: '27784407', user_id: '62d41a2e', type: 'private', name: 'Fra' },
  })
  assert.equal(l.sellerId, null)
  assert.equal(l.sellerName, null)
})

test("ni le siren ni l'identifiant de compte ne sortent de la page", () => {
  const l = normalize({
    list_id: 5, price: [1], attributes: [],
    first_publication_date: '2026-09-01 10:00:00', index_date: '2026-09-01 10:00:00',
    owner: { store_id: '1', user_id: 'u', type: 'pro', name: 'X', siren: '984694505' },
  })
  assert.equal(JSON.stringify(l).includes('984694505'), false)
  assert.equal(JSON.stringify(l).includes('"u"'), false)
})
