import test from 'node:test'
import assert from 'node:assert/strict'
import { EMPTY_FILTERS } from '../js/query.js'

// `js/dom.js` (que `market-list.js` importe) appelle `document.createElement` :
// un DOM minimal, juste ce que `el()`/`clear()` touchent — même genre de
// décor que `extension/tests/stage.mjs`, réduit à ce dont ce fichier a besoin.
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.handlers = {}; this.own = '' }
  set className(v) { this.attrs.class = v }
  get className() { return this.attrs.class || '' }
  set textContent(v) { this.own = String(v); this.children = [] }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent || '').join('') : this.own }
  setAttribute(k, v) { this.attrs[k] = String(v) }
  addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn) }
  append(...nodes) { this.children.push(...nodes.filter(Boolean)) }
  replaceChildren(...nodes) { this.children = nodes.filter(Boolean) }
}
globalThis.document = {
  createElement: (t) => new El(t),
  createTextNode: (s) => ({ textContent: s }),
}

const { createList } = await import('../js/market-list.js')

// Rouge sur `if (enCours) return` de `charger` dans js/market-list.js : sans
// lui, un double clic sur « Voir plus » lit deux fois le même
// `state.items.length` avant que le premier appel ne réponde, et demande
// deux fois la même page à l'API (code-quality-reviewer, /audit-project,
// web/js/market-list.js:46).
test('un double clic sur « Voir plus » ne demande qu’une seule page', () => {
  let calls = 0
  globalThis.fetch = () => { calls++; return new Promise(() => {}) } // ne répond jamais : la garde se juge avant tout `await`
  globalThis.location = { search: '', origin: 'http://localhost:8000' }
  const state = { items: [{}], total: 40, filters: { ...EMPTY_FILTERS } }
  const charger = createList({ state, zone: {}, etiquette: {}, auth: () => {}, onClear: () => {} })
  charger(true)
  charger(true)
  assert.equal(calls, 1)
})

// La garde ne doit pas bloquer un « Voir plus » suivant, une fois le premier
// appel résolu : sans le `finally { enCours = false }`, tout appel ultérieur
// resterait sans effet pour le reste de la session.
test('le prochain « Voir plus » fonctionne une fois le premier chargement résolu', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    return { ok: true, status: 200, json: async () => ({ total: 0, items: [] }) }
  }
  globalThis.location = { search: '', origin: 'http://localhost:8000' }
  const zone = new El('div')
  const etiquette = new El('p')
  const state = { items: [], total: 0, filters: { ...EMPTY_FILTERS } }
  const charger = createList({ state, zone, etiquette, auth: () => {}, onClear: () => {} })
  await charger(true)
  await charger(true)
  assert.equal(calls, 2)
})
