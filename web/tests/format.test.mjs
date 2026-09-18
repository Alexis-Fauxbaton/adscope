// Le fuseau est posé avant tout usage de `Date` : sans cela, le même
// horodatage se lirait sur deux jours différents selon la machine qui capture.
process.env.TZ = 'Europe/Paris'

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  longDate, money, number, shortDate, signedMoney, siteLabel, spellAge, vehicleLine,
  vehicleTitle,
} from '../js/format.js'

const THIN = ' '
const NBSP = ' '

// Rouge sur le report `if (months >= 12) { years += 1; months = 0 }` de
// js/format.js : sans lui, 360 à 364 jours rendraient « 12 mois », et 1 821
// jours « 4 ans 12 mois ». Douze mois, c'est une année.
test('spellAge ne dit jamais « 12 mois », elle bascule sur l’année', () => {
  assert.equal(spellAge(359), '11 mois')
  assert.equal(spellAge(360), '1 an')
  assert.equal(spellAge(364), '1 an')
  assert.equal(spellAge(365), '1 an')
  assert.equal(spellAge(1821), '5 ans')
})

// Propriété générale : aucun jour d'ancienneté ne peut produire « 12 mois ».
test('aucune ancienneté de 0 à 4 000 jours ne s’écrit avec douze mois', () => {
  for (let n = 0; n <= 4000; n += 1) {
    assert.ok(!spellAge(n).includes('12 mois'), `${n} jours → ${spellAge(n)}`)
  }
})

test('spellAge dit les jours en dessous d’un mois, et l’accorde', () => {
  assert.equal(spellAge(0), "moins d'un jour")
  assert.equal(spellAge(1), '1 jour')
  assert.equal(spellAge(30), '30 jours')
  assert.equal(spellAge(412), '1 an 1 mois')
})

// Rouge sur la substitution `\B(?=(\d{3})+(?!\d))` de js/format.js : sans elle
// le prix s'écrirait « 22700 », que le marchand relit deux fois.
test('les milliers sont coupés par une espace fine insécable', () => {
  assert.equal(number(22700), `22${THIN}700`)
  assert.equal(number(999), '999')
  assert.equal(number(1810), `1${THIN}810`)
  assert.equal(money(22700), `22${THIN}700${NBSP}€`)
})

// Rouge sur le `if (rounded === 0) return money(0)` de js/format.js : sans ce
// garde-fou, une variation nulle s'écrirait « +0 € », donc une hausse.
test('signedMoney porte le signe d’une variation, jamais celui de zéro', () => {
  assert.equal(signedMoney(-1200), `−1${THIN}200${NBSP}€`)
  assert.equal(signedMoney(500), `+500${NBSP}€`)
  assert.equal(signedMoney(0), `0${NBSP}€`)
})

// Rouge sur les `getUTC*` de `parts()` dans js/format.js : avec `getDate()`,
// un horodatage du 16 à 23 h 30 UTC se lirait « 17 sept. » à Paris — un jour
// de décalage sur une baisse que le marchand date à la main.
test('les dates se lisent en UTC, pas au fuseau de la machine', () => {
  assert.equal(shortDate('2026-09-16T23:30:00Z'), '16 sept.')
  assert.equal(longDate('2026-09-16T23:30:00Z'), '16 septembre 2026')
})

// Rouge sur le `day === 1 ? '1er' : day` de js/format.js : « 1 septembre » ne
// s'écrit pas en français.
test('le premier du mois s’écrit « 1er »', () => {
  assert.equal(shortDate('2026-09-01T09:00:00Z'), '1er sept.')
  assert.equal(longDate('2026-08-01T09:00:00Z'), '1er août 2026')
  assert.equal(shortDate('2026-09-02T09:00:00Z'), '2 sept.')
})

// Rouge sur la table `SITES` de js/format.js. La base ne porte que `lbc` et
// `lc` (51 688 et 24 annonces le 18 septembre) : sans la table, la ligne du
// véhicule afficherait « lbc » au marchand.
test('le code du site se dit comme le site s’écrit, l’inconnu tel quel', () => {
  assert.equal(siteLabel('lbc'), 'leboncoin')
  assert.equal(siteLabel('lc'), 'La Centrale')
  assert.equal(siteLabel('autoscout'), 'autoscout')
})

// Rouge sur les `.filter(Boolean)` de js/format.js : la version n'est
// renseignée que sur une annonce sur trois, et l'absence ne se comble pas avec
// « undefined ».
test('le titre et la ligne du véhicule sautent ce que le site n’a pas donné', () => {
  const nu = { brand: 'Renault', model: 'Clio', year: 2021, site: 'lc' }
  assert.equal(vehicleTitle(nu), 'Renault Clio')
  assert.equal(vehicleLine(nu), '2021 · La Centrale')
  assert.equal(
    vehicleLine({ ...nu, mileage: 28410 }),
    `2021 · 28${THIN}410${NBSP}km · La Centrale`,
  )
})
