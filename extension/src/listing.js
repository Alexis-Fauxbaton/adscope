;(() => {
  const { fromDocument, signals } = ADS.leboncoin
  const { duration, ago } = ADS.format
  const MARK = 'data-adscope'

  // Deux poids visuels : la mention discrète confirme que l'extension
  // travaille, l'alerte ne se déclenche que sur ce qui mérite l'œil.
  const badge = (listing, now) => {
    const s = signals(listing, now)
    const el = document.createElement('div')
    el.className =
      'adscope-badge' +
      (s.notable ? ' adscope-badge--notable' : ' adscope-badge--quiet') +
      (listing.sellerType === 'private' ? ' adscope-badge--private' : '')
    el.setAttribute(MARK, listing.siteId)
    el.textContent = s.bumped
      ? `⟳ remontée ${ago(s.bumpedDaysAgo)} · en ligne depuis ${duration(s.onlineDays)}`
      : `en ligne depuis ${duration(s.onlineDays)}`
    return el
  }

  const cardFor = (siteId) => {
    const link = document.querySelector(`a[href*="/ad/voitures/${siteId}"], a[href$="/${siteId}"]`)
    return link && (link.closest('article') || link)
  }

  let reported = false

  const render = () => {
    const now = new Date()
    const listings = fromDocument(document)
    const pro = listings.filter((l) => l.sellerType === 'pro')
    let placed = 0
    for (const listing of listings) {
      const card = cardFor(listing.siteId)
      if (!card || card.querySelector(`[${MARK}]`)) continue
      card.appendChild(badge(listing, now))
      placed++
    }
    if (placed || !reported) {
      reported = true
      chrome.storage.local.set({
        status: {
          url: location.pathname,
          nextData: !!document.getElementById('__NEXT_DATA__'),
          listings: listings.length,
          pro: pro.length,
          badges: document.querySelectorAll(`[${MARK}]`).length,
          at: Date.now(),
        },
      })
    }
  }

  render()

  // Les résultats se rechargent sans navigation : on réobserve le conteneur.
  new MutationObserver(render).observe(document.body, { childList: true, subtree: true })
})()
