import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { FICHES, fiche, results } from './lc-page.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
require(join(here, '../src/sites.js'))
require(join(here, '../src/sites/read.js'))
require(join(here, '../src/sites/vehicle-fields.js'))
const site = require(join(here, '../src/sites/lacentrale.js'))
const { fromScripts } = site

// Journal de l'API sur 563 annonces réelles du 2026-09-19 (.superpowers/lc-carburants.md) :
// les valeurs brutes vues chez La Centrale et leur case dans le vocabulaire fermé. Chaque
// couple casse `FUEL` dans src/sites/lacentrale.js (ligne où la clé est retirée) sans toucher
// à autre chose : la traduction, pas la lecture qui la porte.
const OBSERVED = [
  ['PLUGIN_HYBRID_ESSENCE_ELECTRIC', 'hybride_rechargeable'],
  ['HYBRID_ESSENCE_ELECTRIC', 'hybride'],
  ['ELECTRIC', 'electrique'],
  ['BIO_ESSENCE_GPL', 'gpl'],
  ['PLUGIN_HYBRID_DIESEL_ELECTRIC', 'hybride_rechargeable'],
  // Lot F2 (2026-09-22) : l'éthanol entre au vocabulaire fermé (`api/adscope_api/vocab.py`) ;
  // ce couple, qui partait en `autre`, gagne sa case dans `FUEL`.
  ['BICARBURATION_ESSENCE_BIOETHANOL', 'ethanol'],
]

const cardFor = (energy) => {
  const c = { reference: 'W1', customerType: 'PRO', price: 100, firstOnlineDate: '2026-01-01T00:00:00.000Z', energy }
  return fromScripts(results([c]))[0]
}
const detailFor = (energy) => fromScripts(fiche(FICHES.uncapped, { energy }))[0]

for (const [raw, canon] of OBSERVED) {
  test(`la carte traduit ${raw} en ${canon}`, () => {
    assert.equal(cardFor(raw).fuel, canon)
  })
  test(`la fiche traduit ${raw} en ${canon}`, () => {
    assert.equal(detailFor(raw).fuel, canon)
  })
}

// Par symétrie avec HYBRID_ESSENCE_ELECTRIC : jamais vu chez La Centrale, ajouté quand même
// (marqué en commentaire dans la table). Casse la ligne `HYBRID_DIESEL_ELECTRIC: 'hybride'`
// pour vérifier que ce test rougit.
test('HYBRID_DIESEL_ELECTRIC (non observé) est traduit par symétrie', () => {
  assert.equal(cardFor('HYBRID_DIESEL_ELECTRIC').fuel, 'hybride')
  assert.equal(detailFor('HYBRID_DIESEL_ELECTRIC').fuel, 'hybride')
})

// Le mécanisme qui a produit ce lot : une valeur hors table part telle quelle, brute — c'est
// ainsi que le journal de l'API a vu ces codes. Casse `canon` (le repli sur `fallback`) pour
// vérifier que ce test rougit ; `MYSTERE` n'a jamais été vu ni ajouté à `FUEL`.
test('une valeur inconnue part brute, non traduite', () => {
  assert.equal(cardFor('MYSTERE').fuel, 'MYSTERE')
  assert.equal(detailFor('MYSTERE').fuel, 'MYSTERE')
})

// ESSENCE/DIESEL restent traduits : le lot n'a rien cassé de l'existant.
test('ESSENCE et DIESEL restent traduits comme avant', () => {
  assert.equal(cardFor('ESSENCE').fuel, 'essence')
  assert.equal(detailFor('DIESEL').fuel, 'diesel')
})
