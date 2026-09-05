;(() => {
  const { fromDocument, signals } = ADS.leboncoin
  const MARK = 'data-adscope-detail'
  const SRC = 'data-adscope-src'

  // Le libellé que leboncoin affiche : « il y a 3 jours à 15:36 ».
  const DISPLAYED_DATE = /il y a .+ à \d{1,2}:\d{2}|(?:hier|aujourd'hui) à \d{1,2}:\d{2}/i

  const dateNode = () => {
    for (const n of document.querySelectorAll('p, span, div, time')) {
      // Le panneau cite lui-même cette date : ne pas la relire dans son propre texte.
      if (n.children.length === 0 && DISPLAYED_DATE.test(n.textContent) && !n.closest(`[${MARK}]`)) return n
    }
    return null
  }

  const span = (cls, text) => {
    const el = document.createElement('span')
    el.className = cls
    el.textContent = text
    return el
  }

  const row = ({ label, value, strong }, tracked) => {
    const el = document.createElement('div')
    el.className = 'adscope-row' + (tracked ? ' adscope-row--tracked' : '')
    el.append(span('adscope-label', label), span('adscope-value' + (strong ? ' adscope-value--strong' : ''), value))
    return el
  }

  const caption = (text) => {
    const el = document.createElement('div')
    el.className = 'adscope-caption'
    el.textContent = text
    return el
  }

  const claimBlock = (claim) => {
    const el = document.createElement('div')
    el.className = 'adscope-claim'
    const head = document.createElement('div')
    head.append(span('adscope-label', claim.label), span('adscope-claim-date', `«\u00a0${claim.says}\u00a0»`))
    const note = document.createElement('div')
    note.className = 'adscope-note'
    note.textContent = claim.note
    el.append(head, note)
    return el
  }

  const fill = (el, listing, remote, displayed) => {
    const s = signals(listing, new Date())
    const model = ADS.view.panel(listing, s, remote, displayed)
    el.className = 'adscope-panel' + (s.bumped ? ' adscope-panel--bumped' : '')
    const nodes = [caption('Lu sur la page'), ...model.page.map((r) => row(r))]
    if (model.claim) nodes.push(claimBlock(model.claim))
    if (model.tracked.length) nodes.push(caption('Suivi adscope'), ...model.tracked.map((r) => row(r, true)))
    el.replaceChildren(...nodes)
  }

  const render = () => {
    const listings = fromDocument(document)
    const [listing] = listings
    if (!listing) return
    ADS.sync.send(listings)
    const remote = ADS.sync.of(listing.siteId)
    const stamp = remote ? 'sync' : 'page'
    let el = document.querySelector(`[${MARK}]`)
    const node = dateNode()
    if (!el) {
      const target = node || document.querySelector('h1')
      if (!target) return
      el = document.createElement('div')
      el.setAttribute(MARK, listing.siteId)
      target.parentElement.insertBefore(el, target.nextSibling)
    } else if (el.getAttribute(SRC) === stamp) return
    el.setAttribute(SRC, stamp)
    fill(el, listing, remote, node && node.textContent.trim())
  }

  render()
  ADS.sync.onSignals(render)
  new MutationObserver(render).observe(document.body, { childList: true, subtree: true })
})()
