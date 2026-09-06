import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
globalThis.ADS = undefined
const report = require(join(dirname(fileURLToPath(import.meta.url)), '../popup/report.js'))

const listing = (over = {}) => ({
  kind: 'listing', url: '/voitures/occasions', nextData: true, source: 'live',
  listings: 24, pro: 18, badges: 24, sent: 24, sources: { cache: 0, network: 24 }, ...over,
})

const value = (rows, label) => (rows.find((r) => r.label === label) || {}).value
const flagged = (rows, label) => (rows.find((r) => r.label === label) || {}).bad

test("le relevé sépare les signaux du cache de ceux du réseau", () => {
  const rows = report.rows(listing({ sources: { cache: 20, network: 4 } }))
  assert.equal(value(rows, 'Signaux affichés'), '20 du cache · 4 du réseau')
})

test('une fiche dit la même chose que la liste sur ses signaux', () => {
  const rows = report.rows({
    kind: 'detail', url: '/ad/voitures/1', nextData: true, source: 'page', listings: 1,
    pickedId: '1', urlId: '1', matchesUrl: true, sellerType: 'pro',
    sources: { cache: 1, network: 0 },
  })
  assert.equal(value(rows, 'Signaux affichés'), '1 du cache · 0 du réseau')
})

// Une page entièrement servie par le cache ne transmet rien : c'est le
// fonctionnement attendu, pas une panne.
test("rien à transmettre n'est un défaut que si le cache n'a rien servi", () => {
  assert.equal(flagged(report.rows(listing({ sent: 0, sources: { cache: 24, network: 0 } })), "Transmises depuis l'ouverture"), false)
  assert.equal(flagged(report.rows(listing({ sent: 0, sources: { cache: 0, network: 0 } })), "Transmises depuis l'ouverture"), true)
})

test('aucun signal, ni du cache ni du réseau, est signalé et expliqué', () => {
  const { text, bad } = report.trouble(listing({ sent: 0, sources: { cache: 0, network: 0 } }))
  assert.match(text, /licence|API/)
  assert.equal(bad, true)
})

test('une page servie par le cache seul ne déclenche aucune alerte', () => {
  assert.deepEqual(report.trouble(listing({ sent: 0, sources: { cache: 24, network: 0 } })), {})
})

test('un diagnostic ancien, sans origine connue, ne fait pas planter le relevé', () => {
  const rows = report.rows(listing({ sources: undefined }))
  assert.equal(value(rows, 'Signaux affichés'), '0 du cache · 0 du réseau')
})

test("le désaccord entre l'URL et l'annonce retenue reste l'alerte principale", () => {
  const s = { kind: 'detail', nextData: true, listings: 2, pickedId: '1', urlId: '2', matchesUrl: false }
  assert.equal(report.trouble(s).bad, true)
  assert.match(report.trouble(s).text, /2/)
})

test("le taux d'occupation se lit en unités lisibles", () => {
  assert.equal(report.occupancy({ entries: 1, bytes: 900, quota: 10485760 }).value, '1 annonce · 900 o sur 10 Mo')
  assert.equal(report.occupancy({ entries: 42, bytes: 120000, quota: 10485760 }).value, '42 annonces · 117 Ko sur 10 Mo')
})

test("un cache proche du quota est signalé avant qu'il déborde", () => {
  assert.equal(report.occupancy({ entries: 9, bytes: 500, quota: 10000 }).bad, false)
  assert.equal(report.occupancy({ entries: 9, bytes: 9500, quota: 10000 }).bad, true)
})

test('un cache vide se lit sans détour', () => {
  assert.equal(report.occupancy({ entries: 0, bytes: 0, quota: 10485760 }).value, 'vide')
})
