import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_LIMIT, forgetQueue, initialView, parseLimit, readQueue, writeQueue,
} from '../js/revisits.js'

// Un `sessionStorage` de test : mêmes trois méthodes, un `Map` derrière.
function storage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  }
}

// Rouge sur le `raw < 1` de `parseLimit` dans js/revisits.js : sans lui, une
// URL trafiquée (`?limit=0` ou `?limit=abc`) enverrait une valeur que l'API
// refuse (`RevisitIn.limit` exige `ge=1`), et la page resterait plantée.
test('une limite absente ou absurde retombe sur le défaut', () => {
  assert.equal(parseLimit(''), 40)
  assert.equal(parseLimit('?limit=abc'), 40)
  assert.equal(parseLimit('?limit=0'), 40)
  assert.equal(parseLimit('?limit=-5'), 40)
})

// Rouge sur le `Math.min(…, MAX_LIMIT)` de js/revisits.js : le contrat de
// l'API (`RevisitIn.limit`) refuse au-delà de 100.
test('la limite est bornée à ce que l’API accepte', () => {
  assert.equal(parseLimit('?limit=250'), MAX_LIMIT)
  assert.equal(parseLimit('?limit=25'), 25)
})

// Rouge sur le `if (!hasLicense) return 'no-license'` de js/revisits.js : sans
// licence rangée, la page n'a rien à demander à l'API.
test('sans licence, la page ne montre ni bouton ni file', () => {
  assert.equal(initialView(false, null), 'no-license')
  assert.equal(initialView(false, [{ url: 'x' }]), 'no-license')
})

// Rouge sur le `if (cachedQueue) return 'queue'` de js/revisits.js : une file
// déjà obtenue ce run doit se réafficher, jamais se redemander — y compris
// quand elle est vide (`[]` reste une réponse valide de l'API).
test('une file déjà en cache se réaffiche plutôt que de se redemander', () => {
  assert.equal(initialView(true, null), 'idle')
  assert.equal(initialView(true, []), 'queue')
  assert.equal(initialView(true, [{ url: 'x' }]), 'queue')
})

test('le cycle écrire / lire / oublier de la file tient sur sessionStorage', () => {
  const s = storage()
  assert.equal(readQueue(s), null)
  const items = [{ site: 'lbc', site_id: '123', url: 'https://x/123' }]
  writeQueue(s, items)
  assert.deepEqual(readQueue(s), items)
  forgetQueue(s)
  assert.equal(readQueue(s), null)
})

// Rouge sur la signature de `writeQueue` dans js/revisits.js : elle ne prend
// que des items, jamais de licence — la clé n'a donc structurellement aucun
// chemin vers `sessionStorage` par ce module.
test('rien de ce qui ressemble à une clé n’entre dans le stockage de la file', () => {
  const s = storage()
  writeQueue(s, [{ site: 'lbc', site_id: '123', url: 'https://x/123' }])
  const raw = s.getItem('adscope.revisits.queue')
  assert.ok(!/bearer|adsc_|authorization/i.test(raw))
})
