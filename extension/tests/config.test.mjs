import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const config = require(join(dirname(fileURLToPath(import.meta.url)), '../popup/config.js'))
const { isKey, mask, base, isBase, probe, outcome } = config

const KEY = 'adsc_' + '0123456789abcdef'.repeat(2)

// Un serveur de fabrique : `reply` décide de la réponse, `calls` retient l'appel.
const server = (reply) => {
  const calls = []
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, auth: init.headers.Authorization })
      return reply()
    },
  }
}

const json = (status, body) => ({ status, ok: status < 400, json: async () => body })

test('la clé est reconnue à sa forme, pas à sa longueur seule', () => {
  assert.ok(isKey(KEY))
  assert.ok(isKey(` ${KEY} `))
  assert.ok(!isKey(''))
  assert.ok(!isKey(KEY.slice(0, -1)))
  assert.ok(!isKey(KEY.replace('f', 'z')))
  assert.ok(!isKey(KEY.replace('adsc_', 'adsk_')))
})

test('la clé enregistrée ne se relit qu\'en partie', () => {
  assert.equal(mask(KEY), 'adsc_01234567…')
  assert.ok(!mask(KEY).includes(KEY.slice(-8)))
})

test('l\'adresse tolère la barre finale et refuse le reste', () => {
  assert.equal(base(' http://localhost:8000/ '), 'http://localhost:8000')
  assert.ok(isBase('https://api.adscope.fr'))
  assert.ok(!isBase('localhost:8000'))
  assert.ok(!isBase('http://'))
})

// Rouge sur `new URL(v).origin === v` de popup/config.js (`isBase`) : la seule
// forme regex acceptait `https://api.adscope.fr@evil.example` — une adresse
// qui se lit comme la bonne et dont l'origine réelle est `evil.example`, celle
// à qui la clé de licence part (audit offensif, angle extension, T2).
test('une adresse qui porte des identifiants avant l\'hôte est refusée', () => {
  assert.ok(!isBase('https://api.adscope.fr@evil.example'))
  assert.ok(!isBase('https://api.adscope.fr:x@evil.example'))
  assert.equal(new URL('https://api.adscope.fr@evil.example').origin, 'https://evil.example')
})

test('une licence valide rend son libellé et son échéance', async () => {
  const s = server(() => json(200, { label: 'Garage Dupont', expires_at: '2027-03-12T00:00:00Z' }))
  const r = await probe('http://localhost:8000/', KEY, s.fetch)
  assert.deepEqual(s.calls, [{ url: 'http://localhost:8000/v1/me', auth: `Bearer ${KEY}` }])
  assert.equal(r.state, 'ok')
  assert.equal(outcome(r, 'http://localhost:8000').tone, 'ok')
  assert.match(outcome(r, 'http://localhost:8000').text, /Garage Dupont.*12\/03\/2027/)
})

test('une licence refusée se distingue d\'une API muette', async () => {
  const refused = await probe('http://localhost:8000', KEY, server(() => json(401, {})).fetch)
  assert.equal(refused.state, 'refused')
  assert.equal(outcome(refused, 'http://localhost:8000').tone, 'bad')

  const down = await probe('http://localhost:8000', KEY, async () => { throw new TypeError('Failed to fetch') })
  assert.equal(down.state, 'unreachable')
  const said = outcome(down, 'http://localhost:8000/')
  assert.equal(said.tone, 'warn')
  assert.match(said.text, /injoignable sur http:\/\/localhost:8000 /)
})

test('un 200 qui n\'est pas /v1/me dénonce l\'adresse, pas la licence', async () => {
  const html = { status: 200, ok: true, json: async () => { throw new SyntaxError('Unexpected token <') } }
  const r = await probe('https://adscope.fr', KEY, async () => html)
  assert.deepEqual(r, { state: 'unreachable' })
  assert.match(outcome(r, 'https://adscope.fr').text, /adresse erronée/)

  const other = await probe('https://adscope.fr', KEY, server(() => json(200, { hello: 'world' })).fetch)
  assert.deepEqual(other, { state: 'unreachable' })
})

// Un proxy, un portail captif ou un serveur mal réglé répondent ce qu'ils
// veulent : « ok », un nombre, un booléen sont du JSON valide.
for (const body of ['ok', 5, true]) {
  test(`un corps JSON réduit à ${JSON.stringify(body)} ne fige pas le test`, async () => {
    const r = await probe('https://adscope.fr', KEY, server(() => json(200, body)).fetch)
    assert.deepEqual(r, { state: 'unreachable' })
    assert.match(outcome(r, 'https://adscope.fr').text, /adresse erronée/)
  })
}

test('une panne serveur reste une API en défaut, pas une licence en cause', async () => {
  const r = await probe('http://localhost:8000', KEY, server(() => json(500, {})).fetch)
  assert.deepEqual(r, { state: 'unreachable', status: 500 })
  assert.match(outcome(r, 'http://localhost:8000').text, /HTTP 500/)
})
