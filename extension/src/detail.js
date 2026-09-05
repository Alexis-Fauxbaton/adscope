;(() => {
  const { fromDocument, signals } = ADS.leboncoin
  const { duration, ago } = ADS.format
  const MARK = 'data-adscope-detail'

  // Le libellé que leboncoin affiche : « il y a 3 jours à 15:36 ».
  const DISPLAYED_DATE = /il y a .+ à \d{1,2}:\d{2}|(?:hier|aujourd'hui) à \d{1,2}:\d{2}/i

  const anchor = () => {
    const nodes = document.querySelectorAll('p, span, div, time')
    for (const n of nodes) {
      if (n.children.length === 0 && DISPLAYED_DATE.test(n.textContent)) return n
    }
    return document.querySelector('h1')
  }

  const panel = (listing, now) => {
    const s = signals(listing, now)
    const el = document.createElement('div')
    el.className = 'adscope-panel' + (s.bumped ? ' adscope-panel--bumped' : '')
    el.setAttribute(MARK, listing.siteId)

    const line = (label, value, strong) => {
      const row = document.createElement('div')
      row.className = 'adscope-row'
      const l = document.createElement('span')
      l.className = 'adscope-label'
      l.textContent = label
      const v = document.createElement('span')
      v.className = 'adscope-value' + (strong ? ' adscope-value--strong' : '')
      v.textContent = value
      row.append(l, v)
      return row
    }

    el.appendChild(line('En ligne depuis', duration(s.onlineDays), s.bumped))
    if (s.bumped) el.appendChild(line('Remontée', ago(s.bumpedDaysAgo), true))
    el.appendChild(line('Vendeur', listing.isPro ? 'professionnel' : 'particulier'))
    return el
  }

  const render = () => {
    if (document.querySelector(`[${MARK}]`)) return
    const [listing] = fromDocument(document)
    if (!listing) return
    const target = anchor()
    if (!target) return
    target.parentElement.insertBefore(panel(listing, new Date()), target.nextSibling)
  }

  render()
  new MutationObserver(render).observe(document.body, { childList: true, subtree: true })
})()
