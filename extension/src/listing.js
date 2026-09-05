;(() => {
  const { fromDocument, signals } = ADS.leboncoin
  const MARK = 'data-adscope'
  const SRC = 'data-adscope-src'

  const cardFor = (siteId) => {
    const link = document.querySelector(`a[href*="/ad/voitures/${siteId}"], a[href$="/${siteId}"]`)
    return link && (link.closest('article') || link)
  }

  // Deux poids visuels : la mention discrète confirme que l'extension
  // travaille, l'alerte ne se déclenche que sur ce qui mérite l'œil.
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
    el.className =
      'adscope-badge' +
      (s.notable || ADS.view.drop(remote) ? ' adscope-badge--notable' : ' adscope-badge--quiet') +
      (listing.sellerType === 'private' ? ' adscope-badge--private' : '')
    el.setAttribute(SRC, stamp)
    el.textContent = ADS.view.badge(listing, s, remote)
    return true
  }

  let reported = false

  const render = () => {
    const now = new Date()
    const listings = fromDocument(document)
    let placed = 0
    for (const listing of listings) {
      const card = cardFor(listing.siteId)
      if (card && paint(card, listing, now)) placed++
    }
    if (placed || !reported) {
      reported = true
      chrome.storage.local.set({
        status: {
          url: location.pathname,
          nextData: !!document.getElementById('__NEXT_DATA__'),
          listings: listings.length,
          pro: listings.filter((l) => l.sellerType === 'pro').length,
          badges: document.querySelectorAll(`[${MARK}]`).length,
          at: Date.now(),
        },
      })
    }
    ADS.sync.send(listings)
  }

  render()
  ADS.sync.onSignals(render)

  // Les résultats se rechargent sans navigation : on réobserve le conteneur.
  new MutationObserver(render).observe(document.body, { childList: true, subtree: true })
})()
