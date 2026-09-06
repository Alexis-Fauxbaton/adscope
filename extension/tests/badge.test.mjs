import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { storage } from './storage.mjs'
import { ad, block, world } from './world.mjs'
import { at } from './stage.mjs'
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

// Ce que le content script a trouvé : c'est lui qui alimente le badge. Le nombre
// est celui compté à la main sur les 23 cartes de la page relevée au 6 septembre
// 2026 — huit dépassent le plafond de 60 jours. Le comparer au champ du
// diagnostic ne disait rien : les deux sortent du même objet, et 0 = 0.
test("une page de résultats annonce ce qu'elle a mis en alerte", () => {
  const w = at('2026-09-06T18:00:00Z', () => {
    const w = page({
      path: '/listing?makesModelsCommercialNames=PEUGEOT',
      scripts: results(CARDS),
      cards: CARDS.map((c) => c.reference),
    })
    w.load('listing.js')
    return w
  })
  const said = w.badges()
  assert.ok(said.length, 'le content script parle au service worker')
  assert.equal(said.at(-1).alerts, 8)
})

// Une fiche en alerte parle d'une annonce, une seule. Les deux cas sont posés :
// une annonce ancienne et encore poussée le 6 septembre 2026, et la même fiche
// fraîche — sans quoi « une alerte » et « aucune » resteraient indistinguables.
const NOISY = '3254194817'
const on = (a) => at('2026-09-06T18:00:00Z', () => {
  const w = world('0', { path: `/ad/voitures/${NOISY}`, data: block(a) })
  w.load('detail.js')
  return w
})

test("une fiche en alerte annonce une alerte, une fiche calme aucune", () => {
  // 128 jours en ligne, réactualisée cinq jours plus tôt : le seuil et l'alerte.
  const noisy = on({
    ...ad(NOISY),
    first_publication_date: '2026-05-01 10:00:00',
    index_date: '2026-09-01 10:00:00',
  })
  assert.equal(noisy.status().card.notable, true)
  assert.equal(noisy.status().alerts, 1)
  assert.equal(noisy.badges().at(-1).alerts, 1)

  const calm = on({
    ...ad(NOISY),
    first_publication_date: '2026-09-01 10:00:00',
    index_date: '2026-09-01 10:00:00',
  })
  assert.equal(calm.status().card.notable, false)
  assert.equal(calm.status().alerts, 0)
  assert.equal(calm.badges().at(-1).alerts, 0)
})
