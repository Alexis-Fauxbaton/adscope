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
  q: '',
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
  const q = trimmed(filters.q)
  const brand = trimmed(filters.brand)
  const model = trimmed(filters.model)
  if (q) params.set('q', q)
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

export function familyLabel(family) {
  return [family.brand, family.model].filter(Boolean).join(' ')
}

const DIACRITICS = /[\u0300-\u036f]/g

function foldedForMatch(text) {
  return trimmed(text).toLowerCase().normalize('NFD').replace(DIACRITICS, '')
}

// Le champ « famille » est une liste et une saisie libre à la fois : le
// marchand choisit une Clio dans son périmètre — marque et modèle exacts,
// aucune recherche texte à côté — ou tape ce qu'il a en tête, qui part tel
// quel dans `q` : découper la saisie en mots (l'ancien `parseFamily`) faisait
// de « land rover » une marque « land » et un modèle « rover » qui ne
// rendait jamais rien. Saisie et famille ne se cumulent jamais : l'une
// efface toujours l'autre.
export function familyInputPatch(text, families) {
  const folded = foldedForMatch(text)
  const match = families.find((f) => foldedForMatch(familyLabel(f)) === folded)
  if (match) return { brand: match.brand, model: match.model, q: '' }
  return { brand: '', model: '', q: trimmed(text) }
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
