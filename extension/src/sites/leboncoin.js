globalThis.ADS = globalThis.ADS || {}

ADS.leboncoin = (() => {
  const KEPT = new Set(['brand', 'model', 'u_car_version', 'regdate', 'mileage'])

  const parseDate = (s) => (s ? new Date(s.replace(' ', 'T')) : null)

  const isAd = (o) => o && typeof o === 'object' && 'list_id' in o && 'first_publication_date' in o

  // Les résultats portent un tableau `ads`, une fiche un objet unique.
  const findAds = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 12) return null
    if (Array.isArray(node)) {
      for (const v of node.slice(0, 8)) {
        const found = findAds(v, depth + 1)
        if (found) return found
      }
      return null
    }
    if (Array.isArray(node.ads) && node.ads.some(isAd)) return node.ads.filter(isAd)
    if (isAd(node)) return [node]
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
      sellerType: (ad.owner || {}).type === 'pro' ? 'pro' : 'private',
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

  // Une réactualisation n'est retenue qu'au-delà d'un jour : republier et
  // indexer à quelques heures d'écart est le fonctionnement normal du site.
  const BUMP_MIN_MS = 24 * 3600 * 1000

  // En dessous, l'annonce est banale : le dire encombrerait la page sans
  // rien apprendre. Le tri par défaut de leboncoin étant l'ordre de
  // fraîcheur, une pastille sur chaque carte serait presque toujours
  // « moins d'un jour ».
  const STALE_MIN_DAYS = 7

  const signals = (listing, now) => {
    const online = Math.floor((now - listing.publishedAt) / 86400000)
    const gap = listing.bumpedAt - listing.publishedAt
    const bumped = gap > BUMP_MIN_MS
    return {
      onlineDays: online,
      bumped,
      bumpedDaysAgo: bumped ? Math.floor((now - listing.bumpedAt) / 86400000) : null,
      notable: bumped || online >= STALE_MIN_DAYS,
    }
  }

  // La même lecture pour les deux sources : le bloc du rendu serveur et les
  // charges que la page reçoit ensuite ont la même forme.
  const fromPayload = (json) => {
    const ads = findAds(json)
    return ads ? ads.map(normalize) : []
  }

  const fromDocument = (doc) => {
    const tag = doc.getElementById('__NEXT_DATA__')
    return tag ? fromPayload(JSON.parse(tag.textContent)) : []
  }

  return { fromDocument, fromPayload, normalize, signals, findAds }
})()

if (typeof module !== 'undefined') module.exports = ADS.leboncoin
