import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
// Les mots affichés sont ceux du site de la page ouverte : le registre les
// résout par son origine, et ces libellés-ci sont ceux de leboncoin.
globalThis.location = { origin: 'https://www.leboncoin.fr' }
require(join(here, '../src/sites.js'))
require(join(here, '../src/sites/read.js'))
require(join(here, '../src/sites/vehicle-fields.js'))
const { normalize, signals, claim } = require(join(here, '../src/sites/leboncoin.js'))
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

// Les signaux, écrits à la main : la hiérarchie d'affichage se juge sur des cas
// que la fixture — une page de résultats fraîche — ne contient pas.
const OLD = { onlineDays: 2235, bumped: true, bumpedDaysAgo: 2, notable: true, dormant: false }
const DORMANT = { onlineDays: 45, bumped: false, bumpedDaysAgo: null, notable: false, dormant: true }

test('la pastille dit « réactualisée », jamais « remontée »', () => {
  const [, s] = of('3254194817')
  const { page } = view.badge(s, null)
  assert.match(page, /réactualisée il y a 2 j/)
  assert.ok(!page.includes('remont'))
})

test("la durée se lit d'abord, la réactualisation ensuite", () => {
  const [, s] = of('3254194817')
  const { page } = view.badge(s, null)
  assert.equal(page, '14 j en ligne · ⟳ réactualisée il y a 2 j')
  assert.ok(page.indexOf('en ligne') < page.indexOf('réactualisée'))
})

test("l'annonce ancienne encore poussée se lit comme telle", () => {
  assert.equal(view.badge(OLD, null).page, '6 ans en ligne · ⟳ encore réactualisée il y a 2 j')
})

test("l'annonce jamais réactualisée dit sa seule durée", () => {
  assert.equal(view.badge(DORMANT, null).page, '1 mois en ligne')
})

test('sans API la pastille tient avec la seule page', () => {
  const [, s] = of('3254194817')
  assert.deepEqual(view.badge(s, null), view.badge(s, undefined))
  assert.equal(view.badge(s, null).tracked, null)
})

// La flèche de la carte : le montant seul, en valeur absolue, sans le délai que
// porte la ligne du panneau. Rouge sur `fall` de src/view.js — la rendre par
// `drop` y ramènerait « ▼ −800 € en 12 j ».
test('la baisse de prix vient des signaux et s\'ajoute à la pastille', () => {
  const [, s, r] = of('3254194817')
  assert.equal(view.badge(s, r).tracked, `↓ 800${NB}€`)
  assert.ok(!view.badge(s, r).tracked.includes('−'))
})

// Rien à afficher sans baisse : une hausse, un prix stable, aucun suivi. Rouge
// sur la condition `price_delta_since_first < 0` de `fall`.
test("sans baisse, la carte ne porte aucune flèche", () => {
  const [, s] = of('3254194817')
  assert.equal(view.fall(null), null)
  assert.equal(view.fall({ price_delta_since_first: 0 }), null)
  assert.equal(view.fall({ price_delta_since_first: 500 }), null)
  assert.equal(view.badge(s, { price: 29190 }).tracked, null)
})

test('la pastille sépare la page du suivi en deux fragments', () => {
  const [, s, r] = of('3254194817')
  const b = view.badge(s, r)
  // Ce que dit la page ne porte jamais la baisse, qui suppose une observation
  // antérieure ; l'inverse non plus.
  assert.ok(!b.page.includes('↓'))
  assert.ok(!b.tracked.includes('en ligne'))
  assert.deepEqual(Object.keys(b), ['page', 'tracked'])
})

test('une hausse ou un prix stable ne produit aucune baisse', () => {
  const [l, s, r] = of('3250252623')
  assert.equal(view.drop(r), null)
  assert.equal(view.drop({ price_delta_since_first: 500, price_delta_days_since_first: 3 }), null)
  assert.equal(view.drop(null), null)
})

// La contradiction est nommée par le site, jamais par le code partagé : lui
// seul sait ce que sa page affiche de faux.
test('le site nomme la contradiction que sa page affiche', () => {
  const [, s] = of('3254194817')
  const said = claim(s, "aujourd'hui à 21:14")
  assert.equal(said.label, 'leboncoin affiche')
  assert.equal(said.says, "aujourd'hui à 21:14")
  assert.match(said.note, /réactualisation/)
})

test("sans réactualisation ou sans date lue, aucune contradiction n'est inventée", () => {
  const [, s] = of('3254194817')
  assert.equal(claim(s, null), null)
  const calm = normalize({
    list_id: 7, price: [1], owner: { type: 'pro' }, attributes: [],
    first_publication_date: '2026-09-01 10:00:00', index_date: '2026-09-01 10:02:00',
  })
  assert.equal(claim(signals(calm, NOW), "aujourd'hui à 21:14"), null)
})

