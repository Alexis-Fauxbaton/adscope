import test from 'node:test'
import assert from 'node:assert/strict'

// Même décor minimal que switch.test.mjs, plus `location`/`fetch` : le
// changement de mot de passe traverse `api-auth.js` → `api.js` → `fetch`,
// jamais mocké au niveau du module (le site n'a pas d'outil de mock de
// module ; on intercepte au seul endroit réel : le réseau).
class El {
  constructor(tag) {
    this.tag = tag; this.children = []; this.attrs = {}; this.handlers = {}; this.own = ''
    this.value = ''; this.disabled = false; this.hidden = false
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
globalThis.location = { search: '', origin: 'http://localhost:8000', href: 'http://localhost:8000/app/' }

const { renderCompte } = await import('../js/account-page.js')

// La page tient tout dans une seule `<div class="pile">` : deux champs
// (courant, nouveau), le bouton, l'erreur, le succès — retrouvés par
// position, comme le reste des tests de vues du site.
function build(state = { email: 'karim@garage.fr' }) {
  const root = new El('div')
  renderCompte(root, state)
  const pile = root.children[0]
  const [, motDePasse] = pile.children
  const [champActuel, champNouveau, , bouton] = motDePasse.children[1].children
  const [erreur, succes] = motDePasse.children.slice(2)
  return {
    root, form: motDePasse.children[1],
    actuel: champActuel.children[0], nouveau: champNouveau.children[0],
    bouton, erreur, succes,
  }
}

async function submit(form) {
  await form.handlers.submit[0]({ preventDefault() {} })
}

// Rouge sur `if (!current || !password) return` de account-page.js : un champ
// vide ne doit déclencher aucun appel réseau.
test('la soumission avec un champ vide n’appelle pas l’API', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls++; return { status: 204, ok: true, json: async () => null } }
  const { actuel, nouveau, form } = build()
  actuel.value = 'ancien'
  nouveau.value = ''
  await submit(form)
  assert.equal(calls, 0)
})

// Rouge sur `succes.hidden = false` (et les deux remises à vide) : sans eux,
// un changement réussi ne le dirait pas, et les champs garderaient les mots
// de passe affichés.
test('un changement réussi affiche le message et vide les champs', async () => {
  globalThis.fetch = async () => ({ status: 204, ok: true, json: async () => null })
  const { actuel, nouveau, form, succes, erreur } = build()
  actuel.value = 'ancien-mdp'
  nouveau.value = 'nouveau-mdp-1234'
  await submit(form)
  assert.equal(succes.hidden, false)
  assert.equal(erreur.hidden, true)
  assert.equal(actuel.value, '')
  assert.equal(nouveau.value, '')
})

// Rouge sur `erreur.textContent = err.message || ...` : le message précis de
// l'API (mot de passe actuel refusé) doit s'afficher, pas un texte générique.
test('un échec affiche le message renvoyé par l’API', async () => {
  globalThis.fetch = async () => ({
    status: 401, ok: false, json: async () => ({ detail: 'Mot de passe actuel incorrect.' }),
  })
  const { actuel, nouveau, form, erreur, succes } = build()
  actuel.value = 'mauvais'
  nouveau.value = 'nouveau-mdp-1234'
  await submit(form)
  assert.equal(erreur.hidden, false)
  assert.equal(erreur.textContent, 'Mot de passe actuel incorrect.')
  assert.equal(succes.hidden, true)
})

// Rouge sur `bouton.disabled = true` posé avant l'appel : sans lui, un second
// clic pendant l'attente partirait sur un appel concurrent.
test('le bouton se désactive pendant l’appel à l’API', async () => {
  let seenDuring = null
  let bouton
  globalThis.fetch = async () => { seenDuring = bouton.disabled; return { status: 204, ok: true, json: async () => null } }
  const built = build()
  bouton = built.bouton
  built.actuel.value = 'ancien'
  built.nouveau.value = 'nouveau-mdp-1234'
  await submit(built.form)
  assert.equal(seenDuring, true)
  assert.equal(bouton.disabled, false)
})
