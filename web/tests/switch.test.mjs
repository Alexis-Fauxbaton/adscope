import test from 'node:test'
import assert from 'node:assert/strict'

// Même décor minimal que web/tests/market-list.test.mjs — juste ce que
// `el()`/`clear()` (js/dom.js) touchent. `checked`/`disabled`/`hidden` sont de
// simples propriétés : c'est ainsi que switch.js les lit et les écrit après
// la construction (jamais par attribut, pour ces trois-là).
class El {
  constructor(tag) {
    this.tag = tag; this.children = []; this.attrs = {}; this.handlers = {}; this.own = ''
    this.checked = false; this.disabled = false; this.hidden = false
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

const { renderSwitch } = await import('../js/switch.js')

// La structure posée par renderSwitch : div[label[input, piste, texte], erreur].
function build(opts) {
  const bloc = renderSwitch(opts)
  const label = bloc.children[0]
  return { bloc, input: label.children[0], erreur: bloc.children[1] }
}

// Simule le geste du lecteur : un clic bascule d'abord `checked`, puis émet
// `change` — dans cet ordre, comme un vrai navigateur.
async function toggle(input, to) {
  input.checked = to
  await input.handlers.change[0]()
}

// Rouge sur `input.checked = !value` du bloc `catch` de switch.js : sans lui,
// un refus de l'API laisserait l'interrupteur dans l'état que le lecteur
// vient de choisir, alors que rien n'a réellement changé côté serveur.
test('un onChange qui refuse fait revenir l’interrupteur en arrière', async () => {
  const { input } = build({
    id: 's', checked: true, content: 'Réglage',
    onChange: async () => { throw new Error('refus') },
  })
  await toggle(input, false)
  assert.equal(input.checked, true)
})

// Rouge sur `erreur.textContent = "..."; erreur.hidden = false` : sans eux,
// le refus resterait muet, sans aucun message à côté de l'interrupteur.
test('un onChange qui refuse affiche un message d’erreur', async () => {
  const { input, erreur } = build({
    id: 's', checked: true, content: 'Réglage',
    onChange: async () => { throw new Error('refus') },
  })
  await toggle(input, false)
  assert.equal(erreur.hidden, false)
  assert.match(erreur.textContent, /n'a pas été enregistré/)
})

// Rouge sur `finally { input.disabled = false }` : sans lui, l'interrupteur
// resterait bloqué après un refus — plus aucun geste possible sur ce réglage.
test('l’interrupteur redevient utilisable après un refus', async () => {
  const { input } = build({
    id: 's', checked: false, content: 'Réglage',
    onChange: async () => { throw new Error('refus') },
  })
  assert.equal(input.disabled, false)
  await toggle(input, true)
  assert.equal(input.disabled, false)
})

// Rouge sur `input.disabled = true` posé avant l'appel : pendant l'attente de
// l'API, le lecteur ne doit pas pouvoir re-cliquer et partir sur un second
// appel concurrent.
test('l’interrupteur se désactive pendant l’appel à onChange', async () => {
  let seenDuring = null
  const { input } = build({
    id: 's', checked: false, content: 'Réglage',
    onChange: async () => { seenDuring = input.disabled },
  })
  await toggle(input, true)
  assert.equal(seenDuring, true)
})

// Un onChange qui réussit ne revient jamais en arrière et ne montre pas
// l'erreur — le chemin heureux, à côté du chemin de refus ci-dessus.
test('un onChange qui réussit garde le nouvel état, sans message', async () => {
  const { input, erreur } = build({
    id: 's', checked: false, content: 'Réglage',
    onChange: async () => {},
  })
  await toggle(input, true)
  assert.equal(input.checked, true)
  assert.equal(erreur.hidden, true)
})
