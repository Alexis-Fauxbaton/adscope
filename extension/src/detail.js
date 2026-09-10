;(() => {
  // Le site de la page ouverte : lui seul sait quel libellé d'ancienneté sa fiche
  // affiche, quelle contradiction elle porte, et comment son URL nomme l'annonce.
  const site = ADS.sites.current()
  if (!site) return
  const MARK = 'data-adscope-detail'
  const SRC = 'data-adscope-src'

  // Le panneau cite lui-même cette date : ne pas la relire dans son propre texte.
  const dateNode = () => site.dateNode(document, `[${MARK}]`)

  // Où le panneau se pose : sous le prix, et c'est le site qui sait où il l'écrit.
  // Le libellé d'ancienneté déjà trouvé lui est tendu — certains s'y ancrent —, et
  // le titre reste le dernier recours quand la page n'offre ni l'un ni l'autre.
  const anchor = (node) => site.mount(document, node) || document.querySelector('h1')

  // Ce que la fenêtre montrera de l'annonce. Elle n'a pas la page : tout ce
  // qu'elle affiche de la fiche passe par là, y compris la contradiction — que
  // le site nomme, et qu'aucune autre surface ne recompose.
  const card = (l, s, says) => ({
    title: l.title || null,
    price: l.price ?? null,
    mileage: l.mileage ?? null,
    year: l.year ?? null,
    sellerType: l.sellerType,
    onlineDays: s.onlineDays,
    // Le stockage de l'extension ne retient pas les dates : elles voyagent en
    // texte, et la fenêtre les relit.
    publishedAt: l.publishedAt ? new Date(l.publishedAt).toISOString() : null,
    notable: !!s.notable,
    dormant: !!s.dormant,
    claim: site.claim(s, says),
  })

  // L'origine des signaux, pas leur seule présence : le panneau posé avec ce
  // que le cache savait doit se réécrire quand le réseau répond.
  const stampOf = (siteId) => `${ADS.sync.originOf(siteId) || 'page'}·${ADS.market.stamp(siteId)}`

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
    // La même règle que la liste : on ne suit que ce qu'on montre. Le panneau
    // décrit une annonce, une seule. Les autres que `details` connaît — les
    // fiches que Next a préchargées sans que le lecteur les ouvre — ne sont
    // affichées nulle part. Les annonces similaires, elles, ont leurs cartes
    // sur la fiche : c'est `listing.js` qui les pastille et les transmet.
    ADS.sync.send([listing])
    ADS.market.want(listing)
    const remote = ADS.sync.of(listing.siteId)
    const node = dateNode()
    if (!el) {
      const target = anchor(node)
      if (!target) return
      el = document.createElement('div')
      target.parentElement.insertBefore(el, target.nextSibling)
    }
    el.setAttribute(MARK, listing.siteId)
    el.setAttribute(SRC, stampOf(listing.siteId))
    const now = new Date()
    const s = site.signals(listing, now)
    const says = node && node.textContent.trim()
    const market = ADS.market.of(listing.siteId)
    ADS.panel.render(el, { site, listing, signals: s, remote, displayed: says, market, now })
    ADS.diag.detail(listings, listing, ADS.feed.detailSource(listing.siteId), card(listing, s, says))
  })

  render()
  ADS.sync.onSignals(render)
  ADS.market.onFound(render)
  // La fiche suivante n'est pas garantie de produire un lot de mutations qu'on
  // observe : sa charge, elle, arrive toujours.
  ADS.feed.onDetail(render)
  ADS.context.observe(render)
})()
