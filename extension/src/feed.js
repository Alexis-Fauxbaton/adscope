globalThis.ADS = globalThis.ADS || {}

// D'où viennent les annonces courantes. Le bloc `__NEXT_DATA__` fait foi au
// premier chargement, mais il n'est jamais réécrit : dès qu'une charge publiée
// par le monde MAIN arrive, c'est elle que la page affiche. Deux flux qui ne se
// mêlent pas — une fiche porte ses annonces similaires, qui passeraient pour
// des résultats.
ADS.feed = (() => {
  // Le monde MAIN ne publie qu'une chaîne : rien d'un objet de la page ne
  // traverse la frontière des mondes. Gardé : ce monde-là n'est pas orphelin
  // après une mise à jour et continue de publier.
  const on = (name, fn) =>
    addEventListener(
      `adscope:${name}`,
      ADS.context.guard((e) => {
        const ads = ADS.leboncoin.fromPayload(JSON.parse(e.detail))
        if (ads.length) fn(ads)
      }),
    )

  // Les résultats : la dernière charge reçue remplace la précédente, c'est elle
  // que la page montre.
  const listeners = []
  let latest = null
  on('payload', (ads) => {
    latest = ads
    for (const fn of listeners) fn(latest)
  })

  // Les fiches : elles arrivent une à une, et Next préfetche celles que le
  // lecteur n'a pas encore ouvertes. Aucune ne chasse l'autre — on les garde
  // toutes, l'URL dira laquelle est lue, et celle qu'il ouvre est souvent déjà
  // arrivée.
  const seen = new Map()
  const watchers = []
  on('detail', (ads) => {
    for (const a of ads) seen.set(a.siteId, a)
    for (const fn of watchers) fn()
  })

  return {
    listings: (doc) => latest || ADS.leboncoin.fromDocument(doc),
    source: () => (latest ? 'live' : 'page'),
    onData: (fn) => listeners.push(fn),
    // Le bloc de la page d'abord : c'est lui qui fait foi là où l'URL ne
    // désigne aucune annonce. Les fiches reçues depuis viennent ensuite.
    details: (doc) => {
      const ads = ADS.leboncoin.fromDocument(doc)
      const ids = new Set(ads.map((a) => a.siteId))
      return [...ads, ...[...seen.values()].filter((a) => !ids.has(a.siteId))]
    },
    // Une fiche reçue supplante le bloc figé du rendu serveur : le diagnostic
    // doit pouvoir le dire, comme il le dit déjà des résultats.
    detailSource: (id) => (seen.has(id) ? 'live' : 'page'),
    onDetail: (fn) => watchers.push(fn),
  }
})()

if (typeof module !== 'undefined') module.exports = ADS.feed
