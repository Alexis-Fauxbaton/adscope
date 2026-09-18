import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
globalThis.ADS = undefined
const format = require(join(here, '../src/format.js'))

// Le mois de `duration` est une approximation à 30 jours : un reste de 360 à
// 364 vaut déjà 12. Rouge sur le `Math.floor(n / 30)` de src/format.js sans le
// garde-fou qui le suit — il rendrait « 12 mois » sur ces quatre jours-là,
// alors qu'à douze mois on est déjà dans l'année suivante.
test("duration() ne dit jamais « 12 mois », elle bascule sur l'année", () => {
  assert.equal(format.duration(359), '11 mois')
  assert.equal(format.duration(360), '1 an')
  assert.equal(format.duration(364), '1 an')
  assert.equal(format.duration(365), '1 an')
})

// Même défaut, côté `spell` : son reste se calcule pareil, à 30 jours près.
// Rouge sur le `Math.floor((n - years * 365) / 30)` de src/format.js sans le
// report qui suit — 1 821 jours (4 ans pile plus un reste de 361) rendrait
// « 4 ans 12 mois » au lieu de « 5 ans ».
test("spell() reporte un reste de douze mois sur l'année, jamais ne l'affiche", () => {
  assert.equal(format.spell(359), '11 mois')
  assert.equal(format.spell(360), '1 an')
  assert.equal(format.spell(364), '1 an')
  assert.equal(format.spell(365), '1 an')
  assert.equal(format.spell(1820), '5 ans')
  assert.equal(format.spell(1821), '5 ans')
  assert.equal(format.spell(1824), '5 ans')
  assert.equal(format.spell(1825), '5 ans')
})

// Propriété générale, sur toute la plage d'ancienneté qu'une annonce
// traverse : ni l'une ni l'autre fonction ne doit jamais rendre « 12 mois »,
// quel que soit le jour exact où le reste de 30 jours franchit ce seuil.
test('« 12 mois » ne paraît jamais, dans aucune des deux formes', () => {
  for (let n = 1; n <= 3650; n++) {
    assert.doesNotMatch(format.duration(n), /12 mois/, `duration(${n})`)
    assert.doesNotMatch(format.spell(n), /12 mois/, `spell(${n})`)
  }
})
