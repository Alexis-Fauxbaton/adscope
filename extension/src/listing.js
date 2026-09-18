;(() => {
  // Le site de la page ouverte : c'est lui qui sait lire ses cartes et poser ses
  // seuils. Hors des pages qu'un site déclare couvrir, il n'y a rien à faire.
  const site = ADS.sites.current()
  if (!site) return
  const MARK = 'data-adscope'
  const SRC = 'data-adscope-src'
  const DAYS = ADS.order.DAYS

  const span = (cls, text) => {
    const el = document.createElement('span')
    el.className = cls
    el.textContent = text
    return el
  }

  // Trois poids visuels : l'alerte pour l'annonce ancienne encore poussée, un
  // cran intermédiaire pour l'ancienne qui dort, la mention discrète pour le
  // reste — elle confirme que l'extension travaille sans rien réclamer.
  // La pastille est posée avec la seule page, puis réécrite si des signaux
  // arrivent — d'où l'estampille, qui évite aussi de boucler avec l'observateur.
  const paint = (card, listing, s) => {
    const remote = ADS.sync.of(listing.siteId)
    // L'origine entre dans l'estampille : les signaux du cache sont posés
    // d'abord, ceux du réseau les remplacent, et sans cette distinction la
    // pastille resterait sur les premiers.
    const stamp = ADS.sync.originOf(listing.siteId) || 'page'
    let el = card.querySelector(`[${MARK}]`)
    // Quelle annonce la pastille décrit, et pas seulement d'où viennent ses
    // données : une application monopage réattribue ses nœuds de carte —
    // pagination, filtre, liste virtualisée. Le lien change, l'élément reste, et
    // la carte retrouvée est la bonne ; sans l'identifiant dans la comparaison,
    // l'âge de l'annonce précédente resterait affiché sur la suivante.
    if (el && el.getAttribute(MARK) === listing.siteId && el.getAttribute(SRC) === stamp) return false
    if (!el) {
      el = document.createElement('div')
      card.appendChild(el)
    }
    // Réécrit à chaque rendu, pas à la seule création : c'est ce marquage que la
    // comparaison ci-dessus relit.
    el.setAttribute(MARK, listing.siteId)
    // L'ancienneté, une fois calculée, est écrite là où la barre de tête la
    // relira : elle trie et filtre sur ce nombre, elle n'en refait aucun. Une
    // annonce sans date n'en porte pas plutôt que d'en porter un faux.
    if (s.onlineDays == null) el.removeAttribute(DAYS)
    else el.setAttribute(DAYS, s.onlineDays)
    const { page, tracked } = ADS.view.badge(s, remote)
    // Le poids visuel se lit sur la seule page : l'orangé n'existe que pour ce
    // que le site cache. Une baisse, elle, est une mesure d'adscope — elle a son
    // fragment et son filet indigo, elle ne prend pas la couleur de l'alerte.
    const weight = s.notable ? 'notable' : s.dormant ? 'dormant' : 'quiet'
    el.className =
      `adscope-badge adscope-badge--${weight}` +
      (listing.sellerType === 'private' ? ' adscope-badge--private' : '')
    el.setAttribute(SRC, stamp)
    // Un nœud par origine : le suivi mutualisé ne se fond pas dans la page.
    el.replaceChildren(
      span('adscope-badge-page', page),
      ...(tracked ? [span('adscope-badge-tracked', tracked)] : []),
    )
    return true
  }

  // Le diagnostic est réécrit quand la page change d'annonces — même si aucune
  // carte ne leur correspond encore — et quand des pastilles se posent.
  let reported = null

  // On ne suit que ce qu'on montre. La charge d'une page en porte davantage
  // qu'elle n'en affiche : un site y précharge, sous sa clé d'annonces
  // similaires, six annonces qu'aucune carte ne rend — et qui arrivent sans
  // véhicule, sans vendeur et sans date de modification, un prix et une mise en
  // ligne pour toute identité. La carte est le juge : celle qui n'en a pas
  // n'est pas sous les yeux du lecteur.
  const render = ADS.context.guard(() => {
    const now = new Date()
    const listings = ADS.feed.listings(document)
    const shown = []
    // Le résumé que la fenêtre affiche, et le badge de l'icône : combien
    // dépassent le seuil du site, combien sont en alerte. Les deux comptes se
    // tiennent ici, où les signaux de chaque annonce sont déjà calculés.
    const counts = { old: 0, alerts: 0 }
    let placed = 0
    for (const listing of listings) {
      const card = site.card(document, listing)
      if (!card) continue
      shown.push(listing)
      const s = site.signals(listing, now)
      if (s.old) counts.old++
      if (s.notable) counts.alerts++
      if (paint(card, listing, s)) placed++
    }
    ADS.sync.send(shown)
    // Le compte transmis entre dans l'estampille : il change après coup, quand
    // l'API accuse réception, et le diagnostic doit suivre même si rien d'autre
    // n'a bougé sur la page.
    const seen = shown.map((l) => l.siteId).join() + '|' + ADS.sync.sent()
    if (placed || seen !== reported) {
      reported = seen
      const badges = document.querySelectorAll(`[${MARK}]`).length
      ADS.diag.listing(shown, listings.length - shown.length, badges, ADS.feed.source(), counts)
    }
    // La barre de tête travaille sur les pastilles qu'on vient de poser : elle
    // relit la page, elle ne recalcule aucun âge et ne demande rien.
    ADS.sort.sync()
  })

  render()
  ADS.sync.onSignals(render)
  // La page suivante n'est pas garantie de produire un lot de mutations qu'on
  // observe : ses annonces, elles, arrivent toujours.
  ADS.feed.onData(render)

  // Les résultats se rechargent sans navigation : on réobserve le conteneur.
  ADS.context.observe(render)
})()
