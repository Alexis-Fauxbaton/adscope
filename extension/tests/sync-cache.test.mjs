import test from 'node:test'
import assert from 'node:assert/strict'
import { runtime } from './runtime.mjs'

const listings = [{ site: 'lbc', siteId: '42' }]
const known = { 42: { site_id: '42', tracked_days: 3, price: 9900 } }
const later = { 42: { site_id: '42', tracked_days: 9, price: 9500 } }

// Le réseau qu'on fait répondre quand on veut : c'est le seul moyen de voir
// ce que l'encart affiche pendant qu'on l'attend.
const held = () => {
  const waiting = []
  const answer = (respond) => waiting.push(respond)
  return {
    answer,
    arrive: (signals) => {
      for (const respond of waiting.splice(0)) respond({ ok: true, sent: 1, signals })
    },
    fail: () => {
      for (const respond of waiting.splice(0)) respond({ ok: false, reason: 'Failed to fetch' })
    },
  }
}

test("les signaux du cache renseignent l'encart sans attendre le réseau", () => {
  const net = held()
  const { sync } = runtime(net.answer, known)
  sync.send(listings)
  assert.equal(sync.of('42').tracked_days, 3)
  assert.equal(sync.originOf('42'), 'cache')
})

test('la réponse du réseau remplace ce que le cache avait affiché', () => {
  const net = held()
  const { sync } = runtime(net.answer, known)
  const seen = []
  sync.onSignals((s) => seen.push(s['42'].tracked_days))
  sync.send(listings)
  net.arrive(later)
  assert.deepEqual(seen, [3, 9])
  assert.equal(sync.originOf('42'), 'network')
})

test('hors ligne, le cache seul renseigne encore', () => {
  const net = held()
  const { sync } = runtime(net.answer, known)
  sync.send(listings)
  net.fail()
  assert.equal(sync.of('42').price, 9900)
  assert.equal(sync.originOf('42'), 'cache')
  assert.equal(sync.sent(), 0)
})

// Les deux réponses courent en parallèle : rien ne garantit leur ordre.
test('une réponse de cache tardive ne recouvre pas celle du réseau', () => {
  const late = []
  const { sync } = runtime((respond) => respond({ ok: true, sent: 1, signals: later }), {})
  chrome.runtime.sendMessage = (msg, respond) => {
    if (msg.type === 'cached') return late.push(() => respond({ ok: true, signals: known }))
    respond({ ok: true, sent: 1, signals: later })
  }
  sync.send(listings)
  for (const fn of late.splice(0)) fn()
  assert.equal(sync.of('42').tracked_days, 9)
  assert.equal(sync.originOf('42'), 'network')
})

test('le diagnostic sépare ce qui vient du cache de ce qui vient du réseau', () => {
  const net = held()
  const { sync } = runtime(net.answer, known)
  sync.send([...listings, { site: 'lbc', siteId: '43' }])
  assert.deepEqual(sync.counts(), { cache: 1, network: 0 })
  net.arrive({ 43: { site_id: '43', tracked_days: 1 } })
  assert.deepEqual(sync.counts(), { cache: 1, network: 1 })
})

test("une annonce déjà servie n'est pas relue dans le cache", () => {
  const net = held()
  const { sync, asked } = runtime(net.answer, known)
  sync.send(listings)
  sync.send(listings)
  assert.equal(asked.length, 1)
  assert.deepEqual(asked[0].ids, ['42'])
})

test("l'origine d'une annonce inconnue ne s'invente pas", () => {
  const net = held()
  const { sync } = runtime(net.answer, {})
  sync.send(listings)
  assert.equal(sync.originOf('42'), null)
  assert.deepEqual(sync.counts(), { cache: 0, network: 0 })
})
