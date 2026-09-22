import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_PAGES, parsePages } from '../js/balayage.js'

// Rouge sur `raw < 1` de `parsePages` dans js/balayage.js : sans lui, une URL
// trafiquée (`?pages=0` ou `?pages=abc`) enverrait une valeur que l'API
// refuse (`get_sweep` exige `ge=1`), et la page resterait plantée.
test('un budget absent ou absurde retombe sur le défaut', () => {
  assert.equal(parsePages(''), 120)
  assert.equal(parsePages('?pages=abc'), 120)
  assert.equal(parsePages('?pages=0'), 120)
  assert.equal(parsePages('?pages=-5'), 120)
})

// Rouge sur le `Math.min(…, MAX_PAGES)` de js/balayage.js : le contrat de
// l'API (`get_sweep`) refuse au-delà de 400.
test('le budget est borné à ce que l’API accepte', () => {
  assert.equal(parsePages('?pages=1000'), MAX_PAGES)
  assert.equal(parsePages('?pages=60'), 60)
})
