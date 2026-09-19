import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const popup = (f) => join(here, '../popup/', f)
const src = (f) => join(here, '../src/', f)

// Un document de fabrique : la fenêtre ne touche qu'à des éléments par
// identifiant, du texte, des attributs et des enfants — SVG compris, dont seuls
// les attributs comptent ici.
export class El {
  constructor(tag = '') {
    this.tag = tag
    this.attrs = {}
    this.children = []
    this.className = ''
    this.textContent = ''
    this.value = ''
    this.hidden = false
    this.handlers = {}
  }
  focus() {}
  addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn) }
  // Le clic tel que le lecteur le donne, et ce qu'il déclenche : les boutons
  // des alertes demandent au navigateur, puis rejouent leur rendu.
  click() { return Promise.all((this.handlers.click || []).map((fn) => fn())) }
  setAttribute(k, v) { this.attrs[k] = String(v) }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null }
  append(...nodes) { this.children.push(...nodes) }
  replaceChildren(...nodes) { this.children = [...nodes] }
  get text() { return [this.textContent, ...this.children.map((c) => c.text)].join(' ').trim() }
  get all() { return this.children.flatMap((c) => [c, ...c.all]) }
  tagged(tag) { return this.all.filter((n) => n.tag === tag) }
}

const DAY = 86400000
export const ago = (days) => new Date(Date.now() - days * DAY).toISOString()

// Le suivi mutualisé tel que le service worker le tient en cache : c'est de là
// que la fenêtre tire l'historique de prix qu'elle trace. Les dates sont
// relatives au jour du test : l'axe va toujours jusqu'à aujourd'hui.
export const signals = (over = {}) => ({
  site_id: '1', first_seen: ago(118), last_seen: ago(2),
  observations: 14, tracked_days: 118, price: 12900,
  price_history: [
    { at: ago(118), price: 14900, confirmation: false },
    { at: ago(90), price: 13900, confirmation: false },
    { at: ago(83), price: 13900, confirmation: true },
    { at: ago(48), price: 12900, confirmation: false },
    { at: ago(2), price: 12900, confirmation: true },
  ],
  price_delta_since_first: -2000, price_delta_days_since_first: 118,
  stable_days: 48, price_checks: 1, price_gap_days: 46,
  ...over,
})

export const stats = (over = {}) => ({
  site: 'lbc', seller_id: '73911', seller_name: 'ENTREPOT 222',
  listings: 11, aged: 11, window_days: 30, over_a_month: 3,
  over_a_month_share: 0.273, median_age_days: 7, price_changed_listings: 0,
  price_drop_listings: 0, price_drop_rate: null, price_drop_after_days: null,
  ...over,
})

export const card = (over = {}) => ({
  title: 'Peugeot 208 phase 2 · 1.2 PureTech', price: 12900, mileage: 3574, year: 2020,
  onlineDays: 118, publishedAt: ago(118), notable: false, dormant: true,
  claim: null, ...over,
})

export const detail = (over = {}) => ({
  kind: 'detail', url: '/ad/voitures/1', payload: true, source: 'live', listings: 1,
  pickedId: '1', urlId: '1', matchesUrl: true, sellerType: 'pro', site: 'lbc',
  sellerId: '73911', sellerName: 'ENTREPOT 222', sources: { cache: 0, network: 1 },
  card: card(), ...over,
})

const FILES = [
  ['../src/', 'sites.js'], ['../src/', 'sites/read.js'],
  ['../src/', 'sites/leboncoin.js'], ['../src/', 'sites/lacentrale.js'],
  ['../src/', 'format.js'], ['../src/', 'health.js'],
  ['../popup/', 'dom.js'], ['../popup/', 'config.js'], ['../popup/', 'report.js'], ['../popup/', 'seller.js'],
  ['../src/', 'curve.js'], ['../popup/', 'labels.js'], ['../popup/', 'chart.js'], ['../popup/', 'fiche.js'],
  ['../popup/', 'account.js'], ['../popup/', 'alerts.js'], ['../popup/', 'popup.js'],
]

// La fenêtre telle qu'elle s'ouvre : le stockage rend le dernier diagnostic, le
// service worker rend le cache, et `answer` joue l'API sur le vendeur.
export const open = async ({
  status,
  cached = null,
  answer = async () => ({ ok: true, json: async () => stats() }),
  apiBase = 'http://api',
  licenseKey = 'adsc_' + 'a'.repeat(32),
  granted = true,
  // Ce que le service worker répond à `{ type: 'me' }` — déconnecté par
  // défaut, comme la popup doit l'être tant qu'elle n'a rien appris.
  me = { ok: false },
  // Les problèmes que le service worker rapporte à `{ type: 'health' }` —
  // aucun par défaut, comme une extension en bon état.
  problems = [],
} = {}) => {
  const nodes = {}
  // Les sections écrites masquées dans popup.html : c'est l'état de départ.
  for (const id of ['seller-box', 'fiche', 'summary', 'claim', 'hatch', 'empty', 'points', 'alerts']) {
    nodes[id] = new El()
    nodes[id].hidden = true
  }
  const asked = []
  const messages = []
  const opened = []
  const requested = []
  globalThis.window = { open: (url, target) => opened.push({ url, target }) }
  globalThis.document = {
    getElementById: (id) => (nodes[id] = nodes[id] || new El()),
    createElement: (t) => new El(t),
    createElementNS: (_ns, t) => new El(t),
  }
  globalThis.chrome = {
    storage: { local: { get: async () => ({ licenseKey, apiBase, status }), set: async () => {} } },
    runtime: {
      sendMessage: async (msg) => {
        messages.push(msg)
        if (msg.type === 'cached') return { ok: true, signals: cached ? { [status.pickedId]: cached } : {} }
        if (msg.type === 'me') return me
        if (msg.type === 'health') return { ok: true, problems }
        // Ce que `sw.js` rend pour `{ type: 'seller' }` : relayé à `ADS.lookup.seller`,
        // par `ADS.auth` — c'est cette route réseau, pas un `fetch` de la popup, que
        // `answer` simule ici, comme le fait le service worker réel.
        if (msg.type === 'seller') {
          const url = `${apiBase}/v1/sellers/${msg.site}/${msg.sellerId}`
          asked.push(url)
          const res = await answer(url, {})
          return { ok: true, stats: res.ok ? await res.json() : null }
        }
        return { entries: 0, bytes: 0, quota: 1000 }
      },
    },
    // Ce que la fenêtre demande au navigateur : `asked` retient les origines
    // pour lesquelles elle a réclamé l'accès, et dans quel ordre.
    permissions: {
      contains: async () => granted,
      request: async (o) => (requested.push(o), granted),
    },
  }
  globalThis.fetch = (url, init) => (asked.push(url), answer(url, init))
  globalThis.location = { origin: 'chrome-extension://adscope' }
  globalThis.ADS = undefined
  for (const [dir, f] of FILES) {
    const path = join(here, dir, f)
    delete require.cache[require.resolve(path)]
    require(path)
  }
  await new Promise((r) => setTimeout(r, 0))
  return { nodes, asked, messages, opened, requested, popup, src }
}
