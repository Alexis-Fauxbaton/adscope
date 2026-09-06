globalThis.ADS = globalThis.ADS || {}

// D'où viennent les annonces courantes. Le bloc `__NEXT_DATA__` fait foi au
// premier chargement, mais il n'est jamais réécrit : dès qu'une charge publiée
// par le monde MAIN arrive, c'est elle que la page affiche. Deux flux qui ne se
// mêlent pas — une fiche porte ses annonces similaires, qui passeraient pour
// des résultats.
ADS.feed = (() => {
  // Le site de la page ouverte. Tous n'ont pas de charge publiée par le monde
  // MAIN : celui qui n'en publie pas n'a rien à lire, et sa page fait foi.
  const site = ADS.sites.current() || {}
  const fromDocument = (doc) => (site.fromDocument ? site.fromDocument(doc) : [])
  const fromPayload = (json) => (site.fromPayload ? site.fromPayload(json) : [])

  // Le monde MAIN ne publie qu'une chaîne : rien d'un objet de la page ne
  // traverse la frontière des mondes. Gardé : ce monde-là n'est pas orphelin
  // après une mise à jour et continue de publier.
  const on = (name, fn) =>
    addEventListener(
      `adscope:${name}`,
      ADS.context.guard((e) => {
        const ads = fromPayload(JSON.parse(e.detail))
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

  // L'observateur rejoue le rendu à chaque lot de mutations, et la lecture du
  // bloc de la page était refaite chaque fois alors qu'il n'avait pas bougé.
  // Mesuré le 2026-09-06 sur une page de résultats sauvegardée — 1 Mo de code en
  // ligne : 3,46 ms l'extraction, 0,018 ms la signature qui dit qu'elle est
  // inutile, deux cents fois moins. Et la rafale existe : sur une page de
  // résultats réelle, 29 lots dans la seconde qui suit le chargement.
  //
  // La longueur de chaque script porteur de texte suffit à signer : un site ne
  // réécrit pas sa charge d'annonces sans en changer la taille, et deux charges
  // différentes de même longueur au même rang tiendraient du hasard. Les scripts
  // vides sont écartés, et ce n'est pas un détail : la régie et la mesure
  // d'audience en injectent sans cesse, et les compter faisait retomber la
  // signature à chaque fois. Mesuré sur deux pages réelles — 82 lots donnent
  // 5 extractions au lieu de 22, 108 lots en donnent 4 au lieu de 39.
  let signed = null
  let held = []
  const reread = (doc) => {
    let now = ''
    for (const s of doc.querySelectorAll('script')) if (s.textContent) now += s.textContent.length + ','
    if (now !== signed) {
      signed = now
      held = fromDocument(doc)
    }
    return held
  }

  return {
    listings: (doc) => latest || reread(doc),
    source: () => (latest ? 'live' : 'page'),
    onData: (fn) => listeners.push(fn),
    // Le bloc de la page d'abord : c'est lui qui fait foi là où l'URL ne
    // désigne aucune annonce. Les fiches reçues depuis viennent ensuite.
    details: (doc) => {
      const ads = fromDocument(doc)
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
