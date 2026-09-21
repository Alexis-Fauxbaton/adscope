// Ce que « Mes recherches » a à dire, en phrases — sans DOM, pour que la
// composition des mots se teste sans navigateur. `alerts-searches.js`
// assemble ces phrases dans les cartes, il ne les invente pas deux fois
// (même écriture ici que dans le message de confirmation de
// `save-search.js`, juste après l'enregistrement).

import { number } from './format.js'

export const NEW_SENTENCE = "Une annonce apparaît dans cette recherche. leboncoin et La Centrale "
  + 'préviennent déjà en temps réel : nous arrivons après eux.'
export const PAUSE_HINT = "Plus d'alerte, la recherche est gardée."
export const RESUME_HINT = 'Relance les alertes de cette recherche.'

// Les deux seuils de la règle de baisse, en choix tout faits — jamais un
// champ numérique : celui qui vient de l'email pour « être prévenu plus tôt »
// choisit dans une liste, il ne devine pas une valeur à taper.
export const AGE_CHOICES = [[15, '15 jours'], [30, '30 jours'], [60, '60 jours']]
export const DROP_CHOICES = [
  [1, 'même de peu'], [3, 'de 3 % ou plus'], [5, 'de 5 % ou plus'],
]

// Une valeur déjà enregistrée mais absente des choix proposés (réglage plus
// ancien) reste visible et sélectionnée — jamais remplacée en silence par un
// des trois choix du jour.
export function withCurrent(choices, value) {
  return choices.some(([v]) => v === value) ? choices : [[value, String(value)], ...choices]
}

// La phrase de la règle de baisse, aux valeurs propres à la recherche.
export function dropsSentence(search) {
  return `Une annonce en ligne depuis plus de ${search.min_age_days} jours `
    + `baisse d'au moins ${search.min_drop_pct} %.`
}

export function countLabel(total) {
  if (total == null) return 'Marché : compte en cours…'
  return `${number(total)} annonce${total > 1 ? 's' : ''} aujourd'hui`
}

// `PUT` est complet : on repart de la recherche affichée et on applique un
// seul correctif — le contrat n'a pas de `PATCH` (§3 du plan).
export function payloadFor(search, patch) {
  const { id, created_at, ...base } = search
  return { ...base, ...patch }
}
