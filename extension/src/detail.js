;(() => {
  // Le site de la page ouverte : lui seul sait quel libellé d'ancienneté sa fiche
  // affiche, quelle contradiction elle porte, et comment son URL nomme l'annonce.
  const site = ADS.sites.current()
  if (!site) return
  const MARK = 'data-adscope-detail'
  const SRC = 'data-adscope-src'

  // Le panneau cite lui-même cette date : ne pas la relire dans son propre texte.
  const dateNode = () => site.dateNode(document, `[${MARK}]`)

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
    const s = site.signals(listing, new Date())
    const model = ADS.view.panel(listing, s, remote, displayed)
    // Le cadre du panneau porte le même poids que la pastille de la carte.
    el.className =
      'adscope-panel' + (s.notable ? ' adscope-panel--notable' : s.dormant ? ' adscope-panel--dormant' : '')
    const nodes = [caption('Lu sur la page'), ...model.page.map((r) => row(r))]
    if (model.claim) nodes.push(claimBlock(model.claim))
    if (model.tracked.length) nodes.push(caption('Suivi adscope'), ...model.tracked.map((r) => row(r, true)))
    el.replaceChildren(...nodes)
  }

  // L'origine des signaux, pas leur seule présence : le panneau posé avec ce
  // que le cache savait doit se réécrire quand le réseau répond.
  const stampOf = (siteId) => ADS.sync.originOf(siteId) || 'page'

  // Quelle annonce est lue : l'URL le dit, le panneau déjà posé non — sur une
  // application monopage il survit au passage à la fiche suivante. Hors fiche
  // (page de résultats) l'URL ne porte pas d'identifiant, son marquage fait foi.
  const urlId = () => site.urlId(location.pathname)
  const readId = (el) => urlId() || el.getAttribute(MARK)

  // Plusieurs annonces sont connues à la fois — une fiche et ses annonces
  // similaires, les fiches reçues depuis, une page de résultats et son bandeau.
  // Seul l'identifiant de l'URL dit laquelle est lue. Le repli sur la première
  // n'est juste que là où l'URL n'en désigne aucune ; quand elle en désigne une
  // qui manque encore (navigation monopage prise entre deux états), il vaut
  // mieux un panneau que rien : son marquage restera en désaccord avec l'URL,
  // donc le rendu sera rejoué jusqu'à ce que la bonne annonce arrive — et elle
  // arrive, par la charge que le navigateur reçoit pour la fiche ouverte.
  const pick = (listings, id = urlId()) => listings.find((l) => l.siteId === id) || listings[0]

  // L'observateur rejoue ce rendu à chaque lot de mutations de la fiche, qui en
  // produit sans cesse. Tant que le panneau posé porte l'annonce lue et la même
  // origine de données, ni le JSON de la page ni le balayage du DOM ne sont
  // refaits.
  const render = ADS.context.guard(() => {
    let el = document.querySelector(`[${MARK}]`)
    const id = el && readId(el)
    if (el && el.getAttribute(MARK) === id && el.getAttribute(SRC) === stampOf(id)) return
    const listings = ADS.feed.details(document)
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
    el.setAttribute(SRC, stampOf(listing.siteId))
    fill(el, listing, remote, node && node.textContent.trim())
    ADS.diag.detail(listings, listing, ADS.feed.detailSource(listing.siteId))
  })

  render()
  ADS.sync.onSignals(render)
  // La fiche suivante n'est pas garantie de produire un lot de mutations qu'on
  // observe : sa charge, elle, arrive toujours.
  ADS.feed.onDetail(render)
  ADS.context.observe(render)
})()
