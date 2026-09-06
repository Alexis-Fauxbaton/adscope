import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const src = (f) => join(here, '../src/', f)
const FIXTURE = JSON.parse(readFileSync(join(here, 'fixtures/leboncoin-ads.json'), 'utf8'))
const NEXT_DATA = JSON.stringify({ ads: FIXTURE })
const ad = (id) => FIXTURE.find((a) => String(a.list_id) === id)

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
const world = (targetId) => {
  const counts = { extract: 0, scan: 0 }
  const body = new El('body')
  const date = new El('p')
  date.textContent = 'il y a 3 jours à 15:36'
  const link = new El('a')
  const card = new El('article')
  card.append(link)
  const nextData = new El('script')
  nextData.textContent = NEXT_DATA
  body.append(new El('h1'), date, card)

  const doc = {
    body,
    getElementById: (id) => (id === '__NEXT_DATA__' ? nextData : null),
    createElement: (t) => new El(t),
    querySelectorAll: () => (counts.scan++, body.descendants),
    querySelector: (sel) =>
      sel.startsWith('a[href') ? (sel.match(/\/(\d+)"/)[1] === targetId ? link : null) : body.querySelector(sel),
  }

  const listeners = []
  let signals = {}
  const batches = []
  globalThis.document = doc
  globalThis.chrome = { storage: { local: { set() {} } } }
  globalThis.location = { pathname: '/ad/voitures/3254194817' }
  globalThis.MutationObserver = class {
    constructor(fn) { batches.push(fn) }
    observe() {}
  }
  globalThis.ADS = undefined
  for (const f of ['sites/leboncoin.js', 'format.js', 'view.js']) {
    delete require.cache[require.resolve(src(f))]
    require(src(f))
  }
  const extract = ADS.leboncoin.fromDocument
  ADS.leboncoin.fromDocument = (d) => (counts.extract++, extract(d))
  ADS.sync = { send() {}, onSignals: (fn) => listeners.push(fn), of: (id) => signals[id] || null }

  // Une navigation monopage : l'URL et la charge JSON changent, le DOM survit.
  const visit = (a) => {
    globalThis.location = { pathname: `/ad/voitures/${a.list_id}` }
    nextData.textContent = JSON.stringify({ props: { ad: a } })
  }

  return {
    counts,
    card,
    visit,
    panel: () => body.querySelector('[data-adscope-detail]'),
    badge: () => card.querySelector('[data-adscope]'),
    mutate: (n) => { for (let i = 0; i < n; i++) for (const fn of batches) fn() },
    arrive: (byId) => { signals = byId; for (const fn of listeners) fn(signals) },
    load: (f) => { delete require.cache[require.resolve(src(f))]; require(src(f)) },
  }
}

test('la fiche ne refait pas le travail lourd à chaque lot de mutations', () => {
  const w = world('0')
  w.load('detail.js')
  assert.deepEqual(w.counts, { extract: 1, scan: 1 })

  // Le carrousel, le lazy-loading et l'en-tête collant mutent en permanence.
  w.mutate(20)
  assert.deepEqual(w.counts, { extract: 1, scan: 1 })

  // Un seul rendu de plus quand les signaux arrivent, puis plus rien.
  w.arrive({ [w.panel().getAttribute('data-adscope-detail')]: { tracked_days: 12, observations: 3, price: 29190 } })
  assert.deepEqual(w.counts, { extract: 2, scan: 2 })
  w.mutate(20)
  assert.deepEqual(w.counts, { extract: 2, scan: 2 })
  assert.ok(w.panel().textContent.includes('Suivi adscope'))
})

test('la pastille pose un nœud par origine', () => {
  const w = world('3254194817')
  w.load('listing.js')
  const first = w.badge().children
  assert.deepEqual(first.map((c) => c.className), ['adscope-badge-page'])

  w.arrive({ 3254194817: { price: 29190, price_delta_since_first: -800, price_delta_days_since_first: 12 } })
  const [page, tracked] = w.badge().children
  assert.equal(tracked.className, 'adscope-badge-tracked')
  assert.match(tracked.textContent, /^▼ −800/)
  assert.ok(!page.textContent.includes('▼'))
})

test('la fiche suivante chasse la précédente en navigation monopage', () => {
  const w = world('0')
  w.visit(ad('3254194817'))
  w.load('detail.js')
  assert.equal(w.panel().getAttribute('data-adscope-detail'), '3254194817')
  assert.match(w.panel().textContent, /professionnel/)

  // Le panneau posé survit au passage à la fiche suivante : le laisser tel quel
  // afficherait l'ancienneté du véhicule que le lecteur vient de quitter.
  w.visit(ad('3263931610'))
  w.mutate(1)
  assert.equal(w.panel().getAttribute('data-adscope-detail'), '3263931610')
  assert.match(w.panel().textContent, /particulier/)
  assert.doesNotMatch(w.panel().textContent, /professionnel/)
})
