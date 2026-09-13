import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// `ADS.market` seul, sans passer par un module de site : la garde est une
// défense en profondeur, elle se juge sur l'objet qu'elle reçoit, pas sur ce
// qu'un site choisit de lui donner.
const setup = () => {
  const sent = []
  globalThis.chrome = {
    runtime: { id: 'test', sendMessage: (msg) => sent.push(msg) },
  }
  globalThis.ADS = undefined
  for (const f of ['context.js', 'market.js']) {
    const path = join(here, '../src/', f)
    delete require.cache[require.resolve(path)]
    require(path)
  }
  return sent
}

// Rouge sur le `l.sellerType === 'pro'` du `&&` de src/market.js : sans lui, un
// objet où seul `sellerId` est vrai — comme celui-ci — déclenche la demande
// vendeur. Aucun module de site n'intervient : les sites mettent déjà
// `sellerId: null` pour un particulier, ce qui masquerait la régression.
test('un particulier porteur d’un identifiant ne déclenche aucune demande', () => {
  const sent = setup()
  globalThis.ADS.market.want({ siteId: 'x1', site: 'lbc', sellerType: 'private', sellerId: 'x' })
  assert.deepEqual(sent, [])
})

test('un marchand porteur d’un identifiant, lui, déclenche la demande vendeur', () => {
  const sent = setup()
  globalThis.ADS.market.want({ siteId: 'x2', site: 'lbc', sellerType: 'pro', sellerId: 'y' })
  assert.deepEqual(sent.map((m) => m.type), ['seller'])
})
