// Le mode démo : `?demo=1`. Les mêmes réponses que l'API, au même contrat, sans
// réseau ni licence. C'est aussi ce qui permet de dessiner l'écran pendant que
// les routes se livrent en parallèle.

import { DEMO_NOW, FOLLOW_ROWS, isoDaysBefore } from './fixtures-data.js'
import { DEMO_REGIONS, facetsOf } from './fixtures-facets.js'
import { matches } from './fixtures-filter.js'
import { MARKET_ROWS } from './fixtures-rows.js'
import { demoLabel } from './fixtures-search.js'

export const THRESHOLDS = [30, 60, 90]

function siteId(index) {
  return `C${String(6100000 + index * 7331)}`
}

function baseItem(row, index) {
  const [brand, model, version, year, mileage, price, sellerType, sellerName,
    ageDays, delta] = row
  return {
    site: 'lc',
    site_id: siteId(index),
    url: `https://www.lacentrale.fr/auto-occasion-annonce-${siteId(index)}.html`,
    brand, model, version, year, mileage, price,
    label: demoLabel(brand, model, version),
    seller_type: sellerType,
    seller_name: sellerName,
    published_at: isoDaysBefore(ageDays),
    age_days: ageDays,
    price_delta_since_first: delta,
    last_change_at: delta ? isoDaysBefore(Math.round(ageDays / 3)) : null,
    followed: false,
    disappeared_at: null,
  }
}

// Carburant, boîte et lieu ne vivent que sur les lignes du marché : les
// colonnes 10 à 12 de `MARKET_ROWS`. `FOLLOW_ROWS` y range autre chose (le
// suivi), d'où deux lectures et non une seule.
function marketItem(row, index) {
  const item = baseItem(row, index)
  const [fuel, gearbox, department] = row.slice(10)
  const [region, regionLabel] = DEMO_REGIONS[department] || []
  return {
    ...item,
    fuel: fuel || null,
    gearbox: gearbox || null,
    department: department || null,
    region: region || null,
    region_label: regionLabel || null,
  }
}

const MARKET = MARKET_ROWS.map(marketItem)

// Le plus haut seuil d'ancienneté franchi *pendant* la fenêtre : au début de la
// fenêtre l'annonce ne l'avait pas encore atteint, à la fin elle l'a dépassé.
export function crossedIn(ageDays, sinceDays) {
  const start = ageDays - sinceDays
  const crossed = THRESHOLDS.filter((t) => t > start && t <= ageDays)
  return crossed.length ? crossed[crossed.length - 1] : null
}

function feedItem(row, index, sinceDays) {
  const item = baseItem(row, index)
  item.followed = true
  const [, , , , , , , , ageDays, , followedDaysAgo, changes, goneDaysAgo] = row
  const inWindow = changes
    .filter(([daysAgo]) => daysAgo <= sinceDays)
    .map(([daysAgo, from, to]) => ({ at: isoDaysBefore(daysAgo), from, to }))
  const gone = goneDaysAgo != null && goneDaysAgo <= sinceDays
  if (goneDaysAgo != null) item.disappeared_at = isoDaysBefore(goneDaysAgo)
  return {
    ...item,
    followed_at: isoDaysBefore(followedDaysAgo),
    changes: inWindow,
    flags: {
      dropped: item.price_delta_since_first < 0,
      crossed: crossedIn(ageDays, sinceDays),
      disappeared: gone,
    },
  }
}

// Triés : ce qui a bougé d'abord. Une disparition passe devant une baisse, une
// baisse devant un seuil franchi, et le reste suit dans l'ordre de suivi.
function movedRank(entry) {
  if (entry.flags.disappeared) return 0
  if (entry.changes.length) return 1
  if (entry.flags.crossed) return 2
  return 3
}

export function feed({ since_days: sinceDays = 7 } = {}) {
  const items = FOLLOW_ROWS.map((row, i) => feedItem(row, i, sinceDays))
  items.sort((a, b) => movedRank(a) - movedRank(b)
    || Math.abs(b.price_delta_since_first) - Math.abs(a.price_delta_since_first))
  return { items }
}

const ORDERS = {
  age_desc: (a, b) => b.age_days - a.age_days,
  drop_desc: (a, b) => a.price_delta_since_first - b.price_delta_since_first,
  recent: (a, b) => a.age_days - b.age_days,
}

export function market(params) {
  const kept = MARKET.filter((item) => matches(item, params))
  kept.sort(ORDERS[params.get('sort') || 'age_desc'])
  const offset = Number(params.get('offset') || 0)
  const limit = Number(params.get('limit') || 50)
  return { total: kept.length, items: kept.slice(offset, offset + limit) }
}

export function facets(params) {
  return facetsOf(MARKET, params)
}

export function me() {
  return { email: 'demo@adscope.fr', label: 'Garage démo' }
}

// Une file factice, pour dessiner et capturer `/app/revisites.html` sans
// jamais consommer de vraies fiches. Les mêmes trois champs que l'API rend,
// rien de plus — surtout pas de clé.
const REVISIT_IDS = ['2963188104', '2963177230', '2963165592', '2963154881', '2963142016']

export function revisits({ limit = 40 } = {}) {
  return REVISIT_IDS.slice(0, Math.max(0, Math.min(limit, REVISIT_IDS.length))).map((id) => ({
    site: 'lbc',
    site_id: id,
    url: `https://www.leboncoin.fr/ad/voitures/${id}`,
  }))
}

export function families() {
  return [
    { brand: 'Peugeot', model: '208' },
    { brand: 'Peugeot', model: '2008' },
    { brand: 'Renault', model: 'Clio' },
    { brand: 'Renault', model: 'Captur' },
    { brand: 'Citroën', model: 'C3' },
    { brand: 'Volkswagen', model: 'Polo' },
    { brand: 'Dacia', model: 'Sandero' },
    { brand: 'Toyota', model: 'Yaris' },
  ]
}

export { DEMO_NOW }
