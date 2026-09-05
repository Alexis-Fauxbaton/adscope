globalThis.ADS = globalThis.ADS || {}

ADS.leboncoin = (() => {
  const KEPT = new Set(['brand', 'model', 'u_car_version', 'regdate', 'mileage'])

  const parseDate = (s) => (s ? new Date(s.replace(' ', 'T')) : null)

  const findAds = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 12) return null
    if (Array.isArray(node)) {
      for (const v of node.slice(0, 8)) {
        const found = findAds(v, depth + 1)
        if (found) return found
      }
      return null
    }
    if (Array.isArray(node.ads) && node.ads.length && 'list_id' in node.ads[0]) return node.ads
    for (const v of Object.values(node)) {
      const found = findAds(v, depth + 1)
      if (found) return found
    }
    return null
  }

  const attributes = (ad) => {
    const out = {}
    for (const a of ad.attributes || []) if (KEPT.has(a.key)) out[a.key] = a.value
    return out
  }

  const normalize = (ad) => {
    const attr = attributes(ad)
    return {
      site: 'lbc',
      siteId: String(ad.list_id),
      url: ad.url,
      title: ad.subject,
      isPro: (ad.owner || {}).type === 'pro',
      price: Array.isArray(ad.price) ? ad.price[0] : ad.price,
      publishedAt: parseDate(ad.first_publication_date),
      bumpedAt: parseDate(ad.index_date),
      brand: attr.brand,
      model: attr.model,
      version: attr.u_car_version,
      year: attr.regdate ? Number(attr.regdate) : null,
      mileage: attr.mileage ? Number(attr.mileage) : null,
    }
  }

  // Une remontée n'est retenue qu'au-delà d'un jour : republier et indexer
  // à quelques heures d'écart est le fonctionnement normal du site.
  const BUMP_MIN_MS = 24 * 3600 * 1000

  const signals = (listing, now) => {
    const online = Math.floor((now - listing.publishedAt) / 86400000)
    const gap = listing.bumpedAt - listing.publishedAt
    return {
      onlineDays: online,
      bumped: gap > BUMP_MIN_MS,
      bumpedDaysAgo: gap > BUMP_MIN_MS ? Math.floor((now - listing.bumpedAt) / 86400000) : null,
    }
  }

  const fromDocument = (doc) => {
    const tag = doc.getElementById('__NEXT_DATA__')
    if (!tag) return []
    const ads = findAds(JSON.parse(tag.textContent))
    return ads ? ads.map(normalize) : []
  }

  return { fromDocument, normalize, signals, findAds }
})()

if (typeof module !== 'undefined') module.exports = ADS.leboncoin
