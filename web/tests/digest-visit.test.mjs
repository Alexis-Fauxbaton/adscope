import test from 'node:test'
import assert from 'node:assert/strict'
import { tokenFromSearch, withoutD } from '../js/digest-visit.js'

// Rouge sur `new URLSearchParams(search).get('d')` de `tokenFromSearch` :
// sans elle, le jeton d'un lien d'email ne se lirait jamais.
test('le jeton se lit dans la query string, pas dans le fragment', () => {
  assert.equal(tokenFromSearch('?d=abc123'), 'abc123')
  assert.equal(tokenFromSearch(''), null)
})

// Rouge sur `url.searchParams.delete('d')` de `withoutD` : sans elle, un
// rechargement de page recompterait une visite — et sur `+ url.hash`, sans
// lequel la route (`#/suivis`) se perdrait au passage.
test('l’URL nettoyée perd « d » mais garde la route', () => {
  assert.equal(withoutD('http://localhost:8000/app/?d=abc123#/suivis'), '/app/#/suivis')
})

test('les autres paramètres de la query string survivent', () => {
  assert.equal(withoutD('http://localhost:8000/app/?d=abc123&demo=1#/marche'), '/app/?demo=1#/marche')
})

test('sans « d » à retirer, l’URL ne change pas de forme', () => {
  assert.equal(withoutD('http://localhost:8000/app/#/alertes'), '/app/#/alertes')
})

// La minuterie n'a rien à voir ici — le module ne lit jamais l'horloge, ce
// que ce fichier vérifie par construction : aucun de ses tests ne passe par
// `Date.now()` ni `new Date()` sans argument.
test('runDigestVisit ne fait rien en mode démo', async () => {
  let compteur = 0
  globalThis.location = { search: '?demo=1&d=abc', href: 'http://localhost:8000/app/?demo=1&d=abc#/marche', origin: 'http://localhost:8000' }
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {} }, configurable: true })
  globalThis.fetch = async () => { compteur += 1; return { status: 204, ok: true, json: async () => null } }
  globalThis.history = { replaceState: () => { compteur += 1000 } }
  const { runDigestVisit } = await import(`../js/digest-visit.js?t=demo`)
  runDigestVisit()
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(compteur, 0)
})

// Rouge sur `digestVisit(token).catch(() => {})` puis
// `history.replaceState(null, '', withoutD(location.href))` : sans le
// premier, aucune visite n'est comptée ; sans le second, un rechargement en
// recompterait une.
test('hors démo, une visite est postée une fois et l’URL est nettoyée', async () => {
  const appels = []
  globalThis.location = { search: '?d=abc', href: 'http://localhost:8000/app/?d=abc#/marche', origin: 'http://localhost:8000' }
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {} }, configurable: true })
  globalThis.fetch = async (url) => { appels.push(url); return { status: 204, ok: true, json: async () => null } }
  const replaces = []
  globalThis.history = { replaceState: (_s, _t, url) => replaces.push(url) }
  const { runDigestVisit } = await import(`../js/digest-visit.js?t=reel`)
  runDigestVisit()
  await new Promise((r) => setTimeout(r, 0))
  assert.deepEqual(appels, ['/v1/digests/visit'])
  assert.deepEqual(replaces, ['/app/#/marche'])
})
