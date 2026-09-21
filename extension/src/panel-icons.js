globalThis.ADS = globalThis.ADS || {}

// Les tracés de la maquette, à la grille de 24. Une section sans pictogramme
// n'existe pas : c'est lui qu'on retrouve d'une visite à l'autre, avant le mot.
ADS.icons = {
  car: [
    { shape: 'rect', x: 2.5, y: 11, width: 19, height: 5.6, rx: 1.8 },
    'M5.2 11l1.9-3.7a2 2 0 0 1 1.8-1.1h6.2a2 2 0 0 1 1.8 1.1L18.8 11',
    { shape: 'circle', cx: 7.2, cy: 16.6, r: 1.7 },
    { shape: 'circle', cx: 16.8, cy: 16.6, r: 1.7 },
  ],
  bars: ['M5 20v-6.5', 'M12 20V4.5', 'M19 20v-4'],
  shop: ['M3.6 9.6 12 4l8.4 5.6', 'M5.6 11.2V19.6h12.8V11.2', 'M10 19.6v-4.3h4v4.3'],
  chevron: ['M9 5l7 7-7 7'],
}

// Le picto de marque, repris tel quel du favicon du site (web/index.html) :
// carré indigo, anneau blanc. Un seul endroit le fabrique, posé en tête de
// toute pastille et de tout en-tête — c'est lui qui dit que ce qu'on regarde
// vient d'adscope.
//
// Classe `ads-picto`, jamais `adscope-` : le contrôle de santé du crawl
// (crawler/RUNBOOK.md) compte les `[class*="adscope-"]` pour juger la collecte
// vivante sur une page. Le picto se pose sur chaque pastille déjà comptée —
// lui donner ce préfixe doublerait le compte sans qu'une annonce de plus ne
// soit suivie.
ADS.icons.mark = (size = 12) => {
  const { svg } = ADS.node
  const box = svg('svg', { class: 'ads-picto', width: size, height: size, viewBox: '0 0 32 32', 'aria-hidden': 'true' })
  box.append(
    svg('rect', { width: 32, height: 32, rx: 9, fill: '#4F46E5' }),
    svg('circle', { cx: 16, cy: 16, r: 5.5, fill: 'none', stroke: 'white', 'stroke-width': 3 }),
  )
  return box
}

if (typeof module !== 'undefined') module.exports = ADS.icons
