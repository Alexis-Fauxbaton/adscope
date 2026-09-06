globalThis.ADS = globalThis.ADS || {}

// Le compte rendu que la popup affiche : quelle annonce l'extension a retenue,
// et l'a-t-elle prise sur la bonne page. Les deux content scripts tournent sur
// toutes les pages du site, mais une page n'a qu'un diagnostic : le type de page
// désigne son auteur — l'identifiant que porte l'URL fait la fiche, son absence
// les résultats. C'est la règle que suit déjà detail.js pour choisir l'annonce.
ADS.diag = (() => {
  const urlId = (path) => (path.match(/\d{6,}/) || [])[0] || null

  const write = (fields) =>
    chrome.storage.local.set({
      status: {
        url: location.pathname + location.search,
        nextData: !!document.getElementById('__NEXT_DATA__'),
        at: Date.now(),
        ...fields,
      },
    })

  // Sur une fiche, le doute porte sur l'annonce décrite : le bloc de données en
  // porte plusieurs et seule l'URL dit laquelle est lue.
  const detail = (listings, picked) => {
    const id = urlId(location.pathname)
    if (!id) return
    write({
      kind: 'detail',
      listings: listings.length,
      pickedId: picked.siteId,
      urlId: id,
      matchesUrl: picked.siteId === id,
      sellerType: picked.sellerType,
    })
  }

  const listing = (listings, badges, source) => {
    if (urlId(location.pathname)) return
    write({
      kind: 'listing',
      listings: listings.length,
      pro: listings.filter((l) => l.sellerType === 'pro').length,
      badges,
      source,
    })
  }

  return { urlId, detail, listing }
})()

if (typeof module !== 'undefined') module.exports = ADS.diag
