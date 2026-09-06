importScripts('/src/cache.js')

const DEFAULTS = { apiBase: 'http://localhost:8000', licenseKey: '' }

// Six heures. Ce que l'encart affiche se compte en jours pleins — « suivie
// depuis 12 j », « stable depuis 3 j », « ▼ −500 € en 2 mois » — et une baisse
// de prix ou une réactualisation est un événement quotidien : rien de visible
// ne peut changer dans l'intervalle. Le seuil range donc les passages répétés
// d'un marchand sur la même page de résultats — l'usage réel — en un seul
// aller-retour, tout en laissant au moins quatre observations par jour et par
// annonce consultée : le compteur de fraîcheur partagé avec le crawler et la
// mesure d'usage par licence restent justes à la journée.
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

const call = async (path, body, { apiBase, licenseKey }) => {
  const res = await fetch(apiBase + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${licenseKey}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

// Un seul aller-retour côté content script : on pousse ce qui a été vu, puis
// on récupère ce que le pool sait déjà — mais seulement pour ce qui manque au
// cache ou y a vieilli.
const sync = async (site, listings) => {
  const now = Date.now()
  const cfg = await config()
  if (!cfg.licenseKey) return { ok: false, reason: 'no-key' }

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

const handlers = {
  cached: (msg) => cachedSignals(msg.site, msg.ids),
  sync: (msg) => sync(msg.site, msg.listings),
  'cache-stats': () => ADS.cache.stats(),
  'cache-clear': async () => ({ ok: true, cleared: await ADS.cache.clear() }),
}

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  const handler = handlers[msg && msg.type]
  if (!handler) return false
  handler(msg)
    .then(respond)
    .catch((e) => respond({ ok: false, reason: e.message }))
  return true
})
