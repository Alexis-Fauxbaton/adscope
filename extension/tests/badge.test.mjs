import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { storage } from './storage.mjs'
import { ad, block, world } from './world.mjs'
import { CARDS, page, results } from './lc-page.mjs'

const require = createRequire(import.meta.url)
const src = (f) => join(dirname(fileURLToPath(import.meta.url)), '../src/', f)

// Le service worker seul sait à quel onglet une page appartient : le content
// script lui dit ce qu'il a trouvé, l'expéditeur dit où le poser.
const boot = () => {
  const painted = []
  let listener = null
  globalThis.ADS = undefined
  globalThis.chrome = {
    storage: { local: storage({ entries: { apiBase: 'http://api' } }).local },
    runtime: { onMessage: { addListener: (fn) => (listener = fn) } },
    action: {
      setBadgeText: async (o) => painted.push(o),
      setBadgeBackgroundColor: async () => {},
    },
  }
  globalThis.importScripts = () => {
    delete require.cache[require.resolve(src('cache.js'))]
    require(src('cache.js'))
  }
  delete require.cache[require.resolve(src('sw.js'))]
  require(src('sw.js'))
  return {
    painted,
    tell: (alerts, tabId = 7) =>
      new Promise((r) => listener({ type: 'badge', alerts }, tabId == null ? {} : { tab: { id: tabId } }, r)),
  }
}

// L'erreur déjà corrigée deux fois sur les pastilles : un badge toujours
// porteur d'un nombre devient du papier peint en deux jours.
test("le badge ne porte rien quand il n'y a rien à dire", async () => {
  const { painted, tell } = boot()
  await tell(0)
  assert.deepEqual(painted, [{ tabId: 7, text: '' }])
})

test("le badge porte le nombre d'annonces en alerte", async () => {
  const { painted, tell } = boot()
  await tell(4)
  assert.deepEqual(painted, [{ tabId: 7, text: '4' }])
})

// Une navigation monopage ne recharge pas le document : sans effacement
// explicite, le badge de la fiche précédente resterait sur la suivante.
test("passer sur une page sans alerte efface le badge de la précédente", async () => {
  const { painted, tell } = boot()
  await tell(3)
  await tell(0)
  assert.deepEqual(painted.map((p) => p.text), ['3', ''])
})

// Hors onglet — un message venu d'ailleurs — il n'y a pas d'icône à peindre.
test("sans onglet identifié, aucun badge n'est posé", async () => {
  const { painted, tell } = boot()
  await tell(3, null)
  assert.equal(painted.length, 0)
})

// Ce que le content script a trouvé : c'est lui qui alimente le badge.
test("une page de résultats annonce ce qu'elle a mis en alerte", () => {
  const w = page({
    path: '/listing?makesModelsCommercialNames=PEUGEOT',
    scripts: results(CARDS),
    cards: CARDS.map((c) => c.reference),
  })
  w.load('listing.js')
  const said = w.badges()
  assert.ok(said.length, 'le content script parle au service worker')
  assert.equal(said.at(-1).alerts, w.status().alerts)
  assert.equal(typeof w.status().alerts, 'number')
})

// Une fiche en alerte parle d'une annonce, une seule.
test("une fiche en alerte annonce une alerte, une fiche calme aucune", () => {
  const NOISY = '3254194817'
  const noisy = world('0', { path: `/ad/voitures/${NOISY}`, data: block(ad(NOISY)) })
  noisy.load('detail.js')
  assert.equal(noisy.badges().at(-1).alerts, noisy.status().alerts)
  assert.equal(noisy.status().alerts, noisy.status().card.notable ? 1 : 0)
})
