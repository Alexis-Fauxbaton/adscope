const DEFAULTS = { apiBase: 'http://localhost:8000', licenseKey: '' }

const config = async () => ({ ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) })

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
  published_at: l.publishedAt ?? null,
  bumped_at: l.bumpedAt ?? null,
})

const call = async (path, body, { apiBase, licenseKey }) => {
  const res = await fetch(apiBase + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${licenseKey}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

// Un seul aller-retour côté content script : on pousse ce qui a été vu,
// puis on récupère ce que le pool sait déjà.
const sync = async (site, listings) => {
  const cfg = await config()
  if (!cfg.licenseKey) return { ok: false, reason: 'no-key' }

  const items = listings.map(toObservation)
  for (let i = 0; i < items.length; i += 100) {
    await call('/v1/observations', { items: items.slice(i, i + 100) }, cfg)
  }

  const signals = {}
  const ids = listings.map((l) => l.siteId)
  for (let i = 0; i < ids.length; i += 30) {
    const batch = await call('/v1/listings/batch', { site, ids: ids.slice(i, i + 30) }, cfg)
    for (const s of batch) signals[s.site_id] = s
  }
  return { ok: true, sent: items.length, signals }
}

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg.type !== 'sync') return false
  sync(msg.site, msg.listings)
    .then(respond)
    .catch((e) => respond({ ok: false, reason: e.message }))
  return true
})
