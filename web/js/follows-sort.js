// Les trois tris de Mes suivis, purs et côté client : le feed tient dans une
// poignée d'items déjà chargés, aucun besoin de redemander l'API pour changer
// d'ordre. Égalités closes par `(site, site_id)` — un ordre stable entre deux
// affichages, jamais deux tris qui se contredisent sur les mêmes données.

export const SORTS = [
  ['drop', 'Baisse cumulée'],
  ['age', 'Ancienneté'],
  ['recent', 'Récence'],
]
export const DEFAULT_SORT = 'drop'

function tie(a, b) {
  return String(a.site).localeCompare(String(b.site)) || String(a.site_id).localeCompare(String(b.site_id))
}

const COMPARATORS = {
  // La plus forte baisse d'abord : `price_delta_since_first` est négatif,
  // l'ordre croissant place donc −1 200 avant −300.
  drop: (a, b) => (a.price_delta_since_first || 0) - (b.price_delta_since_first || 0) || tie(a, b),
  age: (a, b) => (b.age_days || 0) - (a.age_days || 0) || tie(a, b),
  recent: (a, b) => new Date(b.last_change_at || 0) - new Date(a.last_change_at || 0) || tie(a, b),
}

export function sortFeed(items, sort = DEFAULT_SORT) {
  return [...items].sort(COMPARATORS[sort] || COMPARATORS[DEFAULT_SORT])
}
