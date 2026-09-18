globalThis.ADS = globalThis.ADS || {}

// Ce que la fiche ouverte ne porte pas : ce que le vendeur ne montre pas de
// lui-même. Cela se demande à l'API et à elle seule — jamais à une page que le
// lecteur n'a pas ouverte —, et une seule fois par annonce : la réponse ne
// change pas d'un lot de mutations à l'autre.
//
// Les comparables ne sont plus demandés : le panneau de la V1 marchand n'en
// affiche rien, et une requête dont personne ne lit la réponse reste une
// requête. La route et son relais dans le service worker sont intacts.
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

  const ask = ADS.context.guard((msg, take, fail) =>
    chrome.runtime.sendMessage(msg, (res) => {
      // Lire lastError évite que Chrome le rapporte dans la console de la page.
      if (chrome.runtime.lastError || !res || !res.ok) return fail()
      take(res)
    }),
  )

  // Le service worker MV3 s'endort dès qu'il est sans demande, et le premier
  // appel d'une fiche fraîchement chargée le réveille en retard : le port se
  // referme avant sa réponse — « message port closed » — sans rapport avec ce
  // que sait l'API. Trois essais au plus, une pause qui grandit à chaque
  // échec pour laisser le temps au réveil sans marteler l'API ni boucler sur
  // un vendeur qu'elle ne connaît pas.
  //
  // Un 404 n'entre pas ici : `lookup.js` le rend en `stats: null` sous
  // `ok: true` — ce n'est pas un échec, `ask` appelle `take`, jamais `fail`.
  const MAX_TRIES = 3
  const RETRY_PAUSE_MS = 5000

  const attempt = (l, tries) =>
    ask(
      { type: 'seller', site: l.site, sellerId: l.sellerId },
      (res) => keep(l.siteId, { seller: res.stats }),
      () => {
        if (tries >= MAX_TRIES) return
        setTimeout(() => attempt(l, tries + 1), RETRY_PAUSE_MS * tries)
      },
    )

  const want = ADS.context.guard((l) => {
    if (asked.has(l.siteId)) return
    asked.add(l.siteId)
    // Un particulier n'a pas de catalogue : agréger ses annonces serait de la
    // donnée personnelle, et l'API ne le connaît pas.
    if (l.sellerType === 'pro' && l.sellerId) attempt(l, 1)
  })

  // Ce que le panneau posé porte déjà : tant que cette marque ne change pas, il
  // n'y a rien de neuf à rendre.
  const stamp = (siteId) => Object.keys(found[siteId] || {}).sort().join('+')

  return { want, stamp, of: (siteId) => found[siteId] || {}, onFound: (fn) => listeners.push(fn) }
})()

if (typeof module !== 'undefined') module.exports = ADS.market
