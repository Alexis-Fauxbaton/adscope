import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
globalThis.ADS = undefined
const lookup = require(join(here, '../src/lookup.js'))

const CFG = { apiBase: 'http://api', licenseKey: 'adsc_' + 'a'.repeat(32) }
const OUT = { count: 37, comparable: true }

// Le réseau, tenu par le test : ce qui part, et ce qui revient.
const server = (status = 200, body = OUT) => {
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization, method: init.method })
    return { ok: status < 400, status, json: async () => body }
  }
  return calls
}

test("les comparables sont lus sur la route du contrat, sous la licence", async () => {
  const calls = server()
  const res = await lookup.comparables('lbc', '3254194817', CFG)
  assert.deepEqual(res, { ok: true, comparables: OUT })
  assert.equal(calls[0].url, 'http://api/v1/listings/lbc/3254194817/comparables')
  assert.equal(calls[0].auth, `Bearer ${CFG.licenseKey}`)
  // Une lecture, jamais un envoi : rien de la page ne part par là.
  assert.equal(calls[0].method, undefined)
})

test('les statistiques du marchand suivent la même route que dans la fenêtre', async () => {
  const calls = server()
  await lookup.seller('lc', 'C045122', CFG)
  assert.equal(calls[0].url, 'http://api/v1/sellers/lc/C045122')
})

// Rouge sur le `res.ok ? res.json() : null` de src/lookup.js : sans lui, une
// annonce que la base ne connaît pas ferait lever la lecture, et le panneau
// perdrait aussi ce qu'il savait déjà.
test("une annonce inconnue de la base rend une absence, pas une panne", async () => {
  server(404, { detail: 'annonce inconnue' })
  assert.deepEqual(await lookup.comparables('lbc', '1', CFG), { ok: true, comparables: null })
})

// L'identifiant vient de la charge d'une page tierce. Rouge sur le garde `DOTS`
// de src/lookup.js : `encodeURIComponent('..')` rend `..`, que l'analyseur
// d'URL résout avant l'appel — `/v1/sellers/lbc/..` interrogeait `/v1/sellers`.
test("un identifiant réduit à des points n'appelle rien", async () => {
  const calls = server()
  assert.deepEqual(await lookup.seller('lbc', '..', CFG), { ok: true, stats: null })
  assert.equal(calls.length, 0)
})

test('un identifiant qui porte une barre reste un segment', async () => {
  const calls = server()
  await lookup.seller('lbc', 'a/b?c', CFG)
  assert.equal(calls[0].url, 'http://api/v1/sellers/lbc/a%2Fb%3Fc')
})

// Sans licence, rien ne part : l'appel lui-même est la mesure d'usage, et il
// n'a pas de sens sans le compte qui le porte.
test('sans clé de licence, aucune des deux lectures ne part', async () => {
  const calls = server()
  await lookup.comparables('lbc', '1', { apiBase: 'http://api', licenseKey: '' })
  await lookup.seller('lbc', '1', { apiBase: 'http://api', licenseKey: '' })
  assert.equal(calls.length, 0)
})
