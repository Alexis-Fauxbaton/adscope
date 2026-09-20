// Les facettes du mode démo, au contrat de `/v1/market/facets`. La règle qui
// compte : **chaque facette se compte sans son propre filtre**. Choisir
// « diesel » ne doit pas vider la liste des carburants — sinon on ne pourrait
// plus passer à « essence » sans tout défaire d'abord.

import { fold } from './query.js'
import { matches } from './fixtures-filter.js'

// Les huit départements que portent les fixtures, et leur région. Côté API
// c'est `region.py` qui range les 101 ; ici seule la démo est à servir.
export const DEMO_REGIONS = {
  '13': ['paca', "Provence-Alpes-Côte d'Azur"],
  33: ['nouvelle-aquitaine', 'Nouvelle-Aquitaine'],
  34: ['occitanie', 'Occitanie'],
  44: ['pays-de-la-loire', 'Pays de la Loire'],
  67: ['grand-est', 'Grand Est'],
  69: ['auvergne-rhone-alpes', 'Auvergne-Rhône-Alpes'],
  75: ['ile-de-france', 'Île-de-France'],
  92: ['ile-de-france', 'Île-de-France'],
}

const FUEL_LABELS = {
  essence: 'Essence', diesel: 'Diesel', hybride: 'Hybride',
  hybride_rechargeable: 'Hybride rechargeable', electrique: 'Électrique',
  gpl: 'GPL', gnv: 'GNV', hydrogene: 'Hydrogène', autre: 'Autre',
}
const GEARBOX_LABELS = { manuelle: 'Manuelle', automatique: 'Automatique', autre: 'Autre' }

// Le nom administratif des huit départements que portent les fixtures — le
// contrat sert désormais `departments: [{key, label, count}]`, et l'écran
// affiche « 92 · Hauts-de-Seine » plutôt que le seul code.
const DEPARTMENT_LABELS = {
  13: 'Bouches-du-Rhône',
  33: 'Gironde',
  34: 'Hérault',
  44: 'Loire-Atlantique',
  67: 'Bas-Rhin',
  69: 'Rhône',
  75: 'Paris',
  92: 'Hauts-de-Seine',
}

// Compte décroissant, puis libellé : deux marques à égalité ne doivent pas
// changer de place d'une requête à l'autre.
function tally(items, keyOf, labelOf) {
  const counts = new Map()
  for (const item of items) {
    const key = keyOf(item)
    if (key == null) continue
    const row = counts.get(key) || { key, label: labelOf(item, key), count: 0 }
    row.count += 1
    counts.set(key, row)
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

function unknowns(items, field) {
  return items.filter((item) => item[field] == null).length
}

// Une fourchette suggérée ne tient pas compte de la fourchette déjà posée :
// elle sert justement à l'élargir. Elle ne dit rien quand rien n'a de valeur.
function span(items, field) {
  const values = items.map((i) => i[field]).filter((v) => v != null)
  if (!values.length) return {}
  return { min: Math.min(...values), max: Math.max(...values) }
}

// « Modèle non précisé » ferme la liste : c'est un fourre-tout, pas un modèle,
// et le voir en tête (il est souvent nombreux) donnerait l'impression que la
// marque n'a rien d'autre à offrir.
function models(items, brand) {
  if (!brand) return []
  const rows = tally(
    items,
    (i) => fold(i.model) || null,
    (i, key) => (key === 'autres' ? 'Modèle non précisé' : i.model),
  )
  const autres = rows.filter((r) => r.key === 'autres')
  return [...rows.filter((r) => r.key !== 'autres'), ...autres]
}

export function facetsOf(items, params) {
  const sans = (skip) => items.filter((item) => matches(item, params, skip))
  const base = sans('')
  const place = sans('department')
  return {
    total: base.length,
    // Sans le filtre de marque *ni* celui de modèle : voir `matches`.
    brands: tally(sans(['brand', 'model']), (i) => fold(i.brand), (i) => i.brand),
    models: models(sans('model'), params.get('brand')),
    fuel: tally(sans('fuel'), (i) => i.fuel, (i) => FUEL_LABELS[i.fuel] || i.fuel),
    fuel_unknown: unknowns(sans('fuel'), 'fuel'),
    gearbox: tally(sans('gearbox'), (i) => i.gearbox, (i) => GEARBOX_LABELS[i.gearbox] || i.gearbox),
    gearbox_unknown: unknowns(sans('gearbox'), 'gearbox'),
    // Sans région *ni* département, comme `brands` sans marque ni modèle :
    // choisir un département ne doit pas enfermer la liste des régions dans
    // la sienne, sans quoi on ne pourrait plus en changer sans tout défaire.
    regions: tally(sans(['region', 'department']), (i) => i.region, (i) => i.region_label),
    departments: tally(place, (i) => i.department, (i) => i.department)
      .map(({ key, count }) => ({ key, count, label: DEPARTMENT_LABELS[key] || null })),
    location_unknown: unknowns(place, 'department'),
    seller_type: tally(sans('seller_type'), (i) => i.seller_type, (i) => i.seller_type),
    ranges: {
      price: span(sans('price'), 'price'),
      year: span(sans('year'), 'year'),
      mileage: span(sans('mileage'), 'mileage'),
    },
  }
}
