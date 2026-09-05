;(() => {
  const { fromDocument, signals } = ADS.leboncoin
  const { duration, ago } = ADS.format
  const MARK = 'data-adscope'

  const badge = (listing, now) => {
    const s = signals(listing, now)
    const el = document.createElement('div')
    el.className = 'adscope-badge' + (s.bumped ? ' adscope-badge--bumped' : '')
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
    const pro = listings.filter((l) => l.isPro)
    let placed = 0
    for (const listing of pro) {
      const card = cardFor(listing.siteId)
      if (!card || card.querySelector(`[${MARK}]`)) continue
      card.appendChild(badge(listing, now))
      placed++
    }
    if (!reported && listings.length) {
      reported = true
      console.log(`[adscope] ${listings.length} annonces, ${pro.length} pro, ${placed} pastilles`)
    }
  }

  console.log('[adscope] script chargé sur', location.pathname)
  render()

  // Les résultats se rechargent sans navigation : on réobserve le conteneur.
  new MutationObserver(render).observe(document.body, { childList: true, subtree: true })
})()
