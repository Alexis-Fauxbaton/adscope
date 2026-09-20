// La requête du marché, construite à partir de l'état des filtres.
//
// Ce qui n'est pas demandé ne s'écrit pas : `GET /v1/market` a des valeurs par
// défaut et une requête qui les répète ment sur ce que le marchand a choisi —
// et fait deux URL différentes pour un même écran, donc deux entrées de cache.

export const DEFAULT_SORT = 'age_desc'
export const SORTS = ['age_desc', 'drop_desc', 'recent']
export const MAX_LIMIT = 100
export const PAGE_SIZE = 20
export const AGE_STEPS = [30, 60, 90]

// Clé d'état → nom du paramètre. Trois familles, trois écritures : une chaîne
// rognée, un entier, une liste qui se répète (`fuel=essence&fuel=diesel`,
// comme `/v1/market` l'attend).
export const TEXTS = [
  ['q', 'q'], ['brand', 'brand'], ['model', 'model'], ['sellerType', 'seller_type'],
]
export const RANGES = [
  ['priceMin', 'price_min'], ['priceMax', 'price_max'],
  ['yearMin', 'year_min'], ['yearMax', 'year_max'],
  ['mileageMin', 'mileage_min'], ['mileageMax', 'mileage_max'],
]
export const LISTS = [
  ['fuel', 'fuel'], ['gearbox', 'gearbox'], ['region', 'region'], ['department', 'department'],
]

export const EMPTY_FILTERS = {
  q: '',
  brand: '',
  model: '',
  sellerType: '',
  minAgeDays: 0,
  dropped: false,
  priceMin: null, priceMax: null,
  yearMin: null, yearMax: null,
  mileageMin: null, mileageMax: null,
  fuel: [], gearbox: [], region: [], department: [],
  sort: DEFAULT_SORT,
}

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : ''
}

// Une borne, ou rien. Un champ vidé, un `null` ou une frappe en cours
// (« 12 0 », « douze ») ne sont pas des bornes : les envoyer ferait un 422 sur
// une saisie que le marchand n'a pas fini d'écrire.
export function integer(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

// Tout ce que le marchand a choisi, sans le tri ni la pagination : c'est
// exactement ce que `/v1/market/facets` accepte, et ce que l'URL porte.
export function filterParams(filters = {}) {
  const params = new URLSearchParams()
  for (const [key, name] of TEXTS) {
    const value = trimmed(filters[key])
    if (value) params.set(name, value)
  }
  if (filters.minAgeDays > 0) params.set('min_age_days', String(filters.minAgeDays))
  if (filters.dropped) params.set('dropped', 'true')
  for (const [key, name] of RANGES) {
    const n = integer(filters[key])
    if (n != null) params.set(name, String(n))
  }
  for (const [key, name] of LISTS) {
    for (const value of filters[key] || []) if (value) params.append(name, value)
  }
  return params
}

// Les compteurs se demandent sur les mêmes filtres que les résultats — sinon
// ils compteraient un autre marché que celui affiché.
export function facetsQuery(filters = {}) {
  return filterParams(filters)
}

export function marketQuery(filters = {}, { limit = PAGE_SIZE, offset = 0 } = {}) {
  const params = filterParams(filters)
  if (filters.sort && filters.sort !== DEFAULT_SORT) params.set('sort', filters.sort)
  // La borne du contrat est dure : au-delà de 100 l'API refuse, et une page
  // de résultats vide vaudrait « rien à voir » alors que tout est là.
  params.set('limit', String(Math.min(Math.max(1, limit), MAX_LIMIT)))
  if (offset > 0) params.set('offset', String(offset))
  return params
}

// Une fourchette à l'envers (min > max) est un 422 côté API. Le site ne
// l'envoie jamais : il la signale sur place, le marchand corrige.
export function badRange(min, max) {
  const a = integer(min)
  const b = integer(max)
  return a != null && b != null && a > b
}

export function familyLabel(family) {
  return [family.brand, family.model].filter(Boolean).join(' ')
}

const DIACRITICS = /[̀-ͯ]/g

export function fold(text) {
  return trimmed(text).toLowerCase().normalize('NFD').replace(DIACRITICS, '')
}

// Les globaux du navigateur : appelés tels quels et non comme méthodes d'un
// objet, sinon `setTimeout` détaché de `window` lève « Illegal invocation »
// dans un vrai navigateur (Node, lui, ne le remarque pas — c'est ce qui rend
// ce genre de bug invisible aux tests si la minuterie par défaut n'imite pas
// ce piège).
const REAL_TIMERS = { setTimeout: (...a) => setTimeout(...a), clearTimeout: (...a) => clearTimeout(...a) }

// Une frappe déclenche une recherche après une courte pause, jamais à chaque
// caractère — ça noierait l'API d'une requête par lettre. La minuterie est
// injectable : le test du mécanisme n'attend jamais un vrai délai.
export function debounce(fn, wait, timers = REAL_TIMERS) {
  let handle = null
  return (...args) => {
    if (handle != null) timers.clearTimeout(handle)
    handle = timers.setTimeout(() => { handle = null; fn(...args) }, wait)
  }
}
