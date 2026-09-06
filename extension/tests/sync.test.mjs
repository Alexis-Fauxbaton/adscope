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
        answer(respond, globalThis.chrome.runtime, msg)
      },
    },
  }
  delete require.cache[require.resolve(PATH)]
  return { sync: require(PATH), calls }
}

const ok = { ok: true, sent: 1, signals: { '42': { site_id: '42', tracked_days: 3 } } }
const listings = [{ site: 'lbc', siteId: '42' }]

// L'API répond ce qu'on lui a donné : c'est le seul moyen de voir quelles
// annonces chaque lot a réellement portées.
const echo = (respond, _runtime, msg) =>
  respond({
    ok: true,
    sent: msg.listings.length,
    signals: Object.fromEntries(msg.listings.map((l) => [l.siteId, { site_id: l.siteId, tracked_days: 3 }])),
  })

const two = [{ site: 'lbc', siteId: '43' }, { site: 'lbc', siteId: '44' }]

test('une annonce déjà transmise ne repart pas', () => {
  const { sync, calls } = fresh((r) => r(ok))
  sync.send(listings)
  sync.send(listings)
  sync.send(listings)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { type: 'sync', site: 'lbc', listings })
})

// Le défaut du jour : la page 2 arrive après le premier envoi et n'entrait
// jamais en base.
test('chaque charge reçue verse ses nouvelles annonces', () => {
  const { sync, calls } = fresh(echo)
  sync.send(listings)
  sync.send(two)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1].listings, two)
})

test('un lot mêlant du connu et du neuf ne renvoie que le neuf', () => {
  const { sync, calls } = fresh(echo)
  sync.send(listings)
  sync.send([...listings, ...two])
  assert.deepEqual(calls[1].listings, two)
  sync.send([...listings, ...two])
  assert.equal(calls.length, 2)
})

test('les signaux des lots successifs s\'ajoutent au lieu de se remplacer', () => {
  const { sync } = fresh(echo)
  const seen = []
  sync.onSignals((s) => seen.push(Object.keys(s).length))
  sync.send(listings)
  sync.send(two)
  assert.equal(sync.of('42').tracked_days, 3)
  assert.equal(sync.of('43').tracked_days, 3)
  assert.deepEqual(seen, [1, 3])
})

test('le compte transmis est celui que l\'API a accusé', () => {
  const { sync } = fresh(echo)
  assert.equal(sync.sent(), 0)
  sync.send(listings)
  assert.equal(sync.sent(), 1)
  sync.send(two)
  assert.equal(sync.sent(), 3)
})

test('une API muette ne gonfle pas le compte transmis', () => {
  const { sync } = fresh((respond, runtime) => {
    runtime.lastError = { message: 'Could not establish connection.' }
    respond(undefined)
  })
  sync.send(listings)
  assert.equal(sync.sent(), 0)
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
