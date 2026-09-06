;(() => {
  const { signals } = ADS.leboncoin
  const MARK = 'data-adscope'
  const SRC = 'data-adscope-src'

  const cardFor = (siteId) => {
    const link = document.querySelector(`a[href*="/ad/voitures/${siteId}"], a[href$="/${siteId}"]`)
    return link && (link.closest('article') || link)
  }

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
  const paint = (card, listing, now) => {
    const remote = ADS.sync.of(listing.siteId)
    const stamp = remote ? 'sync' : 'page'
    let el = card.querySelector(`[${MARK}]`)
    if (el && el.getAttribute(SRC) === stamp) return false
    if (!el) {
      el = document.createElement('div')
      el.setAttribute(MARK, listing.siteId)
      card.appendChild(el)
    }
    const s = signals(listing, now)
    const { page, tracked } = ADS.view.badge(s, remote)
    const weight = s.notable || tracked ? 'notable' : s.dormant ? 'dormant' : 'quiet'
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

  const render = () => {
    const now = new Date()
    const listings = ADS.feed.listings(document)
    let placed = 0
    for (const listing of listings) {
      const card = cardFor(listing.siteId)
      if (card && paint(card, listing, now)) placed++
    }
    ADS.sync.send(listings)
    // Le compte transmis entre dans l'estampille : il change après coup, quand
    // l'API accuse réception, et le diagnostic doit suivre même si rien d'autre
    // n'a bougé sur la page.
    const seen = listings.map((l) => l.siteId).join() + '|' + ADS.sync.sent()
    if (placed || seen !== reported) {
      reported = seen
      ADS.diag.listing(listings, document.querySelectorAll(`[${MARK}]`).length, ADS.feed.source())
    }
  }

  render()
  ADS.sync.onSignals(render)
  // La page suivante n'est pas garantie de produire un lot de mutations qu'on
  // observe : ses annonces, elles, arrivent toujours.
  ADS.feed.onData(render)

  // Les résultats se rechargent sans navigation : on réobserve le conteneur.
  new MutationObserver(render).observe(document.body, { childList: true, subtree: true })
})()
