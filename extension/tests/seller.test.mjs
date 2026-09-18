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
  listings: 29, aged: 29, window_days: 30, over_a_month: 18,
  over_a_month_share: 0.621, median_age_days: 47, price_changed_listings: 12,
  price_drop_listings: 9, price_drop_rate: -0.032, price_drop_after_days: 42,
  ...over,
})

const value = (b, label) => (b.rows.find((r) => r.label === label) || {}).value

// « 29 annonces en ligne » se lisait comme le stock du marchand. C'en est
// notre échantillon : les annonces que nos navigations ont croisées et revues
// dans la fenêtre. Un marchand qui en tient deux cents dont nous connaissons
// vingt-neuf ne doit pas voir son stock annoncé à vingt-neuf.
test("le bloc dit ce qu'il compte : ce qu'adscope a vu, pas le stock", () => {
  const b = seller.block(stats())
  assert.equal(b.title, 'Ce vendeur — ENTREPOT 222')
  assert.equal(b.lead, '29 annonces de ce vendeur vues par adscope')
})

test("la portée dit la fenêtre et qu'on ne connaît pas le catalogue", () => {
  const b = seller.block(stats())
  assert.match(b.scope, /30 derniers jours/)
  assert.match(b.scope, /catalogue|stock/)
})

// La fenêtre est celle de l'API : un seul seuil, et la popup ne le réinvente
// pas. Sans elle, la portée ne prétend rien sur une durée.
test('la fenêtre affichée est celle que le relevé porte', () => {
  assert.match(seller.block(stats({ window_days: 45 })).scope, /45 derniers jours/)
})

test("la part au delà d'un mois porte sa population", () => {
  const b = seller.block(stats())
  // Espace insécable avant le signe, comme pour les prix.
  assert.equal(value(b, "18 sur 29 datées depuis plus d'un mois"), '62\u00a0%')
  assert.equal(value(b, "Médiane d'ancienneté"), '47 j')
})

// La part se rapporte aux annonces dont l'ancienneté est connue, pas au
// nombre vu : le libellé doit nommer la bonne population.
test("la population de la part est celle des annonces datées", () => {
  const b = seller.block(stats({ listings: 29, aged: 20, over_a_month: 12, over_a_month_share: 0.6 }))
  assert.equal(value(b, "12 sur 20 datées depuis plus d'un mois"), '60\u00a0%')
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
  const b = seller.block(stats({ price_changed_listings: 0, price_drop_listings: 0, price_drop_rate: null, price_drop_after_days: null }))
  assert.equal(value(b, 'Baisse moyenne constatée'), 'aucun prix n’a bougé sous nos yeux')
})

// Des prix ont bougé, aucun vers le bas : ce n'est pas la même chose que ne
// rien avoir vu bouger, et c'est ce que comptait `price_changed_listings` —
// calculé, rendu par l'API, jamais affiché jusqu'ici.
test('des changements sans baisse ne se taisent pas', () => {
  const b = seller.block(stats({ price_changed_listings: 4, price_drop_listings: 0, price_drop_rate: null, price_drop_after_days: null }))
  assert.equal(value(b, 'Baisse moyenne constatée'), 'aucune sur 4 changements de prix vus')
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

// La demande réseau (segment, encodage, authentification) n'est plus ici :
// `popup/seller.js` ne fait plus qu'un formatage pur depuis que `popup.js`
// relaie « Ce vendeur » au service worker, sur la même route que le panneau
// — `ADS.lookup.seller`, dans src/lookup.js, éprouvée par tests/lookup.test.mjs.
