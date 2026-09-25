// Le journal des écarts (lot Corpus) : `GET /v1/divergences`, même porte que
// le reste du site (`request`, exporté d'`api.js`) — pas de second chemin
// réseau. Fichier à part comme `api-sweep.js` : `fixtures.js` est au plafond.

import { isDemo, request } from './api.js'
import * as fixtures from './fixtures-ecarts.js'

export async function divergences(days) {
  if (isDemo()) return fixtures.divergences(days)
  return request('/v1/divergences', { params: new URLSearchParams({ days: String(days) }) })
}
