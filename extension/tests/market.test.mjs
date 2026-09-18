import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test, { mock } from 'node:test'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// `ADS.market` seul, sans passer par un module de site : la garde est une
// défense en profondeur, elle se juge sur l'objet qu'elle reçoit, pas sur ce
// qu'un site choisit de lui donner.
//
// Le service worker répond par une file, pas tout de suite : `port()` rejoue
// le port qui se ferme avant la réponse — le service worker MV3 endormi au
// chargement d'une fiche — sans quoi la reprise de src/market.js ne se
// distingue jamais d'un simple envoi.
const setup = () => {
  const sent = []
  const pending = []
  globalThis.chrome = {
    runtime: {
      id: 'test',
      lastError: null,
      sendMessage: (msg, cb) => { sent.push(msg); pending.push(cb) },
    },
  }
  globalThis.ADS = undefined
  for (const f of ['context.js', 'market.js']) {
    const path = join(here, '../src/', f)
    delete require.cache[require.resolve(path)]
    require(path)
  }
  return {
    sent,
    answer: (body) => pending.pop()({ ok: true, ...body }),
    port: () => {
      globalThis.chrome.runtime.lastError = { message: 'The message port closed before a response was received.' }
      pending.pop()(undefined)
      globalThis.chrome.runtime.lastError = null
    },
  }
}

// Rouge sur le `l.sellerType === 'pro'` du `&&` de src/market.js : sans lui, un
// objet où seul `sellerId` est vrai — comme celui-ci — déclenche la demande
// vendeur. Aucun module de site n'intervient : les sites mettent déjà
// `sellerId: null` pour un particulier, ce qui masquerait la régression.
test('un particulier porteur d’un identifiant ne déclenche aucune demande', () => {
  const { sent } = setup()
  globalThis.ADS.market.want({ siteId: 'x1', site: 'lbc', sellerType: 'private', sellerId: 'x' })
  assert.deepEqual(sent, [])
})

test('un marchand porteur d’un identifiant, lui, déclenche la demande vendeur', () => {
  const { sent } = setup()
  globalThis.ADS.market.want({ siteId: 'x2', site: 'lbc', sellerType: 'pro', sellerId: 'y' })
  assert.deepEqual(sent.map((m) => m.type), ['seller'])
})

const seller = { siteId: 's1', site: 'lbc', sellerType: 'pro', sellerId: '9' }

// Rouge sur le `setTimeout(() => attempt(l, tries + 1), ...)` de
// src/market.js : sans lui, un port fermé — le service worker MV3 endormi au
// chargement de la fiche — efface la section pour le reste de la vie de
// l'onglet, sans qu'aucune seconde demande ne reparte.
test('un port fermé se reprend après une pause, et le résultat finit par arriver', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const { sent, answer, port } = setup()
    let found = 0
    globalThis.ADS.market.onFound(() => found++)
    globalThis.ADS.market.want(seller)
    assert.equal(sent.length, 1)
    port()
    assert.equal(sent.length, 1, 'aucune demande avant la pause')
    mock.timers.tick(5000)
    assert.equal(sent.length, 2, 'la reprise part après la pause')
    answer({ stats: { seller_name: 'Borgese Auto' } })
    assert.equal(found, 1)
    assert.deepEqual(globalThis.ADS.market.of('s1'), { seller: { seller_name: 'Borgese Auto' } })
  } finally {
    mock.timers.reset()
  }
})

// Rouge sur le `if (tries >= MAX_TRIES) return` de src/market.js : sans lui,
// un vendeur dont chaque demande échoue serait redemandé indéfiniment,
// martelant l'API tant que l'onglet reste ouvert.
test('trois échecs de suite arrêtent les reprises : pas de quatrième demande', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const { sent, port } = setup()
    globalThis.ADS.market.want({ ...seller, siteId: 's2' })
    port()
    mock.timers.tick(5000)
    port()
    mock.timers.tick(10000)
    port()
    mock.timers.tick(10 * 60 * 1000)
    assert.equal(sent.length, 3)
  } finally {
    mock.timers.reset()
  }
})

// Rouge sur le `res.ok` de `ask` dans src/market.js s'il se mettait à traiter
// `stats: null` comme un échec : un 404 — annonce ou vendeur inconnus de la
// base — est une réponse de l'API, pas une panne, et `lookup.js` le rend déjà
// en `ok: true, stats: null`. Le retenter reviendrait à boucler sur un
// vendeur que l'API ne connaîtra jamais.
test('un vendeur inconnu de l’API (404) ne déclenche qu’une seule demande', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const { sent, answer } = setup()
    globalThis.ADS.market.want({ ...seller, siteId: 's3' })
    answer({ stats: null })
    mock.timers.tick(10 * 60 * 1000)
    assert.equal(sent.length, 1)
  } finally {
    mock.timers.reset()
  }
})
