globalThis.ADS = globalThis.ADS || {}

// Où ce prix tombe parmi ceux qu'adscope suit sur le même segment. Cinq bornes
// et un repère, jamais un prix cible ni un verdict : la barre montre, le
// lecteur conclut.
ADS.spread = (() => {
  const { el, svg } = ADS.node
  const { number, money } = ADS.format

  const W = 572
  const X0 = 10
  const X1 = 562
  // Deux libellés de bornes trop proches se recouvrent : celui du milieu cède,
  // les extrêmes tiennent — ce sont eux qui donnent l'échelle.
  const GAP = 56
  // Le seuil du contrat, redit ici parce que la phrase le cite au lecteur.
  const FEW = 15

  const percent = (v) => `${Math.round(v * 100)} %`
  const plural = (n) => (n > 1 ? 's' : '')

  const segment = (g) => [g.brand, g.model, g.year, g.version].filter(Boolean).join(' ')

  // Le sous-titre de la rangée repliée : ce qu'on saurait sans ouvrir.
  const short = (c) => {
    if (c.comparable) {
      return `${c.percentile}ᵉ centile de ${c.count} comparables · dispersion ${percent(c.dispersion)}`
    }
    if (c.reason === 'too_dispersed') return `${c.count} comparables · segment trop dispersé`
    if (c.reason === 'too_few') return `moins de ${FEW} comparables`
    return 'marque, modèle ou année absents de la page'
  }

  // Ce qui remplace la barre quand le segment ne tient pas. Le nombre est dit
  // quand même : « pas assez de comparables » sans le compte n'apprend rien.
  const line = (c) => {
    if (c.reason === 'too_dispersed') {
      return `${c.count} comparables, segment trop dispersé pour comparer (dispersion ${percent(c.dispersion)}).`
    }
    if (c.reason === 'too_few') {
      const seen = `${c.count} comparable${plural(c.count)} suivi${plural(c.count)}`
      return `${seen} : moins de ${FEW}, trop peu pour situer ce prix.`
    }
    return "Marque, modèle ou année absents de l'annonce : aucun segment à réunir."
  }

  const bounds = (c) => [
    { at: c.min, name: 'min', anchor: 'start', fixed: true },
    { at: c.q1, name: 'Q1', anchor: 'middle' },
    { at: c.median, name: 'médiane', anchor: 'middle' },
    { at: c.q3, name: 'Q3', anchor: 'middle' },
    { at: c.max, name: 'max', anchor: 'end', fixed: true },
  ]

  const bar = (c, price) => {
    const span = c.max - c.min || 1
    const x = (v) => X0 + Math.min(1, Math.max(0, (v - c.min) / span)) * (X1 - X0)
    const plot = svg('svg', {
      viewBox: `0 0 ${W} 108`, class: 'adscope-bar', role: 'img',
      'aria-label': `Distribution de ${c.count} comparables, de ${number(c.min)} à ${number(c.max)} euros`,
    })
    plot.append(svg('rect', { x: X0, y: 44, width: X1 - X0, height: 10, rx: 5, class: 'adscope-track' }))
    plot.append(svg('rect', {
      x: x(c.q1), y: 39, width: Math.max(2, x(c.q3) - x(c.q1)), height: 20, rx: 10, class: 'adscope-iqr',
    }))
    plot.append(svg('rect', { x: x(c.median) - 1.4, y: 35, width: 2.8, height: 28, rx: 1.4, class: 'adscope-median' }))
    if (price != null) mark(plot, x(price), price)

    let last = -Infinity
    for (const b of bounds(c)) {
      const at = b.anchor === 'start' ? X0 : b.anchor === 'end' ? X1 : x(b.at)
      if (!b.fixed && (at - last < GAP || X1 - at < GAP)) continue
      last = at
      plot.append(svg('text', { x: at, y: 82, 'text-anchor': b.anchor, class: 'adscope-bound' }, number(b.at)))
      plot.append(svg('text', { x: at, y: 98, 'text-anchor': b.anchor, class: 'adscope-bound-name' }, b.name))
    }
    return plot
  }

  // Le repère de l'annonce ouverte, à l'accent d'adscope : c'est la seule
  // mesure de la carte qui vienne de nous.
  const mark = (plot, at, price) => {
    plot.append(svg('line', { x1: at, y1: 27, x2: at, y2: 37, class: 'adscope-stem' }))
    plot.append(svg('circle', { cx: at, cy: 49, r: 7, class: 'adscope-mark' }))
    plot.append(svg('text', {
      x: Math.min(X1 - 72, Math.max(X0 + 72, at)), y: 21, 'text-anchor': 'middle', class: 'adscope-mark-label',
    }, `Cette annonce · ${money(price)}`))
  }

  const fact = (text) => el('p', 'adscope-fact', text)

  const open = ({ market, listing }) => {
    const c = market.comparables
    const nodes = c.comparable
      ? [bar(c, listing.price), fact(`${c.percentile} % des ${c.count} comparables sont à ce prix ou en dessous.`)]
      : [fact(line(c))]
    const named = segment(c.segment)
    if (named) {
      // Le segment a pu reculer : la version n'est renseignée que sur une
      // annonce sur trois, et le dire vaut mieux que laisser croire au contraire.
      const fell = listing.version && !c.segment.version
      const aside = fell ? ", version mise de côté faute d'assez de comparables" : ''
      nodes.push(fact(`Segment retenu : ${named}${aside}.`))
    }
    return nodes
  }

  return { short, open }
})()

if (typeof module !== 'undefined') module.exports = ADS.spread