// Ce que le suivi mutualisé ajoute à la page, et qui ne s'y lit nulle part :
// depuis quand on regarde, combien de fois, et ce que le prix a fait.
test('le suivi se compte en relevés, jamais en impressions', () => {
  const [, , r] = of('3254194817')
  assert.deepEqual(view.tracking(r), [
    { label: 'Suivie depuis', value: '12 j · 3 vues' },
    { label: 'Prix', value: `29${NARROW}190${NB}€  ▼ −800${NB}€ en 12 j`, strong: true },
  ])
})

test('un prix inchangé se dit « stable depuis », pas « aucun changement »', () => {
  const [, , r] = of('3250252623')
  assert.deepEqual(view.tracking(r), [
    { label: 'Suivie depuis', value: '5 j · 1 vue' },
    { label: 'Prix', value: 'stable depuis 5 j' },
  ])
})

test("sans signaux, le suivi ne dit rien plutôt que zéro", () => {
  assert.deepEqual(view.tracking(null), [])
})

test('les montants portent les espaces insécables du français', () => {
  const { money } = require(join(here, '../src/format.js'))
  assert.equal(money(-1000), `1${NARROW}000${NB}€`)
  assert.equal(money(800), `800${NB}€`)
})

// Un prix stable ne vaut que ce que valent les observations qui l'ont vu :
// vérifié chaque semaine, il dit quelque chose ; jamais revérifié depuis deux
// mois, il ne dit rien de plus que « on n'a pas regardé ».
const stable = (over) => ({
  price: 9900, stable_days: 56, price_checks: 8, price_gap_days: 7,
  price_delta_since_first: null, tracked_days: 56, observations: 60, ...over,
})

const priceOf = (r) => view.tracking(r).find((x) => x.label === 'Prix').value

test('un prix stable vérifié chaque semaine le dit', () => {
  assert.equal(priceOf(stable()), 'stable depuis 1 mois · vérifié chaque semaine')
})

// L'échantillonnage au jour rend `price_gap_days` exact. La même annonce revue
// tous les jours affichait sept — l'écart entre deux écritures hebdomadaires,
// pas ce qu'elle avait vécu — et affiche un. Sans ce libellé, la finesse gagnée
// resterait invisible au lecteur.
test('un prix stable vérifié chaque jour le dit', () => {
  assert.equal(
    priceOf(stable({ price_checks: 56, price_gap_days: 1 })),
    'stable depuis 1 mois · vérifié chaque jour',
  )
})

// Deux jours d'écart, ce n'est déjà plus « chaque jour » : le seuil ne se
// laisse pas arrondir vers le haut, il vaut un jour et pas deux.
test('deux jours d\'écart et la cadence redevient hebdomadaire', () => {
  assert.equal(
    priceOf(stable({ price_checks: 28, price_gap_days: 2 })),
    'stable depuis 1 mois · vérifié chaque semaine',
  )
})

test('un prix stable que personne n\'a revérifié le dit aussi', () => {
  assert.equal(
    priceOf(stable({ price_checks: 0, price_gap_days: 56 })),
    'stable depuis 1 mois · jamais revérifié',
  )
})

// Le trou du milieu : revu depuis, mais six semaines sans témoin pendant
// lesquelles le prix a pu bouger et revenir.
test('un trou dans le suivi se nomme, il ne se tait pas', () => {
  assert.equal(
    priceOf(stable({ price_checks: 2, price_gap_days: 43 })),
    'stable depuis 1 mois · non vérifié pendant 1 mois',
  )
})

test("un prix frais ne s'encombre d'aucune mention", () => {
  assert.equal(priceOf(stable({ stable_days: 5, price_checks: 0, price_gap_days: 5 })), 'stable depuis 5 j')
})

// Le cache garde des signaux d'avant l'échantillonnage : sans les deux nombres,
// la ligne ne doit rien affirmer.
test('un relevé sans échantillonnage ne prétend rien sur la vérification', () => {
  const old = stable()
  delete old.price_checks
  delete old.price_gap_days
  assert.equal(priceOf(old), 'stable depuis 1 mois')
})

test('une baisse reste une baisse, la vérification ne la commente pas', () => {
  const [, , r] = of('3254194817')
  assert.equal(priceOf(r), `29${NARROW}190${NB}€  ▼ −800${NB}€ en 12 j`)
})

// La ligne grise sous la courbe du panneau : la même cadence que `tracking`
// calcule pour le prix, mais dite de l'annonce suivie — au féminin. Rouge sur
// le `checked(r, true)` de `legend` : sans le `true`, elle dirait « vérifié »,
// l'accord masculin de `tracking`.
test('la légende du panneau accorde la vérification au féminin de l’annonce suivie', () => {
  assert.equal(view.legend(stable()), 'Suivie depuis 1 mois · vérifiée chaque semaine')
  assert.equal(
    view.legend(stable({ price_checks: 56, price_gap_days: 1 })),
    'Suivie depuis 1 mois · vérifiée chaque jour',
  )
})

// Rouge sur le `r.tracked_days != null` de `legend` : sans lui, un suivi vide
// écrirait « Suivie depuis moins d'un jour » au lieu de se taire.
test('sans suivi observé, la légende du panneau ne dit rien', () => {
  assert.equal(view.legend(null), '')
  assert.equal(view.legend({}), '')
})
