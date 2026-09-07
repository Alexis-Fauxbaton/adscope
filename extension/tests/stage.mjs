import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const src = (f) => join(here, '../src/', f)

// Un DOM minimal : juste ce que les content scripts touchent réellement. Les
// sélecteurs sont lus assez finement pour que la carte d'une annonce se
// distingue de celle d'une autre — c'est par là que passe le pastillage.
const ATTR = /\[([\w-]+)(?:([*$]?=)"([^"]*)")?\]/g

export class El {
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
  one(sel) {
    const tag = sel.replace(ATTR, '').trim()
    if (tag && tag !== this.tag) return false
    for (const [, name, op, value] of sel.matchAll(ATTR)) {
      const got = this.getAttribute(name)
      if (got === null) return false
      if (op === '=' && got !== value) return false
      if (op === '*=' && !got.includes(value)) return false
      if (op === '$=' && !got.endsWith(value)) return false
    }
    return true
  }
  matches(sel) { return sel.split(',').some((one) => this.one(one.trim())) }
  querySelectorAll(sel) { return this.descendants.filter((n) => n.matches(sel)) }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null }
  closest(sel) {
    for (let n = this; n; n = n.parentElement) if (n.matches(sel)) return n
    return null
  }
}

// Le jour du relevé, tenu fixe le temps d'un rendu. Les comptes attendus sont
// calculés à la main sur cette date : une horloge qui avance les ferait dériver
// d'un cran par jour, et le test cesserait de dire quoi que ce soit.
export const at = (iso, fn) => {
  const Real = Date
  globalThis.Date = class extends Real {
    constructor(...args) { super(...(args.length ? args : [iso])) }
    static now() { return new Real(iso).getTime() }
  }
  try {
    return fn()
  } finally {
    globalThis.Date = Real
  }
}

// Le décor commun aux deux sites : stockage, runtime, observateur, chargement
// des modules dans l'ordre du manifeste. Le DOM, lui, est monté par l'appelant :
// c'est la seule chose que la page d'un site ne partage pas avec l'autre.
export const stage = (body, { origin, path, cache = {}, site, byId = () => null }) => {
  const counts = { extract: 0, scan: 0 }
  const doc = {
    body,
    // Le titre de la page : c'est le second témoin de la signature d'absence,
    // et une page vivante n'en porte pas de particulier.
    title: '',
    getElementById: byId,
    createElement: (t) => new El(t),
    querySelectorAll: (sel) => (counts.scan++, body.querySelectorAll(sel)),
    querySelector: (sel) => body.querySelector(sel),
  }

  const batches = []
  globalThis.document = doc
  const stored = {}
  // Le service worker de fabrique : il retient les envois sans y répondre, et
  // `arrive` joue sa réponse quand le test le décide.
  const pending = []
  const emitted = []
  const asked = []
  const painted = []
  globalThis.chrome = {
    storage: { local: { set: (o) => Object.assign(stored, o) } },
    runtime: {
      id: 'adscope',
      lastError: null,
      // La lecture du cache répond seule et tout de suite, comme le fait le
      // service worker : c'est ce qui permet à l'encart de s'afficher avant
      // le réseau. `cache` dit ce que l'extension savait déjà.
      sendMessage: (msg, respond) => {
        // Le badge ne touche ni au réseau ni au cache : le service worker le
        // pose sur l'onglet d'où vient le message.
        if (msg.type === 'badge') return painted.push(msg), respond({ ok: true })
        if (msg.type !== 'cached') return emitted.push(msg), pending.push({ msg, respond })
        asked.push(msg)
        const hits = msg.ids.filter((id) => id in cache).map((id) => [id, cache[id]])
        respond({ ok: true, signals: Object.fromEntries(hits) })
      },
    },
  }

  const goto = (to) => {
    const [pathname, query] = to.split('?')
    globalThis.location = { origin, pathname, search: query ? `?${query}` : '' }
  }
  goto(path)

  const bus = new EventTarget()
  globalThis.addEventListener = (type, fn) => bus.addEventListener(type, fn)
  globalThis.MutationObserver = class {
    constructor(fn) { this.fn = fn; this.live = true; batches.push(this) }
    observe() {}
    disconnect() { this.live = false }
  }
  globalThis.ADS = undefined
  const load = (f) => { delete require.cache[require.resolve(src(f))]; require(src(f)) }
  for (const f of ['context.js', 'sites.js', 'sites/read.js', site, 'format.js', 'view.js', 'diag.js', 'sync.js', 'feed.js']) load(f)
  // Le travail lourd, compté à travers le registre : le code partagé y accède
  // de la même façon, par le site que l'origine désigne.
  const current = ADS.sites.current()
  const extract = current.fromDocument
  current.fromDocument = (d) => (counts.extract++, extract(d))

  return {
    counts,
    doc,
    goto,
    load,
    status: () => stored.status,
    mutate: (n) => { for (let i = 0; i < n; i++) for (const o of batches) if (o.live) o.fn() },
    observing: () => batches.filter((o) => o.live).length,
    // Ce que devient un content script quand l'extension est remplacée : plus
    // d'identifiant de runtime, et tout appel `chrome.*` qui lève.
    invalidate: () => {
      const dead = () => { throw new Error('Extension context invalidated.') }
      globalThis.chrome = { runtime: { lastError: null, sendMessage: dead }, storage: { local: { set: dead } } }
    },
    // Ce que le content script a émis : un message par lot, dédoublonné par lui.
    messages: () => emitted,
    asked: () => asked,
    badges: () => painted,
    queued: () => emitted.flatMap((m) => m.listings.map((l) => l.siteId)),
    // L'API ne répond que sur les identifiants du lot qu'on lui a soumis.
    arrive: (byId) => {
      for (const { msg, respond } of pending.splice(0)) {
        const ids = new Set(msg.listings.map((l) => l.siteId))
        const answered = Object.entries(byId).filter(([id]) => ids.has(id))
        respond({ ok: true, sent: msg.listings.length, signals: Object.fromEntries(answered) })
      }
    },
    receive: (payload, name = 'payload') =>
      bus.dispatchEvent(new CustomEvent(`adscope:${name}`, { detail: JSON.stringify(payload) })),
  }
}
