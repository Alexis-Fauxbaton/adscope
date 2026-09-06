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
  const write = ADS.context.guard((fields) => {
    const site = ADS.sites.current() || {}
    chrome.storage.local.set({
      status: {
        url: location.pathname + location.search,
        // Que la charge attendue soit là se constate depuis le registre : elle
        // n'a pas la même forme d'un site à l'autre — un bloc du rendu serveur
        // ici, des globales dans des scripts en ligne là —, et le code partagé
        // n'en connaît aucune. Chaque site sait, lui, comment voir la sienne.
        payload: site.payload ? site.payload(document) : false,
        at: Date.now(),
        // Quel site, pour que la fenêtre le nomme depuis le registre — elle
        // n'a pas la page, et ne connaît aucun site par elle-même.
        site: site.id || null,
        // D'où viennent les signaux affichés : le cache répond tout de suite,
        // le réseau les remplace ensuite. La popup doit pouvoir dire lequel
        // des deux tient l'encart sous les yeux du lecteur.
        sources: ADS.sync.counts(),
        ...fields,
      },
    })
  })

  // Le badge de l'icône : seul le service worker sait à quel onglet la page
  // appartient, et il le lit sur l'expéditeur du message.
  const tell = ADS.context.guard((alerts) =>
    chrome.runtime.sendMessage({ type: 'badge', alerts }, () => chrome.runtime.lastError),
  )

  // Sur une fiche, le doute porte sur l'annonce décrite : plusieurs sont connues
  // à la fois, seule l'URL dit laquelle est lue, et la source dit si elle vient
  // du bloc du rendu serveur ou de la charge reçue pour la fiche ouverte.
  // `card` porte ce que la fenêtre montrera de l'annonce : elle n'a pas la page.
  const detail = (listings, picked, source, card) => {
    const id = urlId(location.pathname)
    if (!id) return
    const alerts = card.notable ? 1 : 0
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
      sellerId: picked.sellerId || null,
      sellerName: picked.sellerName || null,
      card,
      alerts,
    })
    tell(alerts)
  }

  // `sent` est le nombre d'annonces que l'API a accusées depuis le chargement,
  // pages suivantes comprises : c'est ce qui distingue un suivi paginé d'un
  // premier lot resté seul. `unshown` nomme l'écart que la popup montrait sans
  // l'expliquer : les annonces que la charge porte et qu'aucune carte ne rend —
  // six sur la page de résultats relevée le 2026-09-06. Elles ne sont ni
  // comptées, ni pastillées, ni transmises ; leur nombre, lui, est dit.
  // `counts` est le résumé que la fenêtre affiche : combien dépassent le seuil
  // d'ancienneté du site, combien sont en alerte.
  const listing = (shown, unshown, badges, source, counts = { old: 0, alerts: 0 }) => {
    if (urlId(location.pathname)) return
    write({
      kind: 'listing',
      listings: shown.length,
      unshown,
      pro: shown.filter((l) => l.sellerType === 'pro').length,
      badges,
      source,
      sent: ADS.sync.sent(),
      ...counts,
    })
    tell(counts.alerts)
  }

  return { urlId, detail, listing }
})()

if (typeof module !== 'undefined') module.exports = ADS.diag
