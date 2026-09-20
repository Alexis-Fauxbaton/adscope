// Les filtres actifs, dits en toutes lettres et retirables un par un.
//
// Un filtre replié dans un panneau fermé est un filtre qu'on oublie : le
// marchand voit « 312 annonces » sans se souvenir qu'il a coché « diesel » il
// y a dix minutes. Chaque pastille porte donc son libellé complet et le
// correctif exact qui l'enlève — jamais « effacer le dernier ».

import { EMPTY_FILTERS, LISTS } from './query.js'
import { RANGE_GROUPS, SELLER_LABELS, departmentLabel, labelFor, optionFor } from './market-facets.js'
import { number } from './format.js'

// Espace insécable avant l'unité, comme `format.money` — le séparateur de
// milliers, lui, est posé par `number` et n'est pas le même caractère.
const NBSP = ' '

// L'unité se pose une fois, à la fin : « 5 000 € – 12 000 € » la répète pour
// rien. Elle est portée par le groupe, tout comme le séparateur de milliers —
// une année ne s'écrit pas « 2 018 ».
function borne(value, group, avecUnite = true) {
  const texte = group.grouped ? number(value) : String(value)
  return avecUnite && group.unit ? `${texte}${NBSP}${group.unit}` : texte
}

// Trois phrases, parce qu'une fourchette à demi posée est le cas courant
// (« sous 10 000 € ») et que « Prix 0 – 10 000 € » inventerait une borne
// basse que personne n'a demandée.
function rangeChip(group, filters) {
  const min = filters[group.min]
  const max = filters[group.max]
  const posee = (v) => v != null && v !== ''
  if (!posee(min) && !posee(max)) return null
  let texte
  if (posee(min) && posee(max)) texte = `${borne(min, group, false)} – ${borne(max, group)}`
  else if (posee(min)) texte = `≥ ${borne(min, group)}`
  else texte = `≤ ${borne(max, group)}`
  return {
    id: group.id,
    label: `${group.label} ${texte}`,
    patch: { [group.min]: null, [group.max]: null },
  }
}

// Les listes (carburant, boîte, région, département) font une pastille par
// valeur : retirer « diesel » ne doit pas emporter « essence » choisi à côté.
function listChips(filters, facets) {
  const chips = []
  const sources = {
    fuel: facets.fuel, gearbox: facets.gearbox,
    region: facets.regions, department: facets.departments,
  }
  for (const [key] of LISTS) {
    for (const value of filters[key] || []) {
      // Le département porte son code *et* son nom (« 92 · Hauts-de-Seine ») :
      // `labelFor` seul rendrait le nom sans le code, ambigu à côté d'une année.
      const brut = key === 'department'
        ? departmentLabel(optionFor(sources.department || [], value), value)
        : labelFor(sources[key] || [], value, value)
      chips.push({
        id: `${key}:${value}`,
        label: key === 'department' ? `Département ${brut}` : brut,
        patch: { [key]: (filters[key] || []).filter((v) => v !== value) },
      })
    }
  }
  return chips
}

export function activeChips(filters = {}, facets = {}) {
  const chips = []
  if (filters.q) chips.push({ id: 'q', label: `« ${filters.q} »`, patch: { q: '' } })
  if (filters.brand) {
    chips.push({
      id: 'brand',
      label: labelFor(facets.brands || [], filters.brand, filters.brand),
      // Retirer la marque emporte le modèle : un modèle sans sa marque n'a
      // plus de sens, et l'API le rendrait sur toutes les marques à la fois.
      patch: { brand: '', model: '' },
    })
  }
  if (filters.model) {
    chips.push({
      id: 'model',
      label: labelFor(facets.models || [], filters.model, filters.model),
      patch: { model: '' },
    })
  }
  if (filters.minAgeDays > 0) {
    chips.push({
      id: 'age', label: `≥ ${filters.minAgeDays} jours`, patch: { minAgeDays: 0 },
    })
  }
  if (filters.dropped) chips.push({ id: 'dropped', label: 'Avec baisse', patch: { dropped: false } })
  for (const group of RANGE_GROUPS) {
    const chip = rangeChip(group, filters)
    if (chip) chips.push(chip)
  }
  chips.push(...listChips(filters, facets))
  if (filters.sellerType) {
    chips.push({
      id: 'sellerType',
      label: SELLER_LABELS[filters.sellerType] || filters.sellerType,
      patch: { sellerType: '' },
    })
  }
  return chips
}

// « Tout effacer » efface les filtres, pas le tri : l'ordre de lecture est une
// préférence, pas une restriction — la remettre à zéro ferait sauter la liste
// sous les yeux du marchand sans qu'il ait rien demandé là-dessus.
export function clearPatch(filters = {}) {
  return { ...EMPTY_FILTERS, sort: filters.sort || EMPTY_FILTERS.sort }
}
