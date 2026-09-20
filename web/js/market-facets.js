// Ce qu'on sait faire des compteurs de `/v1/market/facets`, sans DOM : lire
// une option, dire la couverture d'un champ encore partiel, et compter ce que
// le marchand a posé.

import { LISTS, badRange, fold } from './query.js'

// Les trois fourchettes, chacune vue comme *un* filtre : le marchand pose
// « de 5 000 à 12 000 € », pas deux bornes indépendantes — d'où une seule
// pastille et un seul point au compteur du mobile.
// `grouped` : une année ne prend pas de séparateur de milliers — « 2 018 » se
// lirait comme un prix.
export const RANGE_GROUPS = [
  { id: 'price', min: 'priceMin', max: 'priceMax', label: 'Prix', unit: '€', grouped: true },
  { id: 'year', min: 'yearMin', max: 'yearMax', label: 'Année', unit: '', grouped: false },
  { id: 'mileage', min: 'mileageMin', max: 'mileageMax', label: 'Kilométrage', unit: 'km', grouped: true },
]

// La forme rendue par le contrat, à zéro. L'écran se dessine avant la première
// réponse : sans ce gabarit il faudrait tester l'existence de chaque liste à
// chaque lecture, et un compteur manquant deviendrait un écran cassé.
export const EMPTY_FACETS = {
  total: 0,
  brands: [], models: [],
  fuel: [], fuel_unknown: 0,
  gearbox: [], gearbox_unknown: 0,
  regions: [], departments: [], location_unknown: 0,
  seller_type: [],
  ranges: { price: {}, year: {}, mileage: {} },
}

// La clé canonique ou l'écriture affichée : le contrat accepte les deux, donc
// un lien partagé peut porter « Citroën » là où la liste porte « citroen ».
// L'écran doit retrouver l'option dans les deux cas, sinon il afficherait
// « Toutes les marques » alors qu'une marque est bien filtrée.
export function optionFor(options = [], value) {
  if (!value) return null
  const wanted = fold(value)
  return options.find((o) => o.key === value)
    || options.find((o) => fold(o.key) === wanted || fold(o.label) === wanted)
    || null
}

// `departments` est la seule facette rendue sans `label` : sa clé *est* le
// libellé. D'où le repli sur la valeur plutôt que sur un `undefined` affiché.
export function labelFor(options, value, fallback = '') {
  const option = optionFor(options, value)
  return (option && option.label) || value || fallback
}

// Part des annonces où le champ est renseigné, en pourcentage entier. `null`
// quand il n'y a rien à mesurer (aucune annonce) — un « 0 % » sur zéro
// annonce serait une affirmation, pas une mesure.
export function coverage(total, unknown) {
  if (!total || total <= 0) return null
  return Math.round(((total - (unknown || 0)) / total) * 100)
}

// Le sujet *et* son participe : « Boîte connu » se voit à l'écran.
const FIELDS = { fuel: 'Carburant connu', gearbox: 'Boîte connue', location: 'Lieu connu' }

// `seller_type` est la seule facette que le contrat rend sans `label` : les
// deux mots sont à nous, pas à l'API. Posés ici, lus par le panneau comme par
// les pastilles, pour qu'un vendeur ne se dise pas de deux façons.
export const SELLER_LABELS = { pro: 'Professionnels', private: 'Particuliers' }

// La phrase d'honnêteté. Carburant, boîte et lieu ne sont remplis que sur les
// annonces revues depuis le 2026-09-19 : filtrer dessus ne voit pas tout le
// marché, et l'écran doit le dire là où le filtre se pose — pas en note de bas
// de page. Rien à dire quand le champ est complet.
//
// Le dénominateur se lit dans la facette elle-même (somme des compteurs plus
// les inconnues), jamais dans `facets.total` : une facette se compte sans son
// propre filtre, donc sur un autre ensemble que le total affiché. Mélanger les
// deux donnerait « connu sur 320 % ».
export function coverageLine(field, options = [], unknown = 0) {
  if (!unknown) return ''
  const known = (options || []).reduce((n, o) => n + (o.count || 0), 0)
  const part = coverage(known + unknown, unknown)
  if (part == null) return ''
  return `${FIELDS[field] || field} sur ${part} % des annonces`
    + ' — le reste se complète au fil des passages.'
}

// Les modèles n'existent qu'une fois la marque choisie : c'est le contrat de
// `/v1/market/facets`, et c'est aussi ce que la cascade impose à l'écran.
export function modelsFor(facets, filters) {
  return filters.brand ? (facets.models || []) : []
}

// Une fourchette à l'envers vaut 422 côté API. L'écran la signale sur place et
// **n'interroge pas** : une erreur réseau afficherait « L'API n'a pas répondu »
// là où c'est la saisie qui est à corriger, et le marchand chercherait la panne
// du mauvais côté.
export function anyBadRange(filters = {}) {
  return RANGE_GROUPS.some((g) => badRange(filters[g.min], filters[g.max]))
}

// Ce que « Plus de filtres » contient : les trois fourchettes, les deux champs
// partiels, le lieu, le vendeur. Compté à part parce qu'un lien partagé qui
// porte l'un d'eux doit arriver panneau ouvert — sinon le destinataire lit une
// liste réduite par un filtre qu'il ne voit nulle part.
export function panelCount(filters = {}) {
  let n = filters.sellerType ? 1 : 0
  for (const g of RANGE_GROUPS) {
    const posee = (k) => filters[k] != null && filters[k] !== ''
    if (posee(g.min) || posee(g.max)) n += 1
  }
  for (const [key] of LISTS) n += (filters[key] || []).length
  return n
}

// Combien de filtres le marchand a posés — le « Filtres (n) » du mobile, et
// rien d'autre : le tri n'est pas un filtre, il ne réduit rien.
export function activeCount(filters = {}) {
  let n = panelCount(filters)
  for (const key of ['q', 'brand', 'model']) if (filters[key]) n += 1
  if (filters.minAgeDays > 0) n += 1
  if (filters.dropped) n += 1
  return n
}
