// Le mode démo : `?demo=1`. Les mêmes réponses que l'API, au même contrat, sans
// réseau ni licence. C'est aussi ce qui permet de dessiner l'écran pendant que
// les routes se livrent en parallèle.

import { DEMO_NOW, FOLLOW_ROWS, MARKET_ROWS, isoDaysBefore } from './fixtures-data.js'

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

const MARKET = MARKET_ROWS.map(baseItem)

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

function matches(item, params) {
  const brand = params.get('brand')
  const model = params.get('model')
  const sellerType = params.get('seller_type')
  const minAge = Number(params.get('min_age_days') || 0)
  if (brand && item.brand.toLowerCase() !== brand.toLowerCase()) return false
  if (model && !item.model.toLowerCase().includes(model.toLowerCase())) return false
  if (sellerType && item.seller_type !== sellerType) return false
  if (item.age_days < minAge) return false
  if (params.get('dropped') === 'true' && item.price_delta_since_first >= 0) return false
  return true
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
