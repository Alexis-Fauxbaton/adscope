;(() => {
  // Le site de la page ouverte : lui seul sait quel libellé d'ancienneté sa fiche
  // affiche, quelle contradiction elle porte, et comment son URL nomme l'annonce.
  const site = ADS.sites.current()
  if (!site) return
  const MARK = 'data-adscope-detail'
  const SRC = 'data-adscope-src'

  // Le panneau cite lui-même cette date : ne pas la relire dans son propre texte.
  const dateNode = () => site.dateNode(document, `[${MARK}]`)

  // Où le panneau se pose : c'est le site qui le sait, et lui seul. Il rend un
  // endroit — le parent et le nœud devant lequel insérer —, jamais un simple
  // voisin : en tête d'une colonne il n'y a personne derrière qui serve de
  // repère. Le libellé d'ancienneté déjà trouvé lui est tendu — certains s'y
  // ancrent —, et le titre reste le dernier recours quand la page n'offre rien.
  const spot = (node) => site.mount(document, node) || ADS.read.after(document.querySelector('h1'))

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
  // que le cache savait doit se réécrire quand le réseau répond — et pareil
  // quand la session tombe ou revient, d'où le marqueur qui la suit ici.
  const stampOf = (siteId) =>
    `${ADS.sync.originOf(siteId) || 'page'}·${ADS.market.stamp(siteId)}` + (ADS.sync.authDown() ? '·down' : '')

  // Quelle annonce est lue : l'URL le dit, le panneau déjà posé non — sur une
  // application monopage il survit au passage à la fiche suivante. Hors fiche
  // (page de résultats) l'URL ne porte pas d'identifiant, son marquage fait foi.
  const urlId = () => site.urlId(location.pathname)
  const readId = (el) => urlId() || el.getAttribute(MARK)

  // Plusieurs annonces sont connues à la fois — une fiche et ses annonces
  // similaires, les fiches reçues depuis, une page de résultats et son bandeau.
  // Seul l'identifiant de l'URL dit laquelle est lue, et hors fiche il n'y en a
  // pas : le repli sur la première annonce du bloc a longtemps couvert ce cas
  // aussi, ce qui donnait audience à toute charge forgée par le pont monde MAIN
  // (audit offensif, angle extension, T1) dès qu'aucune fiche n'était ouverte —
  // accueil, page de compte, résultats vides. Sur une fiche (l'URL en désigne
  // une), le repli reste juste quand elle manque encore au bloc (navigation
  // monopage prise entre deux états) : il vaut mieux un panneau que rien, son
  // marquage restera en désaccord avec l'URL, et le rendu sera rejoué jusqu'à
  // ce que la bonne annonce arrive — par la charge que le navigateur reçoit
  // pour la fiche ouverte.
  const pick = (listings, id = urlId()) => (id ? listings.find((l) => l.siteId === id) || listings[0] : null)

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
      const at = spot(node)
      if (!at) return
      el = document.createElement('div')
      at.parent.insertBefore(el, at.before)
    }
    el.setAttribute(MARK, listing.siteId)
    el.setAttribute(SRC, stampOf(listing.siteId))
    const now = new Date()
    const s = site.signals(listing, now)
    const says = node && node.textContent.trim()
    // La session tombée efface le panneau : un suivi qu'on ne rafraîchit
    // plus ne mérite pas d'être affiché comme s'il l'était encore.
    if (ADS.sync.authDown()) {
      el.className = ''
      el.replaceChildren(ADS.authNotice.mention())
    } else {
      const market = ADS.market.of(listing.siteId)
      ADS.panel.render(el, { site, listing, signals: s, remote, displayed: says, market, now })
    }
    ADS.diag.detail(listings, listing, ADS.feed.detailSource(listing.siteId), card(listing, s, says))
  })

  render()
  // La colonne change de largeur avec la fenêtre : le tracé se redessine à la
  // nouvelle place, sinon son texte se remettrait à rétrécir avec le cadre.
  // Rien d'autre n'est rejoué — le rendu, lui, n'a aucune raison de l'être.
  addEventListener('resize', () => {
    const posted = document.querySelector(`[${MARK}]`)
    if (posted) ADS.plot.fit(posted)
  })
  ADS.sync.onSignals(render)
  ADS.market.onFound(render)
  // La fiche suivante n'est pas garantie de produire un lot de mutations qu'on
  // observe : sa charge, elle, arrive toujours.
  ADS.feed.onDetail(render)
  ADS.context.observe(render)
})()
