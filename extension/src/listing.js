;(() => {
  const { fromDocument, signals } = ADS.leboncoin
  const { days } = ADS.format
  const MARK = 'data-adscope'

  const badge = (listing, now) => {
    const s = signals(listing, now)
    const el = document.createElement('div')
    el.className = 'adscope-badge' + (s.bumped ? ' adscope-badge--bumped' : '')
    el.setAttribute(MARK, listing.siteId)
    el.textContent = s.bumped
      ? `⟳ remontée il y a ${days(s.bumpedDaysAgo)} · en ligne depuis ${days(s.onlineDays)}`
      : `en ligne depuis ${days(s.onlineDays)}`
    return el
  }

  const cardFor = (siteId) => {
    const link = document.querySelector(`a[href*="/ad/voitures/${siteId}"], a[href$="/${siteId}"]`)
    return link && (link.closest('article') || link)
  }

  const render = () => {
    const now = new Date()
    for (const listing of fromDocument(document)) {
      if (!listing.isPro) continue
      const card = cardFor(listing.siteId)
      if (!card || card.querySelector(`[${MARK}]`)) continue
      card.appendChild(badge(listing, now))
    }
  }

  render()

  // Les résultats se rechargent sans navigation : on réobserve le conteneur.
  new MutationObserver(render).observe(document.body, { childList: true, subtree: true })
})()
