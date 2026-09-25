import test from 'node:test'
import assert from 'node:assert/strict'

// Même piège de rechargement de module qu'api-alerts.test.mjs : `js/api.js`
// lit `location`/`localStorage` à l'import, donc on les pose avant, et chaque
// import se fait avec une requête différente pour forcer une ré-exécution.
let compteur = 0

function storage() {
  const map = new Map()
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) }
}

async function loadApiSweep({ search = '' } = {}) {
  globalThis.location = { search, origin: 'http://localhost:8000', href: `http://localhost:8000/app/${search}` }
  Object.defineProperty(globalThis, 'localStorage', { value: storage(), configurable: true })
  compteur += 1
  return import(`../js/api-sweep.js?t=${compteur}`)
}

// Rouge sur `request('/v1/sweep', { params: new URLSearchParams({ pages: … }) })` :
// sans lui, `pages` ne partirait pas en paramètre de requête.
test('sweep(pages) appelle /v1/sweep avec pages en paramètre', async () => {
  const { sweep } = await loadApiSweep()
  const calls = []
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return { status: 200, ok: true, json: async () => ({ pages: 0, items: [], skipped: [] }) } }
  await sweep(35)
  assert.equal(calls[0].url, '/v1/sweep?pages=35')
  assert.equal(calls[0].init.method, 'GET')
})

// Rouge sur `if (isDemo()) return fixtures.sweep(pages)` : sans lui, le mode
// démo appellerait le réseau, qui n'existe pas au moment de dessiner l'écran.
test('en mode démo, sweep(pages) ne fait aucun appel réseau', async () => {
  const { sweep } = await loadApiSweep({ search: '?demo=1' })
  globalThis.fetch = async () => { throw new Error('fetch ne devrait jamais être appelé en mode démo') }
  const result = await sweep(35)
  assert.ok(result)
})
