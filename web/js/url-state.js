// L'URL porte les filtres. Deux raisons, aucune cosmétique : un écran filtré
// se partage tel quel (un lien, pas une suite de clics à redire), et le bouton
// retour du navigateur refait l'état précédent au lieu de quitter la page.
//
// Les filtres vivent dans le fragment, après la route (`#/marche?brand=…`), et
// non dans la query string : celle-ci porte déjà `?demo=1`, qui doit survivre
// à tout changement de filtre.

import {
  AGE_STEPS, DEFAULT_SORT, EMPTY_FILTERS, LISTS, RANGES, SORTS, TEXTS,
  filterParams, integer,
} from './query.js'

export function splitHash(hash = '') {
  const raw = String(hash).replace(/^#/, '')
  const cut = raw.indexOf('?')
  if (cut < 0) return { route: `#${raw}`, query: '' }
  return { route: `#${raw.slice(0, cut)}`, query: raw.slice(cut + 1) }
}

export function hashOf(route, filters = {}) {
  const params = filterParams(filters)
  if (filters.sort && filters.sort !== DEFAULT_SORT) params.set('sort', filters.sort)
  const query = String(params)
  return query ? `${route}?${query}` : route
}

// Lire l'URL, c'est lire ce qu'un inconnu a collé dans la barre d'adresse :
// une ancienneté hors des paliers proposés ou un tri inventé ne sont pas des
// filtres, ce sont des valeurs que l'écran ne sait pas montrer. Elles
// retombent sur la valeur par défaut plutôt que de partir vers l'API.
export function filtersFromQuery(query = '') {
  const params = new URLSearchParams(query)
  const filters = { ...EMPTY_FILTERS }
  for (const [key, name] of TEXTS) filters[key] = params.get(name) || ''
  for (const [key, name] of RANGES) filters[key] = integer(params.get(name))
  for (const [key, name] of LISTS) filters[key] = params.getAll(name).filter(Boolean)
  const age = Number(params.get('min_age_days'))
  filters.minAgeDays = AGE_STEPS.includes(age) ? age : 0
  filters.dropped = params.get('dropped') === 'true'
  const sort = params.get('sort')
  filters.sort = SORTS.includes(sort) ? sort : DEFAULT_SORT
  return filters
}

export function filtersFromHash(hash = '') {
  return filtersFromQuery(splitHash(hash).query)
}
