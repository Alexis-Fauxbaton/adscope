import test from 'node:test'
import assert from 'node:assert/strict'
import { visitsLabel } from '../js/alerts-outbox.js'

// Rouge sur `if (!visits) return 'Pas encore ouvert'` : sans lui, un email
// jamais ouvert afficherait « — », qui ne dit pas si personne n'a cliqué ou
// si la page ne sait simplement pas compter.
test('un email jamais ouvert le dit en toutes lettres', () => {
  assert.equal(visitsLabel(0), 'Pas encore ouvert')
  assert.equal(visitsLabel(null), 'Pas encore ouvert')
  assert.equal(visitsLabel(undefined), 'Pas encore ouvert')
})

test('les visites s’accordent au pluriel', () => {
  assert.equal(visitsLabel(1), '1 visite')
  assert.equal(visitsLabel(2), '2 visites')
})
