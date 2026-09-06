import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { storage } from './storage.mjs'

const require = createRequire(import.meta.url)
const src = (f) => join(dirname(fileURLToPath(import.meta.url)), '../src/', f)

const NOW = 1757160000000
const HOUR = 3600000
const KEY = 'adsc_' + 'a'.repeat(32)
const key = (id) => `a:lbc:${id}`

const listing = (siteId, price = 9900) => ({ site: 'lbc', siteId, price })
const signalsOf = (id) => ({ site_id: id, tracked_days: 4, price: 9900 })

// Le service worker tel qu'il tourne : le cache lui est fourni par
// `importScripts`, les messages arrivent par l'écouteur qu'il pose.
const boot = ({ entries = {}, licenseKey = KEY, offline = false } = {}) => {
  const store = storage({ entries: { licenseKey, apiBase: 'http://api', ...entries } })
  const calls = []
  let listener = null
  Date.now = () => NOW
  globalThis.ADS = undefined
  globalThis.chrome = {
    storage: { local: store.local },
    runtime: { onMessage: { addListener: (fn) => (listener = fn) } },
  }
  globalThis.importScripts = () => {
    delete require.cache[require.resolve(src('cache.js'))]
    require(src('cache.js'))
  }
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) })
    if (offline) throw new TypeError('Failed to fetch')
    const batch = url.endsWith('/batch')
    return {
      ok: true,
      json: async () =>
        batch ? JSON.parse(init.body).ids.map(signalsOf) : { accepted: 1 },
    }
  }
  delete require.cache[require.resolve(src('sw.js'))]
  require(src('sw.js'))
  return { store, calls, ask: (msg) => new Promise((r) => listener(msg, null, r)) }
}

const seed = (id, at, sig = '9900||') => ({
  [key(id)]: { at, sig, signals: signalsOf(id) },
})

test("une annonce inconnue du cache est transmise puis interrogée", async () => {
  const { calls, ask, store } = boot()
  const res = await ask({ type: 'sync', site: 'lbc', listings: [listing('1')] })
  assert.deepEqual(calls.map((c) => c.url), ['http://api/v1/observations', 'http://api/v1/listings/batch'])
  assert.equal(res.sent, 1)
  assert.equal(res.signals['1'].tracked_days, 4)
  assert.equal(store.data[key('1')].at, NOW)
})

test("une annonce vue il y a moins de six heures ne repart pas", async () => {
  const { calls, ask } = boot({ entries: seed('1', NOW - 5 * HOUR) })
  const res = await ask({ type: 'sync', site: 'lbc', listings: [listing('1')] })
  assert.deepEqual(calls, [])
  assert.equal(res.ok, true)
  assert.equal(res.sent, 0)
  assert.equal(res.skipped, 1)
})

test('passé le seuil de fraîcheur, elle repart', async () => {
  const { calls, ask } = boot({ entries: seed('1', NOW - 7 * HOUR) })
  await ask({ type: 'sync', site: 'lbc', listings: [listing('1')] })
  assert.equal(calls.length, 2)
})

// Le seuil range les passages répétés, il ne doit pas retenir une nouvelle.
test('un prix différent de celui du cache passe outre le seuil', async () => {
  const { calls, ask } = boot({ entries: seed('1', NOW - HOUR) })
  await ask({ type: 'sync', site: 'lbc', listings: [listing('1', 9500)] })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].body.items[0].price, 9500)
})

test("seul ce qui manque ou a vieilli est envoyé à l'API", async () => {
  const entries = { ...seed('1', NOW - HOUR), ...seed('2', NOW - 9 * HOUR) }
  const { calls, ask } = boot({ entries })
  const res = await ask({
    type: 'sync', site: 'lbc',
    listings: [listing('1'), listing('2'), listing('3')],
  })
  assert.deepEqual(calls[0].body.items.map((i) => i.site_id), ['2', '3'])
  assert.deepEqual(calls[1].body.ids, ['2', '3'])
  assert.equal(res.skipped, 1)
})

test('les signaux reçus rejoignent le cache pour la prochaine visite', async () => {
  const { store, ask } = boot()
  await ask({ type: 'sync', site: 'lbc', listings: [listing('1'), listing('2')] })
  assert.deepEqual(Object.keys(store.data).filter((k) => k.startsWith('a:')).sort(), [key('1'), key('2')])
  assert.equal(store.data[key('2')].signals.tracked_days, 4)
})

test('hors ligne, le cache répond seul et sans réseau', async () => {
  const { calls, ask } = boot({ offline: true, entries: seed('1', NOW - 40 * HOUR) })
  const res = await ask({ type: 'cached', site: 'lbc', ids: ['1', '2'] })
  assert.deepEqual(calls, [])
  assert.equal(res.signals['1'].tracked_days, 4)
  assert.equal(res.signals['2'], undefined)
})

test("hors ligne, la synchronisation échoue sans vider le cache", async () => {
  const { store, ask } = boot({ offline: true, entries: seed('1', NOW - 40 * HOUR) })
  const res = await ask({ type: 'sync', site: 'lbc', listings: [listing('1')] })
  assert.equal(res.ok, false)
  assert.equal(store.data[key('1')].signals.tracked_days, 4)
})

test('sans licence, le cache répond quand même', async () => {
  const { ask } = boot({ licenseKey: '', entries: seed('1', NOW) })
  assert.equal((await ask({ type: 'sync', site: 'lbc', listings: [listing('1')] })).reason, 'no-key')
  assert.equal((await ask({ type: 'cached', site: 'lbc', ids: ['1'] })).signals['1'].tracked_days, 4)
})

test('la purge opportuniste a lieu au chargement, une fois par jour', async () => {
  const old = { ...seed('vieille', NOW - 31 * 24 * HOUR) }
  const { store, ask } = boot({ entries: old })
  await ask({ type: 'sync', site: 'lbc', listings: [listing('1')] })
  assert.equal(key('vieille') in store.data, false)
  assert.equal(store.data._meta.purged, NOW)
})

test('la popup obtient le relevé du cache et peut le vider', async () => {
  const { store, ask } = boot({ entries: seed('1', NOW) })
  assert.equal((await ask({ type: 'cache-stats' })).entries, 1)
  assert.equal((await ask({ type: 'cache-clear' })).cleared, 1)
  assert.equal(key('1') in store.data, false)
})

test("un message qui ne le concerne pas n'est pas capté", () => {
  const { ask } = boot()
  let answered = false
  ask({ type: 'autre-chose' }).then(() => (answered = true))
  assert.equal(answered, false)
})
