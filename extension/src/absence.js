;(() => {
  // Ce que la page ouverte dit d'elle-même quand elle ne porte plus d'annonce.
  // L'extension n'émet aucune requête pour l'apprendre : elle lit le document
  // que le navigateur a déjà rendu, comme partout ailleurs. C'est le crawler
  // qui décide d'ouvrir la fiche, et le site qui répond.
  //
  // Une seule lecture, au chargement, et c'est voulu : `__NEXT_DATA__` n'est
  // écrit qu'au rendu serveur. Rejouée après une navigation monopage, la
  // lecture porterait sur la charge de la page précédente — la signature
  // l'écarte de toute façon en comparant l'identifiant de l'URL à celui de la
  // charge, mais mieux vaut ne pas s'en remettre à ce filet.
  const site = ADS.sites.current()
  if (!site || !site.absence) return
  const id = site.urlId(location.pathname)
  if (!id) return
  const verdict = site.absence(document, id)
  // Vivante, la fiche n'a rien de particulier à dire : `detail.js` la transmet
  // comme n'importe quelle observation, et cette observation-là repousse
  // l'échéance de revisite. Tout le reste part vers l'API, qui décide seule ce
  // qui s'écrit et ce qui se journalise.
  if (verdict !== 'alive') ADS.sync.absent(site.id, id, verdict)
})()
