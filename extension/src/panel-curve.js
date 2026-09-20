globalThis.ADS = globalThis.ADS || {}

// Le tracé du prix relevé, au registre de la maquette. Le modèle vient de
// `ADS.curve` — il rend des fractions d'axe et ne connaît ni pixels ni site ;
// ici on les met en coordonnées. L'axe couvre le suivi, pas la vie de
// l'annonce : cinq ans de vie et quatre mois de relevé écraseraient la courbe
// sur les derniers pour cent de la largeur.
//
// Le repère est en **pixels d'écran**, recalculé à la largeur disponible, et
// non en unités d'un `viewBox` fixe : le texte d'un SVG rétrécit avec son
// cadre, et dans une colonne étroite le prix et les dates devenaient
// microscopiques. Sortir les libellés du SVG les aurait sauvés aussi, mais on
// ne saurait plus lesquels se recouvrent — l'encombrement se calcule sur des
// textes, en pixels. Échelle 1 : le corps déclaré est le corps affiché.
ADS.plot = (() => {
  const { el, svg } = ADS.node
  const { number, days } = ADS.format
  const { fits } = ADS.marks

  // WIDE : la largeur de la maquette, dessinée avant d'avoir mesuré. NARROW :
  // le plancher, en deçà duquel la courbe déborderait son propre sens — il ne
  // doit jamais mordre sur une colonne réelle, sans quoi le tracé dépasserait
  // sa carte. LEFT et RIGHT : les marges, là où l'axe commence et où « auj. » finit.
  const WIDE = 572
  const NARROW = 180
  const H = 210
  const LEFT = 20
  const RIGHT = 32
  // Le haut et le bas de la bande de prix, puis ceux de la fenêtre du site, qui
  // la déborde : c'est un aplat posé derrière, pas un cadre autour.
  const HIGH = 44
  const LOW = 150
  const TOP = 24
  const BOT = 174
  const AXIS = 197
  const SIZE = 12.5
  const DATE = 11.5

  // Le repère d'un tracé de largeur donnée. Seule l'abscisse s'étire : les
  // hauteurs sont fixes, comme les corps de texte qu'elles espacent. La largeur
  // vient de `draw`, qui la tient de la mesure ou, à défaut, de la maquette.
  const frame = (width) => {
    const w = Math.max(NARROW, Math.round(width))
    const x1 = w - RIGHT
    return { w, x0: LEFT, x1, px: (f) => LEFT + f * (x1 - LEFT), py: (f) => LOW - f * (LOW - HIGH) }
  }

  const stamp = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

  // Les marches : un prix tient jusqu'au changement suivant, il ne glisse pas
  // vers lui. Une diagonale inventerait des prix que personne n'a observés.
  const steps = (g, points) => {
    let d = `M ${g.px(points[0].x)} ${g.py(points[0].y)}`
    for (const p of points.slice(1)) d += ` H ${g.px(p.x)} V ${g.py(p.y)}`
    return d + ` H ${g.px(1)}`
  }

  const write = (plot, taken, mark) => {
    if (!fits(taken, mark)) return
    plot.append(svg('text', { x: mark.x, y: mark.y, class: mark.cls, 'text-anchor': mark.anchor }, mark.text))
  }

  // Ce que le site montre de son côté, et rien d'autre : un seul usage pour
  // l'orangé. Une fenêtre qui couvre tout l'axe ne cache rien — elle ne se
  // dessine pas.
  const window_ = (plot, g, band) => {
    if (!band || band.x < 0.02) return
    plot.append(svg('rect', {
      x: g.px(band.x), y: TOP, width: g.px(1) - g.px(band.x), height: BOT - TOP, rx: 10, class: 'adscope-window',
    }))
    plot.append(svg('text', { x: g.px(band.x) + 12, y: TOP + 17, class: 'adscope-window-label' }, 'Affiché par le site'))
  }

  const label = (m) =>
    `Prix relevé sur ${days(m.days)}, du ${m.axis.start} à aujourd'hui, ${m.points.length} observations`

  const draw = (m, width = WIDE) => {
    const g = frame(width)
    const plot = svg('svg', {
      viewBox: `0 0 ${g.w} ${H}`, width: g.w, height: H,
      class: 'adscope-plot', role: 'img', 'aria-label': label(m),
    })
    window_(plot, g, m.band)
    plot.append(svg('path', { d: steps(g, m.points), class: 'adscope-line' }))
    // Deux signes, à sens unique : le gros point creux pour un changement de
    // prix, le petit pour une vérification qui n'a rien trouvé.
    for (const p of m.points) {
      plot.append(svg('circle', p.change
        ? { cx: g.px(p.x), cy: g.py(p.y), r: 5, class: 'adscope-change' }
        : { cx: g.px(p.x), cy: g.py(p.y), r: 2.6, class: 'adscope-check' }))
    }
    const last = m.points[m.points.length - 1]
    if (last.x < 0.995) plot.append(svg('circle', { cx: g.px(1), cy: g.py(last.y), r: 5, class: 'adscope-change' }))

    const amounts = []
    m.points.forEach((p, i) => {
      if (!p.change) return
      write(plot, amounts, {
        x: g.px(p.x) + (i ? 10 : 0), y: g.py(p.y) - 11, text: number(p.price),
        cls: 'adscope-amount', size: SIZE, anchor: 'start',
      })
    })

    // Les deux bornes de l'axe ne cèdent jamais : elles disent ce que la courbe
    // couvre. Les dates de changement s'écrivent entre elles s'il reste la place.
    const dates = []
    write(plot, dates, { x: g.x0, y: AXIS, text: m.axis.start, cls: 'adscope-axis', size: DATE, anchor: 'start' })
    write(plot, dates, { x: g.x1, y: AXIS, text: m.axis.end, cls: 'adscope-axis', size: DATE, anchor: 'end' })
    for (const p of m.points.slice(1)) {
      if (!p.change) continue
      write(plot, dates, {
        x: g.px(p.x), y: AXIS, text: stamp(p.at), cls: 'adscope-axis', size: DATE, anchor: 'middle',
      })
    }
    return plot
  }

  // La largeur réelle ne se connaît qu'une fois la carte posée dans la page :
  // on dessine à celle de la maquette, puis on refait à la place trouvée.
  // `drawn` retient le modèle de chaque boîte — le panneau est rejoué sans fin.
  const drawn = new WeakMap()

  const box = (m) => {
    const node = el('div', 'adscope-plot-box')
    drawn.set(node, m)
    node.append(draw(m))
    return node
  }

  const fit = (root) => {
    const node = root.querySelector('.adscope-plot-box')
    const m = node && drawn.get(node)
    if (!m) return
    const width = Math.round(node.clientWidth || 0)
    if (!width) return
    const at = node.children[0]
    if (at && Number(at.getAttribute('width')) === frame(width).w) return
    node.replaceChildren(draw(m, width))
  }

  return { draw, box, fit, WIDE, NARROW }
})()

if (typeof module !== 'undefined') module.exports = ADS.plot
