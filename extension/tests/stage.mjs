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

// Un nœud n'a qu'un parent : l'insérer ailleurs le retire d'abord d'où il est.
// Sans cela, réordonner des cartes les dupliquerait au lieu de les déplacer, et
// un test de tri ne dirait plus rien.
const detach = (n) => {
  const kin = n.parentElement && n.parentElement.children
  const at = kin ? kin.indexOf(n) : -1
  if (at >= 0) kin.splice(at, 1)
}

export class El {
  constructor(tag) {
    this.tag = tag
    this.attrs = {}
    this.children = []
    this.className = ''
    this.own = ''
    this.handlers = {}
  }
  addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn) }
  // Le clic tel que le lecteur le donne : le panneau n'écoute que celui-là.
  click() { for (const fn of this.handlers.click || []) fn() }
  set textContent(v) { this.own = v; this.children = [] }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this.own }
  get descendants() { return this.children.flatMap((c) => [c, ...c.descendants]) }
  setAttribute(k, v) { this.attrs[k] = String(v) }
  // `className` et l'attribut `class` sont la même chose dans un navigateur :
  // un sélecteur `[class*="adscope-"]` voit ce que le code a posé par la
  // propriété. Sans cela, le garde-fou qui compte les classes de l'extension —
  // celui dont dépend le contrôle de santé du crawl — ne trouvait jamais rien
  // et passait au vert quoi qu'on écrive.
  getAttribute(k) {
    if (k === 'class' && !(k in this.attrs)) return this.className || null
    return k in this.attrs ? this.attrs[k] : null
  }
  removeAttribute(k) { delete this.attrs[k] }
  append(...nodes) { for (const n of nodes) { detach(n); n.parentElement = this; this.children.push(n) } }
  appendChild(n) { this.append(n) }
  removeChild(n) { detach(n); n.parentElement = null; return n }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes) }
  // Le rang compte : c'est lui qui dit si le panneau s'est posé sous le prix ou
  // au pied de la page.
  get nextSibling() {
    const kin = this.parentElement ? this.parentElement.children : []
    return kin[kin.indexOf(this) + 1] || null
  }
  insertBefore(n, ref) {
    detach(n)
    n.parentElement = this
    const at = ref ? this.children.indexOf(ref) : -1
    if (at < 0) this.children.push(n)
    else this.children.splice(at, 0, n)
    return n
  }
  one(sel) {
    const rest = sel.replace(ATTR, '').trim()
    // Les trois façons de nommer un nœud que le code emploie : par sa balise,
    // par son identifiant, par une de ses classes.
    const tag = (rest.match(/^[a-zA-Z][\w-]*/) || [''])[0]
    if (tag && tag !== this.tag) return false
    for (const [, id] of rest.matchAll(/#([\w-]+)/g)) if (this.getAttribute('id') !== id) return false
    const classes = String(this.className || this.getAttribute('class') || '').split(/\s+/)
    for (const [, cls] of rest.matchAll(/\.([\w-]+)/g)) if (!classes.includes(cls)) return false
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
    createElementNS: (ns, t) => new El(t),
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
  let relayed = []
  // Ce que la mention de reconnexion ouvre : le seul geste qu'elle fait.
  const opened = []
  // Ce que le script orphelin écrit dans la console de la page. Retenu plutôt
  // qu'affiché : une suite de tests qui parle à la console ne se lit plus.
  const said = []
  console.info = (...parts) => said.push(parts.join(' '))
  globalThis.window = { open: (url, target) => opened.push({ url, target }) }
  globalThis.chrome = {
    storage: {
      local: {
        set: (o) => Object.assign(stored, o),
        get: async (keys) => {
          const out = {}
          for (const k of [].concat(keys)) if (k in stored) out[k] = stored[k]
          return out
        },
      },
    },
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
        // Ce que le service worker relaie vers l'API — le vendeur, le suivi
        // d'une annonce : c'est le test qui décide si la réponse revient.
        if (msg.type === 'seller' || msg.type === 'follow') return relayed.push({ msg, respond })
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
  // L'ordre du manifeste : chaque module trouve ceux dont il se sert au chargement.
  const MODULES = [
    'context.js', 'stale-notice.js', 'sites.js', 'sites/read.js', 'format.js', 'curve.js', 'view.js', 'diag.js',
    'sync.js', 'market.js', 'follow.js', 'feed.js', 'auth-notice.js', 'panel-node.js',
    'panel-icons.js', 'panel-labels.js', 'panel-curve.js', 'panel-note.js', 'panel-sections.js', 'panel-cards.js',
    'panel.js',
  ]
  for (const f of ['context.js', 'stale-notice.js', 'sites.js', 'sites/read.js', 'sites/vehicle-fields.js', ...[].concat(site), ...MODULES.slice(4)]) load(f)
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
    relayed: () => relayed.map((r) => r.msg),
    // La réponse de l'API à l'une de ces demandes, jouée quand le test le veut.
    answer: (type, body) => {
      for (const { msg, respond } of relayed) if (msg.type === type) respond({ ok: true, ...body })
      relayed = relayed.filter((r) => r.msg.type !== type)
    },
    // L'échec que 363 tests ne savaient pas simuler — celui qui laissait
    // passer l'oubli de reprise dans market.js et follow.js. `port` rejoue le
    // service worker endormi : le port se ferme, `lastError` se pose, la
    // réponse n'arrive pas. Sans lui, c'est un refus net de l'API (401, 500) —
    // `ok: false`, sans `lastError`.
    fail: (type, { port = true } = {}) => {
      for (const { msg, respond } of relayed) {
        if (msg.type !== type) continue
        if (port) {
          globalThis.chrome.runtime.lastError = { message: 'The message port closed before a response was received.' }
          respond(undefined)
          globalThis.chrome.runtime.lastError = null
        } else {
          respond({ ok: false })
        }
      }
      relayed = relayed.filter((r) => r.msg.type !== type)
    },
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
    // La session tombée, telle que sw.js la rapporte hors mode clé : un 401,
    // sans quoi la pastille et le panneau n'ont aucune raison de s'effacer.
    denySession: () => {
      for (const { respond } of pending.splice(0)) respond({ ok: false, reason: '401', authRequired: true })
    },
    receive: (payload, name = 'payload') =>
      bus.dispatchEvent(new CustomEvent(`adscope:${name}`, { detail: JSON.stringify(payload) })),
    // Où la mention de reconnexion ouvre l'application.
    opened: () => opened,
    // Ce que la console de la page a reçu — une ligne, une seule, quand
    // l'extension a été remplacée sous l'onglet.
    said: () => said,
  }
}
