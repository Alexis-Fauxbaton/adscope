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
  list: [
    'M9.2 4.6H7.6A1.6 1.6 0 0 0 6 6.2v13.2a1.6 1.6 0 0 0 1.6 1.6h8.8a1.6 1.6 0 0 0 1.6-1.6V6.2a1.6 1.6 0 0 0-1.6-1.6h-1.6',
    { shape: 'rect', x: 9.2, y: 3, width: 5.6, height: 3.2, rx: 1.2 },
    'M9.4 13.4l2 2 3.5-3.9',
  ],
  chevron: ['M9 5l7 7-7 7'],
}

if (typeof module !== 'undefined') module.exports = ADS.icons
