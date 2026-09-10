globalThis.ADS = globalThis.ADS || {}

// Le tracé du prix relevé, au registre de la maquette. Le modèle vient de
// `ADS.curve` — il rend des fractions d'axe et ne connaît ni pixels ni site ;
// ici on les met en coordonnées. L'axe couvre le suivi, pas la vie de
// l'annonce : cinq ans de vie et quatre mois de relevé écraseraient la courbe
// sur les derniers pour cent de la largeur.
ADS.plot = (() => {
  const { svg } = ADS.node
  const { number } = ADS.format

  const W = 572
  const H = 210
  const X0 = 20
  const X1 = 540
  // Le haut et le bas de la bande de prix, puis ceux de la fenêtre du site, qui
  // la déborde : c'est un aplat posé derrière, pas un cadre autour.
  const HIGH = 44
  const LOW = 150
  const TOP = 24
  const BOT = 174
  const AXIS = 197
  const SIZE = 12.5
  const DATE = 11.5
  // Une fonte à chasse variable n'a pas de largeur exacte, mais son avance
  // moyenne suffit à savoir si deux libellés se marchent dessus.
  const ADVANCE = 0.62

  const px = (f) => X0 + f * (X1 - X0)
  const py = (f) => LOW - f * (LOW - HIGH)
  const stamp = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

  // Deux relevés, ou un prix qui a bougé. En deçà il n'y a pas de courbe : il y
  // a un point et beaucoup de vide, et la carte pâle le dit mieux.
  const model = ({ remote: r, signals: s, site, displayed, now }) => {
    const history = r.price_history || []
    const moved = history.some((p, i) => i && p.price !== history[i - 1].price)
    if (history.length < 2 && !moved) return null
    const claim = site.claim(s, displayed)
    return ADS.curve.plot({
      publishedAt: r.first_seen || now,
      now,
      history,
      claimDays: claim ? claim.days : null,
    })
  }

  // Les marches : un prix tient jusqu'au changement suivant, il ne glisse pas
  // vers lui. Une diagonale inventerait des prix que personne n'a observés.
  const steps = (points) => {
    let d = `M ${px(points[0].x)} ${py(points[0].y)}`
    for (const p of points.slice(1)) d += ` H ${px(p.x)} V ${py(p.y)}`
    return d + ` H ${px(1)}`
  }

  const box = (x, y, text, size, anchor) => {
    const w = text.length * size * ADVANCE
    const left = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x
    return { x1: left - 3, x2: left + w + 3, y1: y - size, y2: y + size * 0.3 }
  }

  const clash = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2

  // Le premier venu prend sa place, les suivants prennent ce qui reste — et
  // rien s'il ne reste rien : un libellé recouvert ne se lit pas mieux qu'un
  // libellé absent.
  const room = (taken, at) => (taken.some((t) => clash(t, at)) ? false : (taken.push(at), true))

  const write = (plot, taken, { x, y, text, cls, size, anchor }) => {
    if (!room(taken, box(x, y, text, size, anchor))) return
    plot.append(svg('text', { x, y, class: cls, 'text-anchor': anchor }, text))
  }

  // Ce que le site montre de son côté, et rien d'autre : un seul usage pour
  // l'orangé. Une fenêtre qui couvre tout l'axe ne cache rien — elle ne se
  // dessine pas.
  const window_ = (plot, band) => {
    if (!band || band.x < 0.02) return
    plot.append(svg('rect', {
      x: px(band.x), y: TOP, width: px(1) - px(band.x), height: BOT - TOP, rx: 10, class: 'adscope-window',
    }))
    plot.append(svg('text', { x: px(band.x) + 12, y: TOP + 17, class: 'adscope-window-label' }, 'Affiché par le site'))
  }

  const label = (m) =>
    `Prix relevé sur ${m.days} jours, du ${m.axis.start} à aujourd'hui, ${m.points.length} observations`

  const draw = (m) => {
    const plot = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'adscope-plot', role: 'img', 'aria-label': label(m) })
    window_(plot, m.band)
    plot.append(svg('path', { d: steps(m.points), class: 'adscope-line' }))
    // Deux signes, à sens unique : le gros point creux pour un changement de
    // prix, le petit pour une vérification qui n'a rien trouvé.
    for (const p of m.points) {
      plot.append(svg('circle', p.change
        ? { cx: px(p.x), cy: py(p.y), r: 5, class: 'adscope-change' }
        : { cx: px(p.x), cy: py(p.y), r: 2.6, class: 'adscope-check' }))
    }
    const last = m.points[m.points.length - 1]
    if (last.x < 0.995) plot.append(svg('circle', { cx: px(1), cy: py(last.y), r: 5, class: 'adscope-change' }))

    const amounts = []
    m.points.forEach((p, i) => {
      if (!p.change) return
      write(plot, amounts, {
        x: px(p.x) + (i ? 10 : 0), y: py(p.y) - 11, text: number(p.price),
        cls: 'adscope-amount', size: SIZE, anchor: 'start',
      })
    })

    // Les deux bornes de l'axe ne cèdent jamais : elles disent ce que la courbe
    // couvre. Les dates de changement s'écrivent entre elles s'il reste la place.
    const dates = []
    write(plot, dates, { x: X0, y: AXIS, text: m.axis.start, cls: 'adscope-axis', size: DATE, anchor: 'start' })
    write(plot, dates, { x: X1, y: AXIS, text: m.axis.end, cls: 'adscope-axis', size: DATE, anchor: 'end' })
    for (const p of m.points.slice(1)) {
      if (!p.change) continue
      write(plot, dates, {
        x: px(p.x), y: AXIS, text: stamp(p.at), cls: 'adscope-axis', size: DATE, anchor: 'middle',
      })
    }
    return plot
  }

  return { model, draw }
})()

if (typeof module !== 'undefined') module.exports = ADS.plot
