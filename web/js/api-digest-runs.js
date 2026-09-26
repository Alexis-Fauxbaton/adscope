// La mesure du planificateur (`.superpowers/planificateur.md`) : même porte
// que le reste du site (`request`, exporté d'`api.js`) — pas de second
// chemin réseau. Fichier à part comme `api-ecarts.js` : `fixtures.js` est au
// plafond.

import { isDemo, request } from './api.js'
import * as fixtures from './fixtures-digest-runs.js'

export async function digestRuns(days) {
  if (isDemo()) return fixtures.digestRuns(days)
  return request('/v1/digests/runs', { params: new URLSearchParams({ days: String(days) }) })
}
