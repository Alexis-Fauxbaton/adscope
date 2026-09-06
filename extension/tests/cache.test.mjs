import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { cached, history, storage } from './storage.mjs'

const require = createRequire(import.meta.url)
const src = join(dirname(fileURLToPath(import.meta.url)), '../src/cache.js')

const DAY = 86400000
const NOW = 1757160000000

const fresh = (opts) => {
  const store = storage(opts)
  globalThis.ADS = undefined
  globalThis.chrome = { storage: { local: store.local } }
  delete require.cache[require.resolve(src)]
  return { store, cache: require(src) }
}

const key = (id) => `a:lbc:${id}`

test('la page de résultats lit ses annonces en un seul appel', async () => {
  const { store, cache } = fresh({ entries: { [key('1')]: cached(NOW, { price: 9900 }) } })
  const ids = Array.from({ length: 24 }, (_, i) => String(i))
  const got = await cache.read('lbc', ids)
  assert.equal(store.gets.length, 1)
  assert.equal(store.gets[0].length, 24)
  assert.equal(store.gets[0][1], key('1'))
  assert.equal(got['1'].signals.price, 9900)
})

test("une annonce absente du cache n'est pas inventée", async () => {
  const { cache } = fresh()
  assert.deepEqual(await cache.read('lbc', ['1']), {})
})

test("l'historique de prix est plafonné au premier point plus les vingt plus récents", async () => {
  const { store, cache } = fresh()
  await cache.write('lbc', { 1: { at: NOW, sig: 'a', signals: { price_history: history(50) } } })
  const kept = store.data[key('1')].signals.price_history
  assert.equal(kept.length, 21)
  assert.equal(kept[0].price, 0)
  assert.equal(kept[1].price, 30)
  assert.equal(kept[20].price, 49)
})

test('un historique court traverse le cache intact', async () => {
  const { store, cache } = fresh()
  await cache.write('lbc', { 1: { at: NOW, sig: 'a', signals: { price_history: history(21) } } })
  assert.equal(store.data[key('1')].signals.price_history.length, 21)
})

test('la purge supprime au-delà de trente jours sans consultation', async () => {
  const { store, cache } = fresh({
    entries: {
      [key('vieille')]: cached(NOW - 31 * DAY),
      [key('recente')]: cached(NOW - 29 * DAY),
    },
  })
  assert.equal(await cache.purge(NOW), 1)
  assert.equal(key('vieille') in store.data, false)
  assert.equal(key('recente') in store.data, true)
})

test('la purge opportuniste ne se rejoue pas dans la journée', async () => {
  const { store, cache } = fresh({ entries: { [key('vieille')]: cached(NOW - 40 * DAY) } })
  assert.equal(await cache.purgeDaily(NOW), 1)
  store.data[key('autre')] = cached(NOW - 40 * DAY)
  assert.equal(await cache.purgeDaily(NOW + DAY - 1), null)
  assert.equal(key('autre') in store.data, true)
  assert.equal(await cache.purgeDaily(NOW + DAY), 1)
})

test("la purge inscrit son passage, seule garde contre le balayage à chaque page", async () => {
  const { store, cache } = fresh()
  await cache.purge(NOW)
  assert.equal(store.data._meta.purged, NOW)
})

// Sans ce rattrapage, le quota atteint fait cesser l'enregistrement en silence.
test("une écriture refusée pour dépassement de quota purge d'urgence et retente", async () => {
  const entries = {}
  for (let i = 0; i < 10; i++) entries[key(i)] = cached(NOW - i * DAY, { price: 1000 })
  const { store, cache } = fresh({ entries })
  const before = Object.keys(store.data).length
  store.setQuota(await store.local.getBytesInUse())
  assert.equal(await cache.write('lbc', { 42: { at: NOW, sig: 'a', signals: { price: 1 } } }), true)
  assert.equal(key('42') in store.data, true)
  assert.ok(Object.keys(store.data).length < before)
  // Les plus anciennes partent les premières, la plus récente reste.
  assert.equal(key('9') in store.data, false)
  assert.equal(key('0') in store.data, true)
})

test('le rattrapage de quota ne retente qu\'une fois', async () => {
  const { store, cache } = fresh({ quota: 1, entries: { [key('1')]: cached(NOW) } })
  assert.equal(await cache.write('lbc', { 2: { at: NOW, sig: 'a', signals: {} } }), false)
  assert.equal(store.writes.length, 2)
})

test('le relevé de la popup compte les annonces et non les clés de service', async () => {
  const { cache } = fresh({ entries: { [key('1')]: cached(NOW), _meta: { purged: NOW } } })
  const stats = await cache.stats()
  assert.equal(stats.entries, 1)
  assert.equal(stats.purged, NOW)
  assert.ok(stats.bytes > 0 && stats.quota > stats.bytes)
})

test('la purge manuelle vide les annonces et laisse le reste', async () => {
  const { store, cache } = fresh({
    entries: { [key('1')]: cached(NOW), licenseKey: 'adsc_x', _meta: { purged: NOW } },
  })
  assert.equal(await cache.clear(), 1)
  assert.deepEqual(Object.keys(store.data).sort(), ['_meta', 'licenseKey'])
})

const point = (i, confirmation) => ({ at: `j${i}`, price: 10000 - i, confirmation })

// Un point par semaine s'ajoute désormais sans que le prix ait bougé. Le
// plafond ne doit pas se remplir de « rien n'a changé » en évinçant les
// changements, qui sont le signal.
test('le plafond garde les changements et sacrifie les confirmations', async () => {
  const { store, cache } = fresh()
  const points = [
    ...Array.from({ length: 10 }, (_, i) => point(i, false)),
    ...Array.from({ length: 20 }, (_, i) => point(10 + i, true)),
  ]
  await cache.write('lbc', { 1: { at: NOW, sig: 'a', signals: { price_history: points } } })
  const kept = store.data[key('1')].signals.price_history
  assert.equal(kept.length, 21)
  assert.equal(kept.filter((p) => !p.confirmation).length, 10)
  // Les confirmations retenues sont les plus récentes.
  assert.equal(kept[10].at, 'j19')
  assert.equal(kept[20].at, 'j29')
})

test('quand les changements débordent seuls, ce sont les plus récents qui restent', async () => {
  const { store, cache } = fresh()
  const points = Array.from({ length: 30 }, (_, i) => point(i, false))
  await cache.write('lbc', { 1: { at: NOW, sig: 'a', signals: { price_history: points } } })
  const kept = store.data[key('1')].signals.price_history
  assert.deepEqual([kept.length, kept[0].at, kept[1].at, kept[20].at], [21, 'j0', 'j10', 'j29'])
})

// Un historique déjà saturé de changements ne laisse aucune place : les
// confirmations qui le suivent ne doivent pas s'y faire une place quand même.
test('des changements plus nombreux que le plafond ne laissent passer aucune confirmation', async () => {
  const { store, cache } = fresh()
  const points = [
    ...Array.from({ length: 25 }, (_, i) => point(i, false)),
    ...Array.from({ length: 10 }, (_, i) => point(25 + i, true)),
  ]
  await cache.write('lbc', { 1: { at: NOW, sig: 'a', signals: { price_history: points } } })
  const kept = store.data[key('1')].signals.price_history
  assert.equal(kept.length, 21)
  assert.equal(kept.filter((p) => p.confirmation).length, 0)
  assert.deepEqual([kept[0].at, kept[1].at, kept[20].at], ['j0', 'j5', 'j24'])
})
