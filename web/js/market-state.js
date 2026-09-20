// L'état des filtres : comment un changement s'applique, et comment les
// compteurs se redemandent sans faire sauter l'écran. Aucun DOM ici — c'est ce
// qui rend ces deux règles testables sans navigateur.

import { LISTS, RANGES, debounce, facetsQuery, integer } from './query.js'

export const PAUSE_MS = 300

// Changer de marque vide le modèle. Sans ça, « Peugeot 208 » puis marque
// « Renault » donnerait « Renault 208 » : zéro annonce, et le marchand
// chercherait longtemps pourquoi. Vider la marque le vide aussi.
//
// Sauf si le correctif pose les deux d'un coup — c'est ce que fait un
// raccourci de famille (« Renault Clio ») : la cascade lui reprendrait le
// modèle qu'il vient de poser.
export function applyPatch(filters, patch = {}) {
  const next = { ...filters, ...patch }
  if ('brand' in patch && patch.brand !== filters.brand && !('model' in patch)) next.model = ''
  for (const [key] of RANGES) if (key in patch) next[key] = integer(patch[key])
  for (const [key] of LISTS) {
    if (key in patch) next[key] = [...new Set((patch[key] || []).filter(Boolean))]
  }
  return next
}

// Cocher ou décocher une valeur d'une liste, sans jamais la poser deux fois.
export function toggleInList(filters, key, value) {
  const current = filters[key] || []
  return { [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] }
}

// Les compteurs se redemandent à chaque changement, mais deux règles tiennent
// l'écran immobile :
//
// 1. la même temporisation que la recherche — sinon trois frappes font trois
//    requêtes de facettes, plus lourdes que la page de résultats ;
// 2. les anciens compteurs restent affichés pendant l'attente, et une réponse
//    en retard ne remplace jamais une plus récente (`jeton`). Vider les listes
//    le temps de l'aller-retour ferait sauter les hauteurs sous le curseur,
//    et une réponse doublée par la suivante réécrirait des chiffres périmés.
export function createFacetRefresher({ fetchFacets, onFacets, onError, wait = PAUSE_MS, timers }) {
  let jeton = 0
  const demander = async (filters) => {
    const mien = (jeton += 1)
    let reponse
    try {
      reponse = await fetchFacets(facetsQuery(filters))
    } catch (err) {
      if (mien === jeton && onError) onError(err)
      return
    }
    if (mien === jeton) onFacets(reponse)
  }
  const retarde = debounce(demander, wait, timers)
  // `now` : le premier affichage et le bouton « Tout effacer » ne sont pas des
  // frappes, ils n'ont aucune pause à observer.
  return (filters, { now = false } = {}) => (now ? demander(filters) : retarde(filters))
}
