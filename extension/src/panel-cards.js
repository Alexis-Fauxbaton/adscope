globalThis.ADS = globalThis.ADS || {}

// Les deux cartes du haut : le chiffre, puis la courbe. Une chose par carte —
// c'est ce qui a réglé « trop compact, trop empilé ».
ADS.cards = (() => {
  const { el } = ADS.node
  const { spell, number } = ADS.format
  const UNDATED = 'date absente de la page'

  const day = (v) => new Date(v).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  const plural = (n) => (n > 1 ? 's' : '')

  // La pilule n'existe que si le site ment : c'est son module qui le dit, et
  // lui seul — un site dont la page affiche l'âge exact n'a rien à opposer. Le
  // libellé exact et ce qu'il recouvre restent lisibles au survol, sans encombrer.
  const pill = (claim) => {
    const n = el('span', 'adscope-pill', `Le site affiche ${claim.days > 0 ? `${claim.days} j` : "aujourd'hui"}`)
    n.setAttribute('title', `${claim.label} « ${claim.says} » — ${claim.note}`)
    return n
  }

  const figure = ({ site, listing, signals: s, displayed }) => {
    const card = el('div', 'adscope-card')
    const undated = s.onlineDays == null
    const row = el('div', 'adscope-figure')
    const hero = 'adscope-hero' + (undated ? ' adscope-hero--undated' : '')
    row.append(el('div', hero, undated ? UNDATED : spell(s.onlineDays)))
    const claim = site.claim(s, displayed)
    if (claim) row.append(pill(claim))
    card.append(el('p', 'adscope-label', 'En ligne depuis'), row)
    // Les trois faits que la page porte, dans l'ordre où on les citerait : le
    // compte de jours se vérifie, la date le fonde, le type de vendeur dit à
    // qui l'on parle.
    const sub = [
      undated ? null : `${number(s.onlineDays)} jours`,
      listing.publishedAt ? `mise en ligne le ${day(listing.publishedAt)}` : null,
      `vendeur ${listing.sellerType === 'pro' ? 'professionnel' : 'particulier'}`,
    ].filter(Boolean)
    card.append(el('p', 'adscope-sub', sub.join(' · ')))
    return card
  }

  // Le garde-fou d'honnêteté, en une ligne : depuis quand on regarde, à quelle
  // cadence. Ni le compte de vues ni le prix n'y figurent — l'un ne se vérifie
  // pas, l'autre se lit ailleurs sur la carte.
  const legend = (r) => {
    const said = ADS.view.legend(r)
    return said ? [el('p', 'adscope-fine', said)] : []
  }

  // Le bouton, posé là où se trouve ce qu'il change : dans l'en-tête sur toute
  // fiche, dans la carte pâle quand c'est elle qui pose la question.
  const follow = (state, cls) => {
    const n = el('button', state.on ? `${cls} adscope-follow--on` : cls, state.on ? 'Suivie' : 'Suivre')
    n.setAttribute('type', 'button')
    if (!state.on) n.addEventListener('click', state.act)
    return n
  }

  // « Pas encore suivie » : première observation, faite aujourd'hui. La visite
  // en cours est donc la première jamais faite — il n'y a rien à tracer, et
  // rien non plus à promettre tant que personne n'a demandé à la revoir.
  const unseen = (r, now) =>
    (r.observations || 0) <= 1 && new Date(r.first_seen).toDateString() === now.toDateString()

  const first = (state) => {
    const card = el('div', 'adscope-card adscope-card--soft')
    if (state.on) {
      card.append(el('p', null, "Suivie depuis aujourd'hui."))
      return card
    }
    card.append(
      el('p', null, "Première fois qu'adscope voit cette annonce — pas encore suivie."),
      follow(state, 'adscope-follow adscope-follow--card'),
    )
    return card
  }

  // Sous deux relevés, la carte pâle plutôt qu'une courbe d'un seul point : elle
  // dit ce qu'on a, et que la suite viendra sans rien demander à personne.
  const waiting = (r) => {
    const seen = r.observations || (r.price_history || []).length
    const days = r.tracked_days || 0
    const card = el('div', 'adscope-card adscope-card--soft')
    card.append(el('p', null,
      `${seen} relevé${plural(seen)} ${days > 0 ? `en ${days} jour${plural(days)}` : "aujourd'hui"}` +
      " — la courbe apparaîtra d'elle-même."))
    card.append(...legend(r))
    return card
  }

  const curve = (ctx, state) => {
    if (!ctx.remote) return []
    if (unseen(ctx.remote, ctx.now)) return [first(state)]
    const model = ADS.plot.model(ctx)
    if (!model) return [waiting(ctx.remote)]
    const card = el('div', 'adscope-card')
    card.append(el('p', 'adscope-title', `Prix relevé · ${model.days} jours`), ADS.plot.draw(model))
    const said = ADS.note.window(model)
    if (said) card.append(el('p', 'adscope-said', said))
    card.append(...legend(ctx.remote))
    return [card]
  }

  return { figure, curve, follow }
})()

if (typeof module !== 'undefined') module.exports = ADS.cards
