globalThis.ADS = globalThis.ADS || {}

// D'où viennent les annonces courantes. Le bloc `__NEXT_DATA__` fait foi au
// premier chargement, mais il n'est jamais réécrit : dès qu'une charge de
// résultats publiée par le monde MAIN arrive, c'est elle que la page affiche.
ADS.feed = (() => {
  const listeners = []
  let latest = null

  // Le monde MAIN ne publie qu'une chaîne : rien d'un objet de la page ne
  // traverse la frontière des mondes.
  // Gardé : le monde MAIN n'est pas orphelin, lui, et continue de publier ce
  // que le navigateur reçoit bien après le remplacement de l'extension.
  addEventListener(
    'adscope:payload',
    ADS.context.guard((e) => {
      const ads = ADS.leboncoin.fromPayload(JSON.parse(e.detail))
      if (!ads.length) return
      latest = ads
      for (const fn of listeners) fn(latest)
    }),
  )

  return {
    listings: (doc) => latest || ADS.leboncoin.fromDocument(doc),
    source: () => (latest ? 'live' : 'page'),
    onData: (fn) => listeners.push(fn),
  }
})()

if (typeof module !== 'undefined') module.exports = ADS.feed
