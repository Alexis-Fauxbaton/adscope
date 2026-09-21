import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { searchPayload, suggestedName, validName } from '../js/save-search.js'
import { EMPTY_FILTERS, filterParams } from '../js/query.js'

// Rouge sur `raw.trim().length > 0` de `validName` : un nom vide ou tout en
// espaces ne doit pas pouvoir s'enregistrer.
test('un nom vide ou blanc n’est pas valide', () => {
  assert.equal(validName(''), false)
  assert.equal(validName('   '), false)
  assert.equal(validName('Clio IV'), true)
})

// Rouge sur `query: String(filterParams(filters))` de `searchPayload` :
// c'est le même sérialiseur que l'URL et les facettes — le site n'en a pas
// un second. Si la ligne divergeait (ex. un `JSON.stringify` maison), cette
// égalité tomberait.
test('la requête enregistrée est la même sérialisation que l’URL', () => {
  const filters = { ...EMPTY_FILTERS, brand: 'Renault', model: 'Clio', fuel: ['diesel'] }
  assert.equal(searchPayload('Ma recherche', filters).query, String(filterParams(filters)))
})

test('le nom enregistré est rogné', () => {
  assert.equal(searchPayload('  Clio  ', EMPTY_FILTERS).name, 'Clio')
})

// Rouge sur la composition de `suggestedName` (marque/modèle, puis
// carburant, puis département) : sans elle, la suggestion resterait vide ou
// dans le désordre demandé par le plan.
test('le nom suggéré compose marque, carburant et département', () => {
  const filters = { ...EMPTY_FILTERS, brand: 'Renault', model: 'Clio', fuel: ['diesel'], department: ['59', '62'] }
  assert.equal(suggestedName(filters), 'Renault Clio · diesel · dépt. 59, 62')
})

test('sans filtre, le nom suggéré retombe sur un générique', () => {
  assert.equal(suggestedName(EMPTY_FILTERS), 'Ma recherche')
})

// Statique, comme les sondes de `extension/tests/manifest-order.test.mjs` :
// le plan interdit d'appeler la boîte de dialogue native pour nommer une
// recherche (§10) — recherché en syntaxe d'appel, pour ne pas se déclencher
// sur la phrase qui l'interdit en commentaire.
test('aucun appel à la boîte de dialogue native dans save-search.js', () => {
  const source = readFileSync(new URL('../js/save-search.js', import.meta.url), 'utf8')
  assert.ok(!/\bprompt\s*\(/.test(source))
})
