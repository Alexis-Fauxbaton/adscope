import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ad, block, world } from './world.mjs'

const require = createRequire(import.meta.url)
const TAP = join(dirname(fileURLToPath(import.meta.url)), '../src/page/tap.js')

// Le script de monde MAIN tourne dans la page : il n'a ni `ADS` ni `document`,
// seulement `window.fetch` et l'émission d'événements.
const page = (body) => {
  const calls = []
  const events = []
  const res = { url: '', clone: () => ({ text: async () => body }) }
  globalThis.window = {
    fetch: (url) => (calls.push(url), (res.url = url), Promise.resolve(res)),
  }
  globalThis.dispatchEvent = (e) => events.push(e)
  delete require.cache[require.resolve(TAP)]
  require(TAP)
  return { calls, events, res, get: (url) => globalThis.window.fetch(url) }
}

const settle = () => new Promise(setImmediate)

const RESULTS = '/_next/data/bId7/fr/recherche.json?category=2&page=2'
const CARD = '/_next/data/bId7/fr/ad/voitures/3254194817.json'

test("la prise n'émet aucune requête et rend la réponse intacte", async () => {
  const w = page(block())
  const got = await w.get(RESULTS)
  await settle()
  assert.deepEqual(w.calls, [RESULTS])
  assert.equal(got, w.res)
})

test('une charge de résultats est republiée telle quelle', async () => {
  const w = page(block(ad('3263931610')))
  await w.get(RESULTS)
  await settle()
  assert.equal(w.events.length, 1)
  assert.equal(w.events[0].type, 'adscope:payload')
  assert.equal(JSON.parse(w.events[0].detail).ads[0].list_id, 3263931610)
})

test('une fiche préchargée et une réponse sans annonce sont ignorées', async () => {
  // Next préfetche les fiches liées : leurs annonces similaires passeraient pour
  // des résultats et remplaceraient la page affichée.
  const w = page(block())
  await w.get(CARD)
  await settle()
  assert.deepEqual(w.events, [])

  const other = page('{"suggestions":[]}')
  await other.get(RESULTS)
  await settle()
  assert.deepEqual(other.events, [])
})

const PAGE1 = '3254194817'
const PAGE2 = '3263931610'
// Le bloc `__NEXT_DATA__` décrit la page 1 ; la carte affichée est de la page 2.
const paginated = () => world(PAGE2, { path: '/voitures/occasions?page=2', data: block(ad(PAGE1)) })

test('la page suivante est pastillée dès la réception, sans lot de mutations', () => {
  const w = paginated()
  w.load('listing.js')
  assert.equal(w.badge(), null)

  w.receive({ ads: [ad(PAGE2)] })
  assert.ok(w.badge(), 'la pastille se pose sans attendre de mutation')
  assert.equal(w.badge().getAttribute('data-adscope'), PAGE2)
})

test('le diagnostic décrit la page réellement affichée', () => {
  const w = paginated()
  w.load('listing.js')
  assert.equal(w.status().source, 'page')
  assert.equal(w.status().badges, 0)

  w.receive({ ads: [ad(PAGE2)] })
  const s = w.status()
  assert.equal(s.kind, 'listing')
  assert.equal(s.url, '/voitures/occasions?page=2')
  assert.equal(s.listings, 1)
  assert.equal(s.badges, 1)
  assert.equal(s.source, 'live')
})

test('une charge sans annonce laisse la page en place', () => {
  const w = paginated()
  w.load('listing.js')
  w.receive({ ads: [ad(PAGE2)] })
  w.receive({ pivot: null })
  assert.equal(w.badge().getAttribute('data-adscope'), PAGE2)
  assert.equal(w.status().listings, 1)
})
