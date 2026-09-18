import test from 'node:test'
import assert from 'node:assert/strict'

// `js/api.js` lit `location` et `localStorage` à l'import (la purge) et à
// l'appel (`isDemo`). Aucun des deux n'existe tel quel sous Node : on les pose
// avant chaque import, et l'import se fait avec une requête différente à
// chaque fois pour forcer une ré-exécution — sinon le module, mis en cache,
// ne relirait jamais ces globals.
let compteur = 0

function storage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  }
}

async function loadApi({ search = '', ls = storage() } = {}) {
  globalThis.location = { search }
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true })
  compteur += 1
  return { api: await import(`../js/api.js?t=${compteur}`), ls }
}

// Rouge sur le `localStorage.removeItem(OLD_LICENSE_KEY)` en tête de
// js/api.js : sans lui, une clé de licence posée avant la migration vers la
// connexion par email resterait pour toujours dans le navigateur du marchand.
test('l’ancienne clé de licence est purgée au chargement', async () => {
  const { ls } = await loadApi({ ls: storage({ 'adscope.license': 'adsc_old' }) })
  assert.equal(ls.getItem('adscope.license'), null)
})

// Rouge sur le `if (WRITE_METHODS.has(method))` de `buildRequest` dans
// js/api.js : sans lui, une lecture authentifiée par cookie porterait
// `X-Adscope`, ou une écriture ne le porterait pas — dans les deux cas la
// protection CSRF décrite dans le contrat ne tient plus.
test('X-Adscope ne se pose que sur ce qui écrit', async () => {
  const { api } = await loadApi()
  const lecture = api.buildRequest('/v1/me')
  assert.equal(lecture.init.headers['X-Adscope'], undefined)
  assert.equal(lecture.init.credentials, 'same-origin')
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const ecriture = api.buildRequest('/v1/revisits', { method })
    assert.equal(ecriture.init.headers['X-Adscope'], '1')
    assert.equal(ecriture.init.credentials, 'same-origin')
  }
})

// Rouge sur le `credentials: 'same-origin'` de `buildRequest` : sans lui, le
// cookie `adscope_session` ne partirait jamais avec la requête, et toute
// route protégée répondrait 401 même connecté.
test('le cookie de session part sur toute requête, sans qu’on la construise avec une clé', async () => {
  const { api } = await loadApi()
  const { url, init } = api.buildRequest('/v1/revisits', {
    method: 'POST', body: { site: 'lbc', limit: 5 },
  })
  assert.equal(url, '/v1/revisits')
  assert.equal(init.credentials, 'same-origin')
  assert.ok(!/bearer|adsc_|authorization/i.test(JSON.stringify(init.headers)))
  assert.ok(!/bearer|adsc_|token/i.test(url))
})

// Rouge sur le `if (isDemo()) return fixtures...` de chaque fonction de
// js/api.js : sans lui, le mode `?demo=1` appellerait `fetch` — qui n'existe
// pas côté crawler et qui casserait la capture d'écran pendant que l'API se
// livre encore.
test('le mode démo ne fait aucun appel réseau', async () => {
  const { api } = await loadApi({ search: '?demo=1' })
  const appelé = () => { throw new Error('fetch ne devrait jamais être appelé en mode démo') }
  const vraiFetch = globalThis.fetch
  globalThis.fetch = appelé
  try {
    assert.ok(api.isDemo())
    await api.me()
    await api.families()
    await api.market(new URLSearchParams())
    await api.feed(7)
    await api.revisits({ site: 'lbc', limit: 5 })
  } finally {
    globalThis.fetch = vraiFetch
  }
})
