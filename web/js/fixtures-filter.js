// Le filtre du mode démo, tenu au même contrat que `/v1/market`. Il vit à
// part parce que les facettes s'en servent aussi, et d'une façon particulière :
// `skip` retire un filtre de la comparaison, pour compter une facette sans son
// propre filtre.

import { fold } from './query.js'
import { matchesQuery } from './fixtures-search.js'

const RANGES = [
  ['price_min', 'price_max', 'price', 'price'],
  ['year_min', 'year_max', 'year', 'year'],
  ['mileage_min', 'mileage_max', 'mileage', 'mileage'],
]

function inRange(value, params, [minName, maxName]) {
  const min = params.get(minName)
  const max = params.get(maxName)
  if (min !== null && (value == null || value < Number(min))) return false
  if (max !== null && (value == null || value > Number(max))) return false
  return true
}

// Une liste absente ne filtre rien ; une liste présente exige une valeur
// connue — une annonce dont le champ n'est pas encore relevé ne « passe »
// jamais un filtre carburant, elle n'est simplement pas décidée.
function inList(value, params, name) {
  const wanted = params.getAll(name)
  return !wanted.length || (value != null && wanted.includes(value))
}

// `skip` : une facette, ou plusieurs — la liste des marques se compte sans le
// filtre de marque *et* sans celui de modèle. Marque et modèle sont un seul
// choix en deux temps : garder le modèle en comptant les marques ne laisserait
// qu'une marque dans la liste (« Clio » n'existe que chez Renault), et on ne
// pourrait plus en changer sans tout défaire d'abord.
export function matches(item, params, skip = '') {
  const off = new Set([].concat(skip))
  const brand = params.get('brand')
  const model = params.get('model')
  const q = params.get('q')
  const sellerType = params.get('seller_type')
  const minAge = Number(params.get('min_age_days') || 0)
  // Comparaison repliée : le contrat accepte la clé canonique comme
  // l'écriture affichée (« citroen » vaut « Citroën »).
  if (!off.has('brand') && brand && fold(item.brand) !== fold(brand)) return false
  if (!off.has('model') && model && fold(item.model) !== fold(model)) return false
  if (q && !matchesQuery(item, q)) return false
  if (!off.has('seller_type') && sellerType && item.seller_type !== sellerType) return false
  if (item.age_days < minAge) return false
  if (params.get('dropped') === 'true' && item.price_delta_since_first >= 0) return false
  for (const [minName, maxName, field, id] of RANGES) {
    if (!off.has(id) && !inRange(item[field], params, [minName, maxName])) return false
  }
  if (!off.has('fuel') && !inList(item.fuel, params, 'fuel')) return false
  if (!off.has('gearbox') && !inList(item.gearbox, params, 'gearbox')) return false
  if (!off.has('region') && !inList(item.region, params, 'region')) return false
  if (!off.has('department') && !inList(item.department, params, 'department')) return false
  return true
}
