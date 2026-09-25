;(() => {
  // Le site de la page ouverte : c'est lui qui sait lire ses cartes et poser ses
  // seuils. Hors des pages qu'un site déclare couvrir, il n'y a rien à faire.
  const site = ADS.sites.current()
  if (!site) return
  const MARK = 'data-adscope'
  const SRC = 'data-adscope-src'
  // L'ancienneté écrite sur la pastille : la seule mesure que la carte porte,
  // pour que la fiche ouverte la relise sans en refaire le calcul.
  const DAYS = 'data-adscope-days'
  // Le picto est muet pour un lecteur d'écran (aria-hidden) : c'est ce title
  // qui porte la marque à sa place.
  const TITLE = 'adscope — suivi de cette annonce'

  const span = (cls, text) => {
    const el = document.createElement('span')
    el.className = cls
    el.textContent = text
    return el
  }

  // Trois poids visuels : l'alerte pour l'annonce ancienne encore poussée, un
  // cran intermédiaire pour l'ancienne qui dort, la mention discrète pour le
  // reste — elle confirme que l'extension travaille sans rien réclamer.
  // La pastille est posée avec la seule page, puis réécrite si des signaux
  // arrivent — d'où l'estampille, qui évite aussi de boucler avec l'observateur.
  const paint = (card, listing, s) => {
    const down = ADS.sync.authDown()
    const remote = ADS.sync.of(listing.siteId)
    // L'origine entre dans l'estampille : les signaux du cache sont posés
    // d'abord, ceux du réseau les remplacent, et sans cette distinction la
    // pastille resterait sur les premiers. L'état de la session y entre aussi :
    // sans lui, la mention posée sur une session tombée resterait affichée
    // une fois la session revenue.
    const stamp = (ADS.sync.originOf(listing.siteId) || 'page') + (down ? '·down' : '')
    let el = card.querySelector(`[${MARK}]`)
    // Quelle annonce la pastille décrit, et pas seulement d'où viennent ses
    // données : une application monopage réattribue ses nœuds de carte —
    // pagination, filtre, liste virtualisée. Le lien change, l'élément reste, et
    // la carte retrouvée est la bonne ; sans l'identifiant dans la comparaison,
    // l'âge de l'annonce précédente resterait affiché sur la suivante.
    if (el && el.getAttribute(MARK) === listing.siteId && el.getAttribute(SRC) === stamp) return false
    if (!el) {
      el = document.createElement('div')
      card.appendChild(el)
    }
    // Réécrit à chaque rendu, pas à la seule création : c'est ce marquage que la
    // comparaison ci-dessus relit.
    el.setAttribute(MARK, listing.siteId)
    el.setAttribute(SRC, stamp)
    // La session tombée efface la pastille : un signal qu'on ne rafraîchit
    // plus ne mérite pas d'être affiché comme s'il l'était encore.
    if (down) {
      el.removeAttribute(DAYS)
      el.className = ''
      el.replaceChildren(ADS.authNotice.mention())
      return true
    }
    el.setAttribute('title', TITLE)
    // L'ancienneté, une fois calculée, est écrite sur la pastille : c'est là que
    // les deux cartes d'une même annonce vont la relire pour rester d'accord.
    // Une annonce sans date n'en porte pas plutôt que d'en porter une fausse.
    if (s.onlineDays == null) el.removeAttribute(DAYS)
    else el.setAttribute(DAYS, s.onlineDays)
    const { page, tracked } = ADS.view.badge(s, remote)
    // Le poids visuel se lit sur la seule page : l'orangé n'existe que pour ce
    // que le site cache. Une baisse, elle, est une mesure d'adscope — elle a son
    // fragment et son filet indigo, elle ne prend pas la couleur de l'alerte.
    const weight = s.notable ? 'notable' : s.dormant ? 'dormant' : 'quiet'
    el.className =
      `adscope-badge adscope-badge--${weight}` +
      (listing.sellerType === 'private' ? ' adscope-badge--private' : '')
    // Un nœud par origine : le suivi mutualisé ne se fond pas dans la page.
    el.replaceChildren(
      ADS.icons.mark(),
      span('adscope-badge-page', page),
      ...(tracked ? [span('adscope-badge-tracked', tracked)] : []),
    )
    return true
  }

  // Le diagnostic est réécrit quand la page change d'annonces — même si aucune
  // carte ne leur correspond encore — et quand des pastilles se posent.
  let reported = null

  // On ne suit que ce qu'on montre. La charge d'une page en porte davantage
  // qu'elle n'en affiche : un site y précharge, sous sa clé d'annonces
  // similaires, six annonces qu'aucune carte ne rend — et qui arrivent sans
  // véhicule, sans vendeur et sans date de modification, un prix et une mise en
  // ligne pour toute identité. La carte est le juge : celle qui n'en a pas
  // n'est pas sous les yeux du lecteur.
  const render = ADS.context.guard(() => {
    const now = new Date()
    const listings = ADS.feed.listings(document)
    // Une seule lecture du conteneur par rendu : la map identifiant → cartes
    // se construit une fois ici, jamais une fois par annonce (performance-
    // engineer, /audit-project, extension/src/listing.js:101).
    const cardMap = site.cardMap(document)
    const shown = []
    // Le résumé que la fenêtre affiche, et le badge de l'icône : combien
    // dépassent le seuil du site, combien sont en alerte. Les deux comptes se
    // tiennent ici, où les signaux de chaque annonce sont déjà calculés.
    const counts = { old: 0, alerts: 0 }
    let placed = 0
    for (const listing of listings) {
      // Une mise en avant reparaît parfois plus bas dans les mêmes résultats :
      // toutes ses cartes portent la même annonce, donc la même pastille.
      const cards = cardMap.get(listing.siteId) || []
      if (!cards.length) continue
      shown.push(listing)
      const s = site.signals(listing, now)
      if (s.old) counts.old++
      if (s.notable) counts.alerts++
      for (const card of cards) if (paint(card, listing, s)) placed++
    }
    ADS.sync.send(shown)
    // Le compte transmis entre dans l'estampille : il change après coup, quand
    // l'API accuse réception, et le diagnostic doit suivre même si rien d'autre
    // n'a bougé sur la page.
    const seen = shown.map((l) => l.siteId).join() + '|' + ADS.sync.sent()
    if (placed || seen !== reported) {
      reported = seen
      const badges = document.querySelectorAll(`[${MARK}]`).length
      ADS.diag.listing(shown, listings.length - shown.length, badges, ADS.feed.source(), counts)
    }
  })

  render()
  ADS.sync.onSignals(render)
  // La page suivante n'est pas garantie de produire un lot de mutations qu'on
  // observe : ses annonces, elles, arrivent toujours.
  ADS.feed.onData(render)

  // Les résultats se rechargent sans navigation : on réobserve le conteneur.
  ADS.context.observe(render)
})()
