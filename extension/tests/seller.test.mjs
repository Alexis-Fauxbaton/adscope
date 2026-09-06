import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
globalThis.ADS = undefined
const seller = require(join(here, '../popup/seller.js'))

// Le relevé que l'API rend, tel que la popup le reçoit.
const stats = (over = {}) => ({
  site: 'lbc', seller_id: '73911', seller_name: 'ENTREPOT 222',
  listings: 29, aged: 29, over_a_month: 18, over_a_month_share: 0.621,
  median_age_days: 47, price_changed_listings: 12, price_drop_listings: 9,
  price_drop_rate: -0.032, price_drop_after_days: 42, ...over,
})

const value = (b, label) => (b.rows.find((r) => r.label === label) || {}).value

test('le bloc nomme le marchand et son stock en ligne', () => {
  const b = seller.block(stats())
  assert.equal(b.title, 'Ce vendeur — ENTREPOT 222')
  assert.equal(b.lead, '29 annonces en ligne')
})

test("la part au delà d'un mois se lit en clair", () => {
  const b = seller.block(stats())
  // Espace insécable avant le signe, comme pour les prix.
  assert.equal(value(b, "18 depuis plus d'un mois"), '62\u00a0%')
  assert.equal(value(b, "Médiane d'ancienneté"), '47 j')
})

test('la baisse moyenne porte son délai', () => {
  assert.equal(
    value(seller.block(stats()), 'Baisse moyenne constatée'),
    '\u22123,2\u00a0% après 42 j en ligne',
  )
})

// Ne pas afficher un chiffre qui n'existe pas : tant qu'aucune baisse n'a été
// vue, la ligne dit qu'on n'en a pas vu, pas « 0 % ».
test("une baisse jamais observée se dit, elle ne se chiffre pas", () => {
  const b = seller.block(stats({ price_drop_listings: 0, price_drop_rate: null, price_drop_after_days: null }))
  assert.equal(value(b, 'Baisse moyenne constatée'), 'aucune encore observée')
})

// Une médiane sur trois annonces n'est pas une médiane : elle est marquée, et
// la note dit sur quoi elle est calculée.
test('les statistiques tirées de peu d’annonces sont marquées comme telles', () => {
  const b = seller.block(stats({ listings: 3, aged: 3, over_a_month: 1, over_a_month_share: 0.333, median_age_days: 12 }))
  assert.equal(b.rows.find((r) => r.label === "Médiane d'ancienneté").mark, '≈')
  assert.match(b.note, /3 annonces/)
})

test('un stock suffisant ne porte ni marque ni note', () => {
  const b = seller.block(stats())
  assert.equal(b.rows.every((r) => !r.mark), true)
  assert.equal(b.note, '')
})

// La baisse a sa propre population : neuf annonces baissées sur vingt-neuf
// suivies, c'est elle qui décide de la marque.
test('la baisse est jugée sur les annonces qui ont baissé, pas sur le stock', () => {
  const b = seller.block(stats({ price_drop_listings: 2, price_drop_rate: -0.05 }))
  assert.equal(b.rows.find((r) => r.label === 'Baisse moyenne constatée').mark, '≈')
})

test('un marchand sans raison commerciale garde un titre lisible', () => {
  assert.equal(seller.block(stats({ seller_name: null })).title, 'Ce vendeur')
})

test("sans relevé, il n'y a pas de bloc", () => {
  assert.equal(seller.block(null), null)
})

// L'appel est le signal : la popup demande, l'API répond ou ne connaît pas ce
// vendeur. Aucune des deux issues ne doit casser la fenêtre.
test('un vendeur inconnu de la base ne rend rien', async () => {
  const fetch404 = async () => ({ ok: false, status: 404 })
  assert.equal(await seller.fetch('http://api', 'adsc_x', 'lbc', '1', fetch404), null)
})

test('une API injoignable ne rend rien non plus', async () => {
  const dead = async () => { throw new TypeError('Failed to fetch') }
  assert.equal(await seller.fetch('http://api', 'adsc_x', 'lbc', '1', dead), null)
})

test('la demande porte la licence et le vendeur', async () => {
  const seen = []
  const ok = async (url, init) => (seen.push([url, init]), { ok: true, json: async () => stats() })
  const s = await seller.fetch('http://api', 'adsc_x', 'lbc', '73911', ok)
  assert.equal(seen[0][0], 'http://api/v1/sellers/lbc/73911')
  assert.equal(seen[0][1].headers.Authorization, 'Bearer adsc_x')
  assert.equal(s.seller_name, 'ENTREPOT 222')
})
