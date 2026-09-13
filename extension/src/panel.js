globalThis.ADS = globalThis.ADS || {}

// Le panneau posé dans la fiche. Il ne mesure rien : le site a lu la page, le
// suivi mutualisé a répondu, les sections savent quoi en dire. Ici on assemble,
// et on tient la seule chose qui vive — quelle section est ouverte.
ADS.panel = (() => {
  const { el, icon } = ADS.node
  const OPEN = 'data-adscope-open'
  // Le suivi demandé à l'instant, retenu sur le nœud posé et non dans le
  // module : le panneau survit au passage à la fiche suivante, et c'est
  // l'identifiant inscrit qui dit de laquelle il s'agit.
  const FOLLOWED = 'data-adscope-followed'
  const FOOT = 'Relevé sur les pages publiques, avec sa date. adscope ne conclut pas à votre place.'

  const stamp = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

  const round = (tone, parts) => {
    const n = el('span', `adscope-round adscope-round--${tone}`)
    n.append(icon(parts))
    return n
  }

  const opened = (s) => {
    const card = el('div', 'adscope-card')
    const head = el('div', 'adscope-open-head')
    head.append(round(s.tone, s.icon), el('p', 'adscope-title', s.title))
    card.append(head, ...s.body)
    return card
  }

  // Les repliées tiennent dans une carte, une rangée chacune : c'est la rangée
  // qu'on clique, et le fait en sous-titre dit s'il vaut la peine de l'ouvrir.
  const folded = (sections, toggle) => {
    const card = el('div', 'adscope-card')
    for (const s of sections) {
      const tile = el('button', 'adscope-tile')
      tile.setAttribute('type', 'button')
      const text = el('span', 'adscope-tile-text')
      text.append(el('span', 'adscope-tile-title', s.title), el('span', 'adscope-tile-fact', s.short))
      tile.append(round(s.tone, s.icon), text, icon(ADS.icons.chevron, 'adscope-chevron', 16))
      tile.addEventListener('click', () => toggle(s.key))
      card.append(tile)
    }
    return card
  }

  // Une seule ouverte à la fois. `Prix` par défaut — c'est ce qu'un marchand
  // ouvre le matin ; tant que le suivi n'a rien à en dire, la première section
  // prend sa place plutôt que de laisser un trou.
  const deck = (ctx, chosen, toggle) => {
    const all = ADS.sections.all(ctx)
    const open = all.find((s) => s.key === chosen) || all.find((s) => s.key === 'price') || all[0]
    const rest = all.filter((s) => s !== open)
    return [...(open ? [opened(open)] : []), ...(rest.length ? [folded(rest, toggle)] : [])]
  }

  // L'en-tête : ce qu'on regarde, quand, et le seul geste du panneau. Sans
  // signaux il n'y a pas de bouton — l'API n'a encore rien dit de l'annonce, et
  // rien ne saurait dire si elle est déjà suivie.
  const head = (ctx, state) => {
    const row = el('div', 'adscope-head-row')
    row.append(el('p', 'adscope-head', `adscope · ${ctx.site.name} · ${stamp(ctx.now)}`))
    if (state) row.append(ADS.cards.follow(state, 'adscope-follow'))
    return row
  }

  const render = (root, ctx) => {
    const toggle = (key) => {
      root.setAttribute(OPEN, key)
      render(root, ctx)
    }
    const state = ctx.remote && {
      on: ctx.remote.followed || root.getAttribute(FOLLOWED) === ctx.listing.siteId,
      act: () =>
        ADS.follow.add(ctx.listing, () => {
          root.setAttribute(FOLLOWED, ctx.listing.siteId)
          render(root, ctx)
        }),
    }
    root.className = 'adscope-panel'
    root.replaceChildren(
      head(ctx, state),
      ADS.cards.figure(ctx),
      ...ADS.cards.curve(ctx, state),
      ...deck(ctx, root.getAttribute(OPEN), toggle),
      el('p', 'adscope-foot', FOOT),
    )
  }

  return { render }
})()

if (typeof module !== 'undefined') module.exports = ADS.panel
