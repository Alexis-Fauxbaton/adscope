globalThis.ADS = globalThis.ADS || {}

// Ce que la fiche ouverte ne porte pas : le marché autour de l'annonce, et ce
// que le vendeur ne montre pas de lui-même. Les deux se demandent à l'API et à
// elle seule — jamais à une page que le lecteur n'a pas ouverte —, et une seule
// fois par annonce : la réponse ne change pas d'un lot de mutations à l'autre.
//
// La demande passe par le service worker : partie du content script, elle
// porterait l'origine du site ouvert et le navigateur la refuserait.
ADS.market = (() => {
  const found = {}
  const asked = new Set()
  const listeners = []

  const keep = (siteId, part) => {
    found[siteId] = { ...found[siteId], ...part }
    for (const fn of listeners) fn()
  }

  const ask = ADS.context.guard((msg, take) =>
    chrome.runtime.sendMessage(msg, (res) => {
      // Lire lastError évite que Chrome le rapporte dans la console de la page.
      if (chrome.runtime.lastError || !res || !res.ok) return
      take(res)
    }),
  )

  const want = ADS.context.guard((l) => {
    if (asked.has(l.siteId)) return
    asked.add(l.siteId)
    ask({ type: 'comparables', site: l.site, siteId: l.siteId }, (res) =>
      keep(l.siteId, { comparables: res.comparables }))
    // Un particulier n'a pas de catalogue : agréger ses annonces serait de la
    // donnée personnelle, et l'API ne le connaît pas.
    if (l.sellerType === 'pro' && l.sellerId) {
      ask({ type: 'seller', site: l.site, sellerId: l.sellerId }, (res) => keep(l.siteId, { seller: res.stats }))
    }
  })

  // Ce que le panneau posé porte déjà : tant que cette marque ne change pas, il
  // n'y a rien de neuf à rendre.
  const stamp = (siteId) => Object.keys(found[siteId] || {}).sort().join('+')

  return { want, stamp, of: (siteId) => found[siteId] || {}, onFound: (fn) => listeners.push(fn) }
})()

if (typeof module !== 'undefined') module.exports = ADS.market
