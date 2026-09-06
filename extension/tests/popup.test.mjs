import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const popup = (f) => join(here, '../popup/', f)

// Un document de fabrique : la popup ne touche qu'à des éléments par
// identifiant, du texte et des enfants. C'est assez pour vérifier le câblage —
// que le bloc vendeur soit demandé, rempli et montré.
class El {
  constructor() {
    this.children = []
    this.className = ''
    this.textContent = ''
    this.value = ''
    this.hidden = false
  }
  focus() {}
  append(...nodes) { this.children.push(...nodes) }
  replaceChildren(...nodes) { this.children = [...nodes] }
  get text() { return [this.textContent, ...this.children.map((c) => c.text)].join(' ').trim() }
}

const stats = (over = {}) => ({
  site: 'lbc', seller_id: '73911', seller_name: 'ENTREPOT 222',
  listings: 11, aged: 11, over_a_month: 3, over_a_month_share: 0.273,
  median_age_days: 7, price_changed_listings: 0, price_drop_listings: 0,
  price_drop_rate: null, price_drop_after_days: null, ...over,
})

const detail = (over = {}) => ({
  kind: 'detail', url: '/ad/voitures/1', nextData: true, source: 'live', listings: 1,
  pickedId: '1', urlId: '1', matchesUrl: true, sellerType: 'pro', site: 'lbc',
  sellerId: '73911', sellerName: 'ENTREPOT 222', sources: { cache: 0, network: 1 }, ...over,
})

const open = async ({ status, answer = async () => ({ ok: true, json: async () => stats() }) }) => {
  // La section vendeur est écrite masquée dans popup.html : c'est l'état de
  // départ que ce document reproduit.
  const nodes = { 'seller-box': new El() }
  nodes['seller-box'].hidden = true
  const asked = []
  globalThis.document = {
    getElementById: (id) => (nodes[id] = nodes[id] || new El()),
    createElement: () => new El(),
  }
  globalThis.chrome = {
    storage: {
      local: {
        get: async () => ({ licenseKey: 'adsc_' + 'a'.repeat(32), apiBase: 'http://api', status }),
        set: async () => {},
      },
    },
    runtime: { sendMessage: async () => ({ entries: 0, bytes: 0, quota: 1000 }) },
  }
  globalThis.fetch = (url, init) => (asked.push(url), answer(url, init))
  globalThis.ADS = undefined
  for (const f of ['config.js', 'report.js', 'seller.js']) {
    delete require.cache[require.resolve(popup(f))]
    require(popup(f))
  }
  delete require.cache[require.resolve(popup('popup.js'))]
  require(popup('popup.js'))
  await new Promise((r) => setTimeout(r, 0))
  return { nodes, asked }
}

test('sur une fiche de marchand, la popup demande et montre son stock', async () => {
  const { nodes, asked } = await open({ status: detail() })
  assert.equal(asked[0], 'http://api/v1/sellers/lbc/73911')
  assert.equal(nodes['seller-box'].hidden, false)
  assert.equal(nodes['seller-title'].textContent, 'Ce vendeur — ENTREPOT 222')
  assert.match(nodes.seller.text, /11 annonces en ligne/)
  assert.match(nodes.seller.text, /Médiane d'ancienneté/)
})

test('un particulier ne déclenche aucune demande et aucun bloc', async () => {
  const { nodes, asked } = await open({
    status: detail({ sellerType: 'private', sellerId: null, sellerName: null }),
  })
  assert.equal(asked.length, 0)
  assert.equal(nodes['seller-box'].hidden, true)
})

test('une page de résultats ne parle pas de vendeur', async () => {
  const { nodes, asked } = await open({ status: { kind: 'listing', url: '/voitures', nextData: true, listings: 24, pro: 18, badges: 24, sent: 24 } })
  assert.equal(asked.length, 0)
  assert.equal(nodes['seller-box'].hidden, true)
})

// Un vendeur que la base ne connaît pas encore : la popup se tait plutôt que
// d'afficher un bloc vide.
test('un vendeur inconnu laisse la fenêtre inchangée', async () => {
  const { nodes } = await open({
    status: detail(), answer: async () => ({ ok: false, status: 404 }),
  })
  assert.equal(nodes['seller-box'].hidden, true)
})

test('la note du petit échantillon arrive jusqu’à la fenêtre', async () => {
  const { nodes } = await open({
    status: detail(),
    answer: async () => ({ ok: true, json: async () => stats({ listings: 3, aged: 3, over_a_month: 1, over_a_month_share: 0.333, median_age_days: 12 }) }),
  })
  assert.match(nodes.seller.text, /3 annonces/)
})
