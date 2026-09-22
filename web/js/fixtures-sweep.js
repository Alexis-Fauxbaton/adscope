// Le mode démo de `/app/balayage.html` : la même forme que `GET /v1/sweep`,
// sans réseau — de quoi capturer l'écran et dérouler le runbook pendant que
// la route se livre.

const ITEMS = [
  {
    url: 'https://www.leboncoin.fr/recherche?category=2&price=0-max&sort=price&order=asc&page=1&u_car_brand=DACIA&u_car_model=DACIA_Duster',
    pages: 3, expected_total: 96, coverage_24h: 0.12, unmapped: [],
  },
  {
    url: 'https://www.leboncoin.fr/recherche?category=2&price=0-max&owner_type=pro&sort=price&order=asc&page=1&u_car_brand=PEUGEOT&u_car_model=PEUGEOT_208',
    pages: 14, expected_total: 483, coverage_24h: 0.41, unmapped: [],
  },
  {
    url: 'https://www.leboncoin.fr/recherche?category=2&price=0-max&sort=price&order=asc&page=1&u_car_brand=RENAULT&u_car_model=RENAULT_Clio&fuel=2',
    pages: 20, expected_total: 1290, coverage_24h: 0.68, unmapped: [],
  },
]

// Le même découpage par budget que `sweep._budget` côté API : la première
// entrée qui ne tient pas arrête la file, jamais un saut à la suivante.
export function sweep(pages = 120) {
  const kept = []
  let used = 0
  for (const item of ITEMS) {
    if (used + item.pages > pages) break
    kept.push(item)
    used += item.pages
  }
  return { pages: used, items: kept, skipped: [{ reason: 'trop_large' }] }
}
