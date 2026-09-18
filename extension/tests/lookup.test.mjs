import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
globalThis.ADS = undefined
// `lookup.js` construit son authentification par `ADS.auth` (`src/auth.js`),
// le même chemin que `sw.js` — chargé ici comme `importScripts` le fait dans
// le service worker.
globalThis.chrome = {
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
}
require(join(here, '../src/auth.js'))
const lookup = require(join(here, '../src/lookup.js'))

const CFG = { apiBase: 'http://api', licenseKey: 'adsc_' + 'a'.repeat(32) }
const OUT = { count: 37, comparable: true }

// Le réseau, tenu par le test : ce qui part, et ce qui revient.
const server = (status = 200, body = OUT) => {
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({
      url, auth: init.headers.Authorization, method: init.method,
      xAdscope: init.headers['X-Adscope'], credentials: init.credentials,
    })
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

// Fait rougir le passage de `lookup.js` par `ADS.auth` (au lieu d'un
// `Authorization: Bearer` construit sur place, gardé derrière `if (!licenseKey)
// return null`) : sans clé, les deux lectures doivent partir quand même, en
// cookie de session — comme `sync`, `follow` et `absent` dans `sw.js`.
test('sans clé de licence, les deux lectures partent quand même — en cookie de session', async () => {
  const calls = server()
  const cfg = { apiBase: 'http://api', licenseKey: '' }
  await lookup.comparables('lbc', '1', cfg)
  await lookup.seller('lbc', '1', cfg)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].auth, undefined)
  assert.equal(calls[0].xAdscope, '1')
  assert.equal(calls[0].credentials, 'include')
})

// `sellerId` et `site` sortent de la charge d'une page tierce — c'est le site
// ouvert qui les écrit, jamais nous. Sans encodage, un `?`, un `#` ou un `/`
// changerait le chemin appelé ou greffe une chaîne de requête sur la demande.
//
// L'encodage ne suffit pas : le point n'est pas un caractère réservé, donc
// `encodeURIComponent('..')` rend `..` — et l'analyseur d'URL le résout. C'est
// le chemin réellement appelé qu'on vérifie ici, jamais la chaîne construite.
const called = async (site, sellerId) => {
  const calls = server()
  const out = await lookup.seller(site, sellerId, CFG)
  return { path: calls.length ? new URL(calls[0].url).pathname : null, out }
}

test("un identifiant venu de la page ne peut pas détourner le chemin appelé", async () => {
  const { path } = await called('lbc', '../../v1/me?x=1#f')
  assert.equal(path, '/v1/sellers/lbc/..%2F..%2Fv1%2Fme%3Fx%3D1%23f')
  assert.equal(path.split('/').length, 5)
})

test('le site aussi est encodé, il vient du même relevé', async () => {
  const { path } = await called('lbc/../..', '73911')
  assert.equal(path, '/v1/sellers/lbc%2F..%2F../73911')
})

// Mesuré avant correction : `sellerId` à `..` appelait `/v1/sellers/`, `site` à
// `..` appelait `/v1/me`, les deux à `..` appelaient `/`. Un segment qu'on ne
// peut pas exprimer comme un segment n'est pas un vendeur : on n'appelle pas.
for (const dots of ['.', '..', '...']) {
  test(`un identifiant réduit à « ${dots} » ne déclenche aucun appel`, async () => {
    assert.deepEqual(await called('lbc', dots), { path: null, out: { ok: true, stats: null } })
  })

  test(`un site réduit à « ${dots} » ne déclenche aucun appel`, async () => {
    assert.deepEqual(await called(dots, 'me'), { path: null, out: { ok: true, stats: null } })
  })
}

test('les deux segments à « .. » n’appellent pas la racine', async () => {
  assert.deepEqual(await called('..', '..'), { path: null, out: { ok: true, stats: null } })
})

// `%2e` est un point pour l'analyseur d'URL, mais celui-là vient de la page
// telle quelle : encodé, son pourcent devient `%25` et il reste un segment.
test('un identifiant qui écrit ses points en pourcent reste un segment', async () => {
  const { path } = await called('lbc', '%2e%2e')
  assert.equal(path, '/v1/sellers/lbc/%252e%252e')
})
