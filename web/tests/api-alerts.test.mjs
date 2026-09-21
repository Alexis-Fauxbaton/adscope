import test from 'node:test'
import assert from 'node:assert/strict'

// Même piège de rechargement de module que `api.test.mjs` : `js/api.js` lit
// `location`/`localStorage` à l'import, donc on les pose avant, et chaque
// import se fait avec une requête différente pour forcer une ré-exécution.
let compteur = 0

function storage() {
  const map = new Map()
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) }
}

async function loadApiAlerts({ search = '' } = {}) {
  globalThis.location = { search, origin: 'http://localhost:8000', href: `http://localhost:8000/app/${search}` }
  Object.defineProperty(globalThis, 'localStorage', { value: storage(), configurable: true })
  compteur += 1
  return import(`../js/api-alerts.js?t=${compteur}`)
}

function fakeFetch(calls, body = {}) {
  return async (url, init) => {
    calls.push({ url, init })
    return { status: 200, ok: true, json: async () => body }
  }
}

// Rouge sur `headers['X-Adscope'] = '1'` (posé dans `api.js`, traversé ici
// par les écritures d'`api-alerts.js`) : sans lui, créer/patcher/supprimer une
// recherche ne porterait pas la protection CSRF exigée par le contrat.
test('les écritures des recherches portent X-Adscope', async () => {
  const { createSearch, updateSearch, deleteSearch } = await loadApiAlerts()
  const calls = []
  globalThis.fetch = fakeFetch(calls, { id: 1 })
  await createSearch({ name: 'Clio' })
  await updateSearch(1, { name: 'Clio' })
  await deleteSearch(1)
  assert.equal(calls[0].url, '/v1/searches')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[1].url, '/v1/searches/1')
  assert.equal(calls[1].init.method, 'PUT')
  assert.equal(calls[2].url, '/v1/searches/1')
  assert.equal(calls[2].init.method, 'DELETE')
  for (const c of calls) assert.equal(c.init.headers['X-Adscope'], '1')
})

// Rouge sur la ligne `request('/v1/alerts/settings', { method: 'PUT', … })`
// de `putAlertSettings` : sans elle, le réglage se lirait mais ne
// s'écrirait jamais.
test('le réglage se lit en GET et s’écrit en PUT', async () => {
  const { alertSettings, putAlertSettings } = await loadApiAlerts()
  const calls = []
  globalThis.fetch = fakeFetch(calls, { digest_enabled: true })
  await alertSettings()
  await putAlertSettings({ digest_enabled: false, include_follows: true })
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[1].init.method, 'PUT')
  assert.equal(JSON.parse(calls[1].init.body).digest_enabled, false)
})

// Rouge sur `params: new URLSearchParams({ limit: … })` de `digests` : sans
// lui, la borne du plan (§3, « liste sans les corps ») ne s'exprimerait pas
// côté requête.
test('la liste des envois porte la limite en paramètre', async () => {
  const { digests } = await loadApiAlerts()
  const calls = []
  globalThis.fetch = fakeFetch(calls, [])
  await digests(5)
  assert.equal(calls[0].url, '/v1/digests?limit=5')
})

// Rouge sur `request(\`/v1/digests/${id}\`)` : sans le gabarit, lire un envoi
// précis appellerait la liste au lieu d'une ressource.
test('lire un envoi cible son identifiant', async () => {
  const { digest } = await loadApiAlerts()
  const calls = []
  globalThis.fetch = fakeFetch(calls, { id: 3, html: '<p></p>' })
  await digest(3)
  assert.equal(calls[0].url, '/v1/digests/3')
})

// Rouge sur les trois routes non authentifiées : la mesure de visite et le
// désabonnement doivent poster un jeton, jamais l'identifiant du compte.
test('visite, désabonnement et réabonnement postent le jeton opaque', async () => {
  const { digestVisit, unsubscribe, resubscribe } = await loadApiAlerts()
  const calls = []
  globalThis.fetch = fakeFetch(calls, { digest_enabled: false })
  await digestVisit('abc')
  await unsubscribe('abc')
  await resubscribe('abc')
  for (const c of calls) {
    assert.equal(c.init.method, 'POST')
    assert.equal(JSON.parse(c.init.body).token, 'abc')
  }
  assert.equal(calls[0].url, '/v1/digests/visit')
  assert.equal(calls[1].url, '/v1/alerts/unsubscribe')
  assert.equal(calls[2].url, '/v1/alerts/resubscribe')
})

// Rouge sur chaque `if (isDemo()) return fixtures…` : sans lui, le mode démo
// appellerait le réseau, qui n'existe pas au moment de dessiner l'écran.
test('le mode démo ne fait aucun appel réseau', async () => {
  const { searches, alertSettings, digests, digest } = await loadApiAlerts({ search: '?demo=1' })
  globalThis.fetch = async () => { throw new Error('fetch ne devrait jamais être appelé en mode démo') }
  await searches()
  await alertSettings()
  await digests()
  await digest(1)
})
