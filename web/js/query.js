// La requête du marché, construite à partir de l'état des filtres.
//
// Ce qui n'est pas demandé ne s'écrit pas : `GET /v1/market` a des valeurs par
// défaut et une requête qui les répète ment sur ce que le marchand a choisi —
// et fait deux URL différentes pour un même écran, donc deux entrées de cache.

export const DEFAULT_SORT = 'age_desc'
export const SORTS = ['age_desc', 'drop_desc', 'recent']
export const MAX_LIMIT = 100
export const PAGE_SIZE = 20

export const EMPTY_FILTERS = {
  brand: '',
  model: '',
  sellerType: '',
  minAgeDays: 0,
  dropped: false,
  sort: DEFAULT_SORT,
}

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function marketQuery(filters = {}, { limit = PAGE_SIZE, offset = 0 } = {}) {
  const params = new URLSearchParams()
  const brand = trimmed(filters.brand)
  const model = trimmed(filters.model)
  if (brand) params.set('brand', brand)
  if (model) params.set('model', model)
  if (filters.sellerType) params.set('seller_type', filters.sellerType)
  if (filters.minAgeDays > 0) params.set('min_age_days', String(filters.minAgeDays))
  if (filters.dropped) params.set('dropped', 'true')
  if (filters.sort && filters.sort !== DEFAULT_SORT) params.set('sort', filters.sort)
  // La borne du contrat est dure : au-delà de 100 l'API refuse, et une page
  // de résultats vide vaudrait « rien à voir » alors que tout est là.
  params.set('limit', String(Math.min(Math.max(1, limit), MAX_LIMIT)))
  if (offset > 0) params.set('offset', String(offset))
  return params
}

// Le champ « famille » est une liste et une saisie libre à la fois : le
// marchand choisit une Clio dans son périmètre, ou tape « 208 » parce que
// l'annonce qu'il a en tête n'y est pas encore.
export function parseFamily(text) {
  const words = trimmed(text).split(/\s+/).filter(Boolean)
  if (!words.length) return { brand: '', model: '' }
  return { brand: words[0], model: words.slice(1).join(' ') }
}

export function familyLabel(family) {
  return [family.brand, family.model].filter(Boolean).join(' ')
}
