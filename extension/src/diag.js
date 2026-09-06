globalThis.ADS = globalThis.ADS || {}

// Le compte rendu que la popup affiche : quelle annonce l'extension a retenue,
// et l'a-t-elle prise sur la bonne page. Les deux content scripts tournent sur
// toutes les pages du site, mais une page n'a qu'un diagnostic : le type de page
// désigne son auteur — l'identifiant que porte l'URL fait la fiche, son absence
// les résultats. C'est la règle que suit déjà detail.js pour choisir l'annonce.
// Comment cet identifiant s'écrit, en revanche, est l'affaire du site.
ADS.diag = (() => {
  const urlId = (path) => {
    const site = ADS.sites.current()
    return (site && site.urlId(path)) || null
  }

  // Gardé : sur un onglet resté ouvert à travers une mise à jour, le stockage
  // de l'extension n'existe plus.
  const write = ADS.context.guard((fields) =>
    chrome.storage.local.set({
      status: {
        url: location.pathname + location.search,
        nextData: !!document.getElementById('__NEXT_DATA__'),
        at: Date.now(),
        // D'où viennent les signaux affichés : le cache répond tout de suite,
        // le réseau les remplace ensuite. La popup doit pouvoir dire lequel
        // des deux tient l'encart sous les yeux du lecteur.
        sources: ADS.sync.counts(),
        ...fields,
      },
    }),
  )

  // Sur une fiche, le doute porte sur l'annonce décrite : plusieurs sont connues
  // à la fois, seule l'URL dit laquelle est lue, et la source dit si elle vient
  // du bloc du rendu serveur ou de la charge reçue pour la fiche ouverte.
  const detail = (listings, picked, source) => {
    const id = urlId(location.pathname)
    if (!id) return
    write({
      kind: 'detail',
      listings: listings.length,
      source,
      pickedId: picked.siteId,
      urlId: id,
      matchesUrl: picked.siteId === id,
      sellerType: picked.sellerType,
      // Ce que la popup ne peut pas lire elle-même : elle n'a pas la page. Vide
      // pour un particulier, dont les annonces ne s'agrègent pas.
      site: picked.site,
      sellerId: picked.sellerId || null,
      sellerName: picked.sellerName || null,
    })
  }

  // `sent` est le nombre d'annonces que l'API a accusées depuis le chargement,
  // pages suivantes comprises : c'est ce qui distingue un suivi paginé d'un
  // premier lot resté seul.
  const listing = (listings, badges, source) => {
    if (urlId(location.pathname)) return
    write({
      kind: 'listing',
      listings: listings.length,
      pro: listings.filter((l) => l.sellerType === 'pro').length,
      badges,
      source,
      sent: ADS.sync.sent(),
    })
  }

  return { urlId, detail, listing }
})()

if (typeof module !== 'undefined') module.exports = ADS.diag
