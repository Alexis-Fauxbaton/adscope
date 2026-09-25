import test from 'node:test'
import assert from 'node:assert/strict'
import { runtime as fresh } from './runtime.mjs'

// Le cache reste vide dans tout ce fichier : ce qui s'y joue est l'envoi et
// la réponse du réseau. Le cache a le sien.

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

// Ce que l'API n'a pas pris, personne ne le reprenait : les identifiants
// étaient marqués transmis avant la réponse. Un lot refusé — API éteinte, 500,
// lot mal formé — emportait la page entière d'observations, sans trace.
const failing = (answer) => {
  let broken = true
  const { sync, calls } = fresh((respond, runtime, msg) =>
    broken ? respond({ ok: false, reason: '500' }) : answer(respond, runtime, msg))
  return { sync, calls, repair: () => (broken = false) }
}

// Le temps de la pause : les tests le font passer plutôt que de l'attendre.
const later = (ms, fn) => {
  const now = Date.now
  Date.now = () => now() + ms
  try { fn() } finally { Date.now = now }
}

test('un envoi refusé repart avec la charge suivante', () => {
  const { sync, calls, repair } = failing(echo)
  sync.send(listings)
  repair()
  later(60000, () => sync.send(listings))
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1].listings, listings)
  assert.equal(sync.of('42').tracked_days, 3)
})

// Le rejeu ne doit pas devenir un martèlement : la page produit des lots de
// mutations en rafale, et chacun rappelle `send`.
test('une API éteinte n’est pas resollicitée à chaque lot de mutations', () => {
  const { sync, calls } = failing(echo)
  for (let i = 0; i < 5; i++) sync.send(listings)
  assert.equal(calls.length, 1)
})

test('la pause passée, un envoi refusé ne compte toujours pas comme transmis', () => {
  const { sync } = failing(echo)
  sync.send(listings)
  assert.equal(sync.sent(), 0)
  later(60000, () => sync.send(listings))
  assert.equal(sync.sent(), 0)
})

// Rouge sur `setTimeout(() => queued.delete(l.siteId), FRESH_MS)` du
// callback de succès dans `send` : sans lui, `queued` ne relâche un
// identifiant que sur échec — une annonce transmise avec succès une fois
// resterait exclue de `sync.send` pour toujours, même affichée des heures sur
// un onglet resté ouvert (backend-specialist, /audit-project, sync.js:67).
test('une annonce transmise avec succès redevient éligible après le délai de fraîcheur', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { sync, calls } = fresh((r) => r(ok))
  sync.send(listings)
  assert.equal(calls.length, 1)
  // Avant le délai : toujours exclue, comme le veut le garde-fou de rafale.
  t.mock.timers.tick(6 * 3600 * 1000 - 1)
  sync.send(listings)
  assert.equal(calls.length, 1)
  // Le délai passé : redevenue éligible.
  t.mock.timers.tick(1)
  sync.send(listings)
  assert.equal(calls.length, 2)
})
