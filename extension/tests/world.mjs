import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const src = (f) => join(here, '../src/', f)

export const FIXTURE = JSON.parse(readFileSync(join(here, 'fixtures/leboncoin-ads.json'), 'utf8'))
export const ad = (id) => FIXTURE.find((a) => String(a.list_id) === id)
export const block = (...ads) => JSON.stringify({ ads: ads.length ? ads : FIXTURE })

// Un DOM minimal : juste ce que les deux content scripts touchent réellement.
class El {
  constructor(tag) {
    this.tag = tag
    this.attrs = {}
    this.children = []
    this.className = ''
    this.own = ''
  }
  set textContent(v) { this.own = v; this.children = [] }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this.own }
  get descendants() { return this.children.flatMap((c) => [c, ...c.descendants]) }
  setAttribute(k, v) { this.attrs[k] = String(v) }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null }
  append(...nodes) { for (const n of nodes) { n.parentElement = this; this.children.push(n) } }
  appendChild(n) { this.append(n) }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes) }
  insertBefore(n) { this.append(n) }
  matches(sel) { return sel.startsWith('[') ? this.getAttribute(sel.slice(1, -1)) !== null : this.tag === sel }
  querySelector(sel) { return this.descendants.find((n) => n.matches(sel)) || null }
  closest(sel) {
    for (let n = this; n; n = n.parentElement) if (n.matches(sel)) return n
    return null
  }
}

// `link` n'est rendu que pour la carte demandée, comme le ferait la page.
// `path` et `data` décrivent la page ouverte : quelle fiche l'URL désigne, et
// quelles annonces le bloc `__NEXT_DATA__` porte. `receive` joue ce que le
// script de monde MAIN publie quand le navigateur reçoit une nouvelle page.
export const world = (targetId, { path = '/ad/voitures/3254194817', data = block() } = {}) => {
  const counts = { extract: 0, scan: 0 }
  const body = new El('body')
  const date = new El('p')
  date.textContent = 'il y a 3 jours à 15:36'
  const link = new El('a')
  const card = new El('article')
  card.append(link)
  const nextData = new El('script')
  nextData.textContent = data
  body.append(new El('h1'), date, card)

  const doc = {
    body,
    getElementById: (id) => (id === '__NEXT_DATA__' ? nextData : null),
    createElement: (t) => new El(t),
    querySelectorAll: (sel) =>
      (counts.scan++, sel.startsWith('[') ? body.descendants.filter((n) => n.matches(sel)) : body.descendants),
    querySelector: (sel) =>
      sel.startsWith('a[href') ? (sel.match(/\/(\d+)"/)[1] === targetId ? link : null) : body.querySelector(sel),
  }

  const listeners = []
  let signals = {}
  const batches = []
  globalThis.document = doc
  const stored = {}
  globalThis.chrome = { storage: { local: { set: (o) => Object.assign(stored, o) } } }
  const [pathname, query] = path.split('?')
  globalThis.location = { pathname, search: query ? `?${query}` : '' }
  const bus = new EventTarget()
  globalThis.addEventListener = (type, fn) => bus.addEventListener(type, fn)
  globalThis.MutationObserver = class {
    constructor(fn) { batches.push(fn) }
    observe() {}
  }
  globalThis.ADS = undefined
  for (const f of ['sites/leboncoin.js', 'format.js', 'view.js', 'diag.js', 'feed.js']) {
    delete require.cache[require.resolve(src(f))]
    require(src(f))
  }
  const extract = ADS.leboncoin.fromDocument
  ADS.leboncoin.fromDocument = (d) => (counts.extract++, extract(d))
  ADS.sync = { send() {}, onSignals: (fn) => listeners.push(fn), of: (id) => signals[id] || null }

  // Une navigation monopage : l'URL et la charge JSON changent, le DOM survit.
  const visit = (a) => {
    globalThis.location = { pathname: `/ad/voitures/${a.list_id}`, search: '' }
    nextData.textContent = JSON.stringify({ props: { ad: a } })
  }

  return {
    counts,
    card,
    visit,
    status: () => stored.status,
    panel: () => body.querySelector('[data-adscope-detail]'),
    badge: () => card.querySelector('[data-adscope]'),
    mutate: (n) => { for (let i = 0; i < n; i++) for (const fn of batches) fn() },
    arrive: (byId) => { signals = byId; for (const fn of listeners) fn(signals) },
    receive: (payload) =>
      bus.dispatchEvent(new CustomEvent('adscope:payload', { detail: JSON.stringify(payload) })),
    load: (f) => { delete require.cache[require.resolve(src(f))]; require(src(f)) },
  }
}
