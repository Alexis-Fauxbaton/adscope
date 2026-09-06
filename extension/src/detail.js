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
    // Le cadre du panneau porte le même poids que la pastille de la carte.
    el.className =
      'adscope-panel' + (s.notable ? ' adscope-panel--notable' : s.dormant ? ' adscope-panel--dormant' : '')
    const nodes = [caption('Lu sur la page'), ...model.page.map((r) => row(r))]
    if (model.claim) nodes.push(claimBlock(model.claim))
    if (model.tracked.length) nodes.push(caption('Suivi adscope'), ...model.tracked.map((r) => row(r, true)))
    el.replaceChildren(...nodes)
  }

  const stampOf = (siteId) => (ADS.sync.of(siteId) ? 'sync' : 'page')

  // Quelle annonce est lue : l'URL le dit, le panneau déjà posé non — sur une
  // application monopage il survit au passage à la fiche suivante. Hors fiche
  // (page de résultats) l'URL ne porte pas d'identifiant, son marquage fait foi.
  const urlId = () => (location.pathname.match(/\d{6,}/) || [])[0]
  const readId = (el) => urlId() || el.getAttribute(MARK)

  // Une page porte parfois plusieurs annonces dans le même bloc de données — une
  // fiche et ses annonces similaires, une page de résultats et son bandeau. Seul
  // l'identifiant de l'URL dit laquelle est lue. Le repli sur la première n'est
  // juste que là où l'URL n'en désigne aucune ; quand elle en désigne une qui
  // manque au bloc (navigation monopage prise entre deux états), il vaut mieux
  // un panneau que rien : son marquage restera en désaccord avec l'URL, donc le
  // rendu sera rejoué jusqu'à ce que la bonne annonce arrive.
  const pick = (listings, id = urlId()) => listings.find((l) => l.siteId === id) || listings[0]

  // L'observateur rejoue ce rendu à chaque lot de mutations de la fiche, qui en
  // produit sans cesse. Tant que le panneau posé porte l'annonce lue et la même
  // origine de données, ni le JSON de la page ni le balayage du DOM ne sont
  // refaits.
  const render = () => {
    let el = document.querySelector(`[${MARK}]`)
    const id = el && readId(el)
    if (el && el.getAttribute(MARK) === id && el.getAttribute(SRC) === stampOf(id)) return
    const listings = fromDocument(document)
    const listing = pick(listings)
    if (!listing) return
    ADS.sync.send(listings)
    const remote = ADS.sync.of(listing.siteId)
    const node = dateNode()
    if (!el) {
      const target = node || document.querySelector('h1')
      if (!target) return
      el = document.createElement('div')
      target.parentElement.insertBefore(el, target.nextSibling)
    }
    el.setAttribute(MARK, listing.siteId)
    el.setAttribute(SRC, remote ? 'sync' : 'page')
    fill(el, listing, remote, node && node.textContent.trim())
    ADS.diag.detail(listings, listing)
  }

  render()
  ADS.sync.onSignals(render)
  new MutationObserver(render).observe(document.body, { childList: true, subtree: true })
})()
