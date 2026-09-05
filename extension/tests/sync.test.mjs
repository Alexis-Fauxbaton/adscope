import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const PATH = join(here, '../src/sync.js')

// Un service worker de fabrique : `answer` décide de la réponse, `calls`
// enregistre ce que le content script a réellement émis.
const fresh = (answer) => {
  const calls = []
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage(msg, respond) {
        calls.push(msg)
        answer(respond, globalThis.chrome.runtime)
      },
    },
  }
  delete require.cache[require.resolve(PATH)]
  return { sync: require(PATH), calls }
}

const ok = { ok: true, sent: 1, signals: { '42': { site_id: '42', tracked_days: 3 } } }
const listings = [{ site: 'lbc', siteId: '42' }]

test('la synchronisation ne part qu\'une fois par page', () => {
  const { sync, calls } = fresh((r) => r(ok))
  sync.send(listings)
  sync.send(listings)
  sync.send(listings)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { type: 'sync', site: 'lbc', listings })
})

test('une page sans annonce n\'émet rien', () => {
  const { sync, calls } = fresh((r) => r(ok))
  sync.send([])
  assert.equal(calls.length, 0)
  assert.equal(sync.of('42'), null)
})

test('les signaux reçus parviennent aux abonnés et sont interrogeables', () => {
  const { sync } = fresh((r) => r(ok))
  const seen = []
  sync.onSignals((s) => seen.push(s))
  sync.send(listings)
  assert.equal(seen.length, 1)
  assert.equal(sync.of('42').tracked_days, 3)
  assert.equal(sync.of('inconnu'), null)
})

test('un abonné tardif reçoit les signaux déjà arrivés', () => {
  const { sync } = fresh((r) => r(ok))
  sync.send(listings)
  let got = null
  sync.onSignals((s) => (got = s))
  assert.equal(got['42'].tracked_days, 3)
})

test('sans licence l\'extension reste muette et complète', () => {
  const { sync } = fresh((r) => r({ ok: false, reason: 'no-key' }))
  let notified = false
  sync.onSignals(() => (notified = true))
  sync.send(listings)
  assert.equal(notified, false)
  assert.equal(sync.of('42'), null)
})

test('une API injoignable ne fait ni erreur ni signal', () => {
  const { sync } = fresh((respond, runtime) => {
    runtime.lastError = { message: 'Could not establish connection.' }
    respond(undefined)
  })
  sync.send(listings)
  assert.equal(sync.of('42'), null)
})

test('un contexte d\'extension invalidé ne remonte pas dans la page', () => {
  const { sync } = fresh(() => {
    throw new Error('Extension context invalidated.')
  })
  sync.send(listings)
  assert.equal(sync.of('42'), null)
})
