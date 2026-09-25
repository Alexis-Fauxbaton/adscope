import test from 'node:test'
import assert from 'node:assert/strict'

// Même décor minimal qu'account-page.test.mjs : `suspension.js` ne construit
// que du DOM (jamais un rendu qui s'exécute à l'import), donc un faux
// `document` suffit — le réseau, lui, est intercepté au seul endroit réel :
// `fetch`.
class El {
  constructor(tag) {
    this.tag = tag; this.children = []; this.attrs = {}; this.handlers = {}; this.own = ''
    this.disabled = false
  }
  set className(v) { this.attrs.class = v }
  get className() { return this.attrs.class || '' }
  set textContent(v) { this.own = String(v); this.children = [] }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent || '').join('') : this.own }
  setAttribute(k, v) { this.attrs[k] = String(v) }
  addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn) }
  append(...nodes) { this.children.push(...nodes.filter(Boolean)) }
  replaceChildren(...nodes) { this.children = nodes.filter(Boolean) }
}
globalThis.document = { createElement: (t) => new El(t) }
globalThis.location = { search: '', origin: 'http://localhost:8000', href: 'http://localhost:8000/app/ecarts.html' }

const { actionFor, confirmLabel, renderSuspendControl } = await import('../js/suspension.js')

function licence(overrides = {}) {
  return { license_key_hash: 'abc123', label: 'Garage Leclerc', active: true, ...overrides }
}

// Rouge sur `lic.active ? 'suspend' : 'restore'` d'`actionFor` : une clé
// active ne propose jamais « rétablir ».
test('une clé active propose la suspension', () => {
  assert.equal(actionFor(licence()), 'suspend')
})

test('une clé suspendue propose le rétablissement', () => {
  assert.equal(actionFor(licence({ active: false })), 'restore')
})

// Rouge sur `if (!lic.license_key_hash) return null` d'`actionFor` : une clé
// supprimée (`label === 'clé supprimée'`) n'a pas d'empreinte à suspendre.
test('une clé supprimée ne propose rien', () => {
  const supprimee = licence({ license_key_hash: null })
  assert.equal(actionFor(supprimee), null)
  assert.equal(renderSuspendControl(supprimee, () => {}), null)
})

// Rouge sur le gabarit de `confirmLabel` : la confirmation doit nommer la
// clé, et seule la suspension prévient que ses appels seront refusés.
test('la confirmation nomme la clé', () => {
  assert.equal(confirmLabel(licence(), 'suspend'),
    'Suspendre Garage Leclerc ? Ses appels seront refusés.')
  assert.equal(confirmLabel(licence(), 'restore'), 'Rétablir Garage Leclerc ?')
})

// Rouge sur la transition `mode = 'idle'` du bouton Annuler : sans elle, un
// clic sur Annuler resterait sur la confirmation, ou déclencherait l'appel.
test('annuler referme la confirmation sans appel', () => {
  let calls = 0
  globalThis.fetch = async () => { calls++; return { status: 200, ok: true, json: async () => ({ active: false }) } }
  const wrap = renderSuspendControl(licence(), () => {})
  wrap.children[0].handlers.click[0]()
  const [, , annuler] = wrap.children[0].children
  annuler.handlers.click[0]()
  assert.equal(calls, 0)
  assert.equal(wrap.children[0].textContent, 'Suspendre cette clé')
})

// Rouge sur la branche `catch` d'`agir` (`suspension.js`) : un échec doit
// rendre la confirmation avec son message, jamais retomber sur le bouton
// idle comme si de rien n'était.
test('un échec rend l’état d’avant', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls++; return { status: 500, ok: false, json: async () => ({}) } }
  const lic = licence()
  const wrap = renderSuspendControl(lic, () => {})
  wrap.children[0].handlers.click[0]()
  const [, go] = wrap.children[0].children
  await go.handlers.click[0]()
  assert.equal(calls, 1)
  assert.equal(lic.active, true)
  const [label, erreur] = wrap.children[0].children
  assert.equal(label.textContent, confirmLabel(lic, 'suspend'))
  assert.match(erreur.textContent, /échoué/)
})
