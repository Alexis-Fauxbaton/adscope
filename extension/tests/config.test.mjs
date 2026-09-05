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

test('une panne serveur reste une API en défaut, pas une licence en cause', async () => {
  const r = await probe('http://localhost:8000', KEY, server(() => json(500, {})).fetch)
  assert.deepEqual(r, { state: 'unreachable', status: 500 })
  assert.match(outcome(r, 'http://localhost:8000').text, /HTTP 500/)
})
