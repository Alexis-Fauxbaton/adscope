globalThis.ADS = globalThis.ADS || {}

// Ce qu'une annonce vue devient pour l'API, et la question de savoir s'il vaut
// la peine de la lui redire. Extrait de sw.js, qui n'a plus à porter que les
// allers-retours eux-mêmes.
ADS.observation = (() => {
  // Six heures. Ce que l'encart affiche se compte en jours pleins — « suivie
  // depuis 12 j », « stable depuis 3 j » — et rien de visible ne peut changer
  // dans l'intervalle. Le seuil range donc les passages répétés d'un marchand
  // sur la même page de résultats en un seul aller-retour, tout en laissant au
  // moins quatre observations par jour et par annonce consultée.
  const FRESH_MS = 6 * 3600 * 1000

  const of = (l) => ({
    site: l.site, site_id: l.siteId,
    price: l.price ?? null,
    brand: l.brand ?? null, model: l.model ?? null, version: l.version ?? null,
    year: l.year ?? null, mileage: l.mileage ?? null,
    seller_type: l.sellerType ?? null, seller_id: l.sellerId ?? null, seller_name: l.sellerName ?? null,
    published_at: l.publishedAt ?? null, bumped_at: l.bumpedAt ?? null,
    // Quatre champs optionnels du lot « champs manquants » : vocabulaire fermé
    // déjà traduit par le module de site, département dérivé du code postal.
    // Absents, ils n'effacent jamais une valeur déjà connue côté API.
    fuel: l.fuel ?? null, gearbox: l.gearbox ?? null,
    department: l.department ?? null, postal_code: l.postalCode ?? null,
  })

  // Ce que l'observation apprendrait à l'API. Inchangée, elle ne lui apprend
  // rien ; changée, elle passe outre le seuil de fraîcheur — un prix qui bouge
  // est précisément ce qu'on ne veut pas retenir six heures.
  const signature = (l) => [l.price ?? '', l.publishedAt ?? '', l.bumpedAt ?? ''].join('|')

  const stale = (listing, entry, now) =>
    !entry || now - entry.at >= FRESH_MS || entry.sig !== signature(listing)

  return { of, signature, stale }
})()

if (typeof module !== 'undefined') module.exports = ADS.observation
