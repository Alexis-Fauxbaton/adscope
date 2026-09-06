import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ad, block } from './world.mjs'

const require = createRequire(import.meta.url)
const TAP = join(dirname(fileURLToPath(import.meta.url)), '../src/sites/leboncoin-tap.js')

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

// Next préfetche les fiches liées : leurs annonces similaires passeraient pour
// des résultats et remplaceraient la page affichée. Les deux charges sont
// publiées, sous deux noms — c'est le nom, et non l'exclusion, qui les sépare.
test('une charge de fiche est republiée sous son propre nom', async () => {
  const w = page(block(ad('3254194817')))
  await w.get(CARD)
  await settle()
  assert.equal(w.events.length, 1)
  assert.equal(w.events[0].type, 'adscope:detail')
})

test('une réponse sans annonce est ignorée', async () => {
  const w = page('{"suggestions":[]}')
  await w.get(RESULTS)
  await settle()
  assert.deepEqual(w.events, [])
})

test("une réponse qui n'est ni des résultats ni une fiche est ignorée", async () => {
  const w = page(block())
  await w.get('/api/pub/v1/tracking')
  await settle()
  assert.deepEqual(w.events, [])
})
