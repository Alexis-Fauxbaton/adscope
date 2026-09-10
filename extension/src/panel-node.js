globalThis.ADS = globalThis.ADS || {}

// Les deux gestes que le panneau répète : poser un élément de page, poser un
// élément de dessin. Le second a son espace de noms à lui — un `rect` créé
// comme un `div` ne s'affiche pas.
ADS.node = (() => {
  const SVG = 'http://www.w3.org/2000/svg'

  const el = (tag, cls, text = null) => {
    const n = document.createElement(tag)
    if (cls) n.className = cls
    if (text !== null) n.textContent = text
    return n
  }

  const svg = (name, attrs = {}, text = null) => {
    const n = document.createElementNS(SVG, name)
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, v)
    if (text !== null) n.textContent = text
    return n
  }

  // Un pictogramme : son tracé seul le distingue, le reste est commun. Le trait
  // prend la couleur du rond qui le porte, jamais la sienne.
  const icon = (parts, cls, size = 18) => {
    const box = svg('svg', {
      class: cls, width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    })
    for (const part of parts) {
      box.append(typeof part === 'string' ? svg('path', { d: part }) : svg(part.shape, part))
    }
    return box
  }

  return { el, svg, icon }
})()

if (typeof module !== 'undefined') module.exports = ADS.node
