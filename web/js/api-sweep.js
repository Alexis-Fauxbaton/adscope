// La file de balayage (lot F2) : `GET /v1/sweep`, même porte que le reste du
// site (`request`, exporté d'`api.js`) — pas de second chemin réseau.
// Fichier à part comme `api-alerts.js` : `fixtures.js` est au plafond.

import { isDemo, request } from './api.js'
import * as fixtures from './fixtures-sweep.js'

export async function sweep(pages) {
  if (isDemo()) return fixtures.sweep(pages)
  return request('/v1/sweep', { params: new URLSearchParams({ pages: String(pages) }) })
}
