globalThis.ADS = globalThis.ADS || {}

// Le tracé de la courbe, en SVG et sans balisage : le modèle rend des fractions
// d'axe, ce module les pose en coordonnées. Trois signes, chacun à sens unique —
// la hachure pour ce qu'on n'a pas vu, le gros point pour un changement de prix,
// le petit pour une vérification qui n'a rien trouvé.
ADS.chart = (() => {
  const NS = 'http://www.w3.org/2000/svg'
  const { money, number } = ADS.format

  // Le cadre : la bande de prix laisse de la place au-dessus et en dessous pour
  // les montants, la ligne de base ferme le dessin comme un imprimé.
  const W = 312
  const H = 76
  const TOP = 22
  const BOT = 48
  const FRAME = [4, 56]
  const BASE = 64
  // En deçà, la phrase ne tient pas dans la hachure : elle se lit sous l'axe.
  const ROOMY = 0.45

  const node = (name, attrs = {}, text = null) => {
    const el = document.createElementNS(NS, name)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    if (text !== null) el.textContent = text
    return el
  }

  const px = (x) => 1 + x * (W - 2)
  const py = (y) => BOT - y * (BOT - TOP)

  // La trame des périodes sans observation, déclarée une fois par tracé.
  const hatching = (id) => {
    const lines = node('pattern', {
      id, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)',
    })
    lines.append(node('line', { x1: 0, y1: 0, x2: 0, y2: 5, class: 'hatch-line' }))
    const defs = node('defs')
    defs.append(lines)
    return defs
  }

  // Les marches : un prix tient jusqu'au changement suivant, il ne glisse pas
  // vers lui. Une diagonale inventerait des prix intermédiaires que personne
  // n'a observés.
  const steps = (points) => {
    let d = `M ${px(points[0].x)} ${py(points[0].y)}`
    for (const p of points.slice(1)) d += ` H ${px(p.x)} V ${py(p.y)}`
    return d + ` H ${px(1)}`
  }

  // Le montant se pose du côté où il reste de la place : sous un point bas, au
  // dessus d'un point haut — sinon il vient s'écrire sur la marche voisine.
  const label = (p, text, cls) => {
    const left = p.x < 0.5
    return node('text', {
      x: left ? px(p.x) + 8 : px(p.x) - 6,
      y: p.y < 0.5 ? py(p.y) + 13 : py(p.y) - 8,
      'text-anchor': left ? 'start' : 'end', class: cls,
    }, text)
  }

  // La couche de survol : un disque large et invisible par point, assez espacé
  // pour être visé à cette largeur — l'échantillonnage hebdomadaire pose au
  // plus un point tous les six pixels sur quatre mois.
  const reach = (p, onHover) => {
    const hit = node('circle', { cx: px(p.x), cy: py(p.y), r: 9, class: 'hit' })
    hit.addEventListener('mouseenter', () => onHover(p))
    hit.addEventListener('mouseleave', () => onHover(null))
    return hit
  }

  // Un dessin sans nom n'existe pas pour qui ne le voit pas. Le nom dit ce que la
  // courbe couvre et où elle finit ; le détail des observations se lit sous le
  // tracé, en toutes lettres, plutôt que point par point au clavier.
  const name = (model) => {
    const span = `du ${model.axis.start} à aujourd'hui`
    const seen = model.points.length
    if (!seen) return `Prix observé, ${span} — aucune observation`
    const last = model.points[seen - 1]
    return `Prix observé, ${span} — ${seen} observation${seen > 1 ? 's' : ''}, dernier prix ${money(last.price)}`
  }

  const draw = (model, onHover = () => {}) => {
    const svg = node('svg', {
      viewBox: `0 0 ${W} ${H}`, class: 'plot', role: 'img', 'aria-labelledby': 'plot-name',
    })
    svg.append(node('title', { id: 'plot-name' }, name(model)))
    svg.append(hatching('adscope-hatch'))

    if (model.blind) {
      svg.append(node('rect', {
        'data-blind': '1', x: px(model.blind.x), y: FRAME[0],
        width: Math.max(1, px(model.blind.x + model.blind.w) - px(model.blind.x)),
        height: FRAME[1] - FRAME[0], fill: 'url(#adscope-hatch)', class: 'blind',
      }))
    }
    // Ce que le site montre de son côté, et rien d'autre : un seul usage pour
    // le rouge de tampon.
    if (model.band) {
      svg.append(node('rect', {
        'data-band': '1', x: px(model.band.x), y: FRAME[0],
        width: Math.max(2, px(model.band.x + model.band.w) - px(model.band.x)),
        height: FRAME[1] - FRAME[0], class: 'band',
      }))
      // Le bord gauche de la bande : c'est là que le site cesse de montrer.
      svg.append(node('line', {
        x1: px(model.band.x), y1: FRAME[0], x2: px(model.band.x), y2: FRAME[1], class: 'edge',
      }))
    }

    const roomy = model.blind && model.blind.w >= ROOMY
    if (roomy) {
      svg.append(node('text', {
        x: px(model.blind.w / 2), y: BASE - 5, 'text-anchor': 'middle', class: 'blind-text',
      }, model.blind.text))
    }

    svg.append(node('line', { x1: 0, y1: BASE, x2: W, y2: BASE, class: 'base' }))

    if (model.points.length) {
      svg.append(node('path', { d: steps(model.points), class: 'line' }))
      // La première observation n'est pas un changement constaté : c'est là
      // qu'on commence à regarder. Elle reste un gros point, mais creux.
      model.points.forEach((p, i) => {
        svg.append(node('circle', {
          'data-point': p.change ? 'change' : 'check', cx: px(p.x), cy: py(p.y),
          r: p.change ? 4 : 2, class: p.change ? (i ? 'change' : 'change start') : 'check',
        }))
      })
      const last = model.points[model.points.length - 1]
      const first = model.points[0]
      // Le repère d'aujourd'hui, sauf quand la dernière observation y est déjà :
      // il recouvrirait le point d'origine d'une annonce vue une seule fois.
      if (last.x < 0.995) svg.append(node('circle', { cx: px(1), cy: py(last.y), r: 3.5, class: 'today' }))
      if (first !== last && first.price !== last.price) svg.append(label(first, money(first.price), 'amount'))
      const fell = last.price < first.price
      svg.append(label(last, money(last.price) + (fell ? ` · −${number(first.price - last.price)}` : ''),
        fell ? 'amount fell' : 'amount'))
      for (const p of model.points) svg.append(reach(p, onHover))
    }
    return { svg, captioned: Boolean(model.blind) && !roomy }
  }

  return { draw }
})()

if (typeof module !== 'undefined') module.exports = ADS.chart
