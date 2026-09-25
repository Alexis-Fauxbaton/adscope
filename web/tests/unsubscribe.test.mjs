import test from 'node:test'
import assert from 'node:assert/strict'

// Même décor minimal que switch.test.mjs/account-page.test.mjs : juste ce que
// `el()`/`clear()` touchent.
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.own = '' }
  set className(v) { this.attrs.class = v }
  get className() { return this.attrs.class || '' }
  set textContent(v) { this.own = String(v); this.children = [] }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent || '').join('') : this.own }
  setAttribute(k, v) { this.attrs[k] = String(v) }
  addEventListener() {}
  append(...nodes) { this.children.push(...nodes.filter(Boolean)) }
  replaceChildren(...nodes) { this.children = nodes.filter(Boolean) }
}
globalThis.document = { createElement: (t) => new El(t) }
globalThis.location = { search: '', origin: 'http://localhost:8000', href: 'http://localhost:8000/app/desabonnement' }

const { render, tokenFromSearch } = await import('../js/unsubscribe.js')

// La carte, seule chose que `render` ajoute sous l'entête : son texte, et si
// un lien de retour vers « Mes alertes » l'accompagne.
function carte(root) {
  const zone = root.children[0]
  const div = zone.children.at(-1)
  return { texte: div.children[0].textContent, retour: div.children.length > 1 }
}

// Rouge sur `new URLSearchParams(search).get('t')` de `tokenFromSearch` :
// sans lui, aucun jeton ne serait jamais lu dans l'URL du pied d'email.
test('tokenFromSearch lit le paramètre « t », absent sinon', () => {
  assert.equal(tokenFromSearch('?t=abc123'), 'abc123')
  assert.equal(tokenFromSearch(''), null)
  assert.equal(tokenFromSearch('?autre=1'), null)
})

// Rouge sur `if (!token) { zone.append(carte('Lien invalide.')); return }` :
// sans jeton dans l'URL, aucun appel réseau ne doit partir.
test('sans jeton, un lien invalide s’affiche sans appeler l’API', async () => {
  globalThis.location.search = ''
  globalThis.fetch = () => { throw new Error('ne doit jamais être appelé') }
  const root = new El('div')
  await render(root)
  const { texte, retour } = carte(root)
  assert.equal(texte, 'Lien invalide.')
  assert.equal(retour, false)
})

// Rouge sur `await unsubscribe(token); zone.append(carte("...matin.", true))` :
// un désabonnement réussi doit le dire, et offrir la réactivation.
test('un jeton valide affiche la confirmation et le lien de réactivation', async () => {
  globalThis.location.search = '?t=bon-jeton'
  globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => ({}) })
  const root = new El('div')
  await render(root)
  const { texte, retour } = carte(root)
  assert.equal(texte, "Vous ne recevrez plus l'email du matin.")
  assert.equal(retour, true)
})

// Rouge sur `catch { zone.append(carte('Lien invalide ou déjà expiré.')) }` :
// un jeton refusé par l'API doit le dire, sans lien de réactivation (aucune
// session ici pour la justifier).
test('un jeton refusé affiche « invalide ou expiré », sans lien de réactivation', async () => {
  globalThis.location.search = '?t=vieux-jeton'
  globalThis.fetch = async () => ({ status: 404, ok: false, json: async () => ({}) })
  const root = new El('div')
  await render(root)
  const { texte, retour } = carte(root)
  assert.equal(texte, 'Lien invalide ou déjà expiré.')
  assert.equal(retour, false)
})
