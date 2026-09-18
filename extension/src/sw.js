importScripts('/src/cache.js', '/src/auth.js', '/src/lookup.js')

const DEFAULTS = { apiBase: 'http://localhost:8000', licenseKey: '' }

// Six heures. Ce que l'encart affiche se compte en jours pleins — « suivie
// depuis 12 j », « stable depuis 3 j » — et rien de visible ne peut changer
// dans l'intervalle. Le seuil range donc les passages répétés d'un marchand
// sur la même page de résultats en un seul aller-retour, tout en laissant au
// moins quatre observations par jour et par annonce consultée.
const FRESH_MS = 6 * 3600 * 1000

const config = async () => ({
  ...DEFAULTS,
  ...(await chrome.storage.local.get(Object.keys(DEFAULTS))),
})

const toObservation = (l) => ({
  site: l.site,
  site_id: l.siteId,
  price: l.price ?? null,
  brand: l.brand ?? null,
  model: l.model ?? null,
  version: l.version ?? null,
  year: l.year ?? null,
  mileage: l.mileage ?? null,
  seller_type: l.sellerType ?? null,
  seller_id: l.sellerId ?? null,
  seller_name: l.sellerName ?? null,
  published_at: l.publishedAt ?? null,
  bumped_at: l.bumpedAt ?? null,
})

// Ce que l'observation apprendrait à l'API. Inchangée, elle ne lui apprend
// rien ; changée, elle passe outre le seuil de fraîcheur — un prix qui bouge
// est précisément ce qu'on ne veut pas retenir six heures.
const signature = (l) => [l.price ?? '', l.publishedAt ?? '', l.bumpedAt ?? ''].join('|')

const stale = (listing, entry, now) =>
  !entry || now - entry.at >= FRESH_MS || entry.sig !== signature(listing)

// Clé configurée → Bearer, machines inchangées ; sinon cookie de session et
// jeton CSRF. `method` vaut POST par défaut ; `me` seul lit, en GET.
const call = async (path, body, cfg, method = 'POST') => {
  const res = await fetch(cfg.apiBase + path, {
    method,
    headers: ADS.auth.headers(cfg, body ? { 'Content-Type': 'application/json' } : {}),
    credentials: ADS.auth.credentials(cfg),
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const authRequired = await ADS.auth.mark(cfg, res.status)
  if (!res.ok) {
    const e = new Error(`${res.status}`)
    e.authRequired = authRequired
    throw e
  }
  return res.json()
}

// Un seul aller-retour côté content script : on pousse ce qui a été vu, puis
// on récupère ce que le pool sait déjà, pour ce qui manque au cache ou a vieilli.
const sync = async (site, listings) => {
  const now = Date.now()
  const cfg = await config()
  await ADS.cache.purgeDaily(now).catch(() => {})
  const known = await ADS.cache.read(site, listings.map((l) => l.siteId))
  const due = listings.filter((l) => stale(l, known[l.siteId], now))
  if (!due.length) return { ok: true, sent: 0, signals: {}, skipped: listings.length }

  const items = due.map(toObservation)
  for (let i = 0; i < items.length; i += 100) {
    await call('/v1/observations', { items: items.slice(i, i + 100) }, cfg)
  }

  const signals = {}
  const ids = due.map((l) => l.siteId)
  for (let i = 0; i < ids.length; i += 30) {
    const batch = await call('/v1/listings/batch', { site, ids: ids.slice(i, i + 30) }, cfg)
    for (const s of batch) signals[s.site_id] = s
  }

  const entries = {}
  for (const l of due) {
    if (signals[l.siteId]) entries[l.siteId] = { at: now, sig: signature(l), signals: signals[l.siteId] }
  }
  await ADS.cache.write(site, entries)
  return { ok: true, sent: items.length, signals, skipped: listings.length - due.length }
}

// Ce qu'on savait, tout de suite et sans réseau. Hors ligne, c'est la seule
// réponse que l'extension obtiendra, et elle suffit à afficher le suivi.
const cachedSignals = async (site, ids) => {
  const known = await ADS.cache.read(site, ids)
  const signals = {}
  for (const [id, entry] of Object.entries(known)) signals[id] = entry.signals
  return { ok: true, signals }
}

// Ce que la page a dit d'elle-même quand elle ne portait plus d'annonce. Rien
// n'est mis en cache : ce n'est pas un signal à afficher.
const absent = async (site, siteId, evidence) => {
  const cfg = await config()
  const { verdict } = await call('/v1/disappearances', { site, site_id: siteId, evidence }, cfg)
  return { ok: true, verdict }
}

// Suivre une annonce, par licence : la seule écriture que le lecteur commande.
// L'API répond 201 la première fois et 200 ensuite, sans distinction ici — la
// réponse n'est pas mise en cache, la liste des suivis reste au serveur.
const follow = async (site, siteId) => {
  const cfg = await config()
  return { ok: true, ...(await call('/v1/follows', { site, site_id: siteId }, cfg)) }
}

// Ce que la popup montre à la place d'une clé : qui est connecté (`email` nul pour une clé de machine).
const me = async () => ({ ok: true, ...(await call('/v1/me', null, await config(), 'GET')) })

// Le rouge de tampon, réservé à l'alerte — le même que celui de la fenêtre.
const BADGE_COLOR = '#9f1239'

// Le badge de l'icône, par onglet — un nombre toujours affiché devient du
// papier peint en deux jours, donc rien à dire, rien d'affiché.
const badge = async (alerts, tab) => {
  if (!tab) return { ok: false, reason: 'no-tab' }
  const text = alerts > 0 ? String(alerts) : ''
  if (text) await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: BADGE_COLOR })
  await chrome.action.setBadgeText({ tabId: tab.id, text })
  return { ok: true, text }
}

const handlers = {
  cached: (msg) => cachedSignals(msg.site, msg.ids),
  sync: (msg) => sync(msg.site, msg.listings),
  absent: (msg) => absent(msg.site, msg.siteId, msg.evidence),
  follow: (msg) => follow(msg.site, msg.siteId),
  comparables: async (msg) => ADS.lookup.comparables(msg.site, msg.siteId, await config()),
  seller: async (msg) => ADS.lookup.seller(msg.site, msg.sellerId, await config()),
  badge: (msg, sender) => badge(msg.alerts, sender && sender.tab),
  me: () => me(),
  'cache-stats': () => ADS.cache.stats(),
  'cache-clear': async () => ({ ok: true, cleared: await ADS.cache.clear() }),
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  const handler = handlers[msg && msg.type]
  if (!handler) return false
  handler(msg, sender)
    .then(respond)
    .catch((e) => respond({ ok: false, reason: e.message, authRequired: !!e.authRequired }))
  return true
})
