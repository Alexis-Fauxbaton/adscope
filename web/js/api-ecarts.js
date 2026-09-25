// Le journal des écarts (lot Corpus) et la suspension d'une clé (lot
// Disparition, `.superpowers/disparition-plan.md` §6) : `GET /v1/divergences`
// et les deux routes de `licenses.py`, même porte que le reste du site
// (`request`, exporté d'`api.js`) — pas de second chemin réseau. Fichier à
// part comme `api-sweep.js` : `fixtures.js` est au plafond.

import { isDemo, request } from './api.js'
import * as fixtures from './fixtures-ecarts.js'

export async function divergences(days) {
  if (isDemo()) return fixtures.divergences(days)
  return request('/v1/divergences', { params: new URLSearchParams({ days: String(days) }) })
}

export async function suspend(keyHash) {
  if (isDemo()) return fixtures.suspend(keyHash)
  return request(`/v1/licenses/${keyHash}/suspend`, { method: 'POST' })
}

export async function restore(keyHash) {
  if (isDemo()) return fixtures.restore(keyHash)
  return request(`/v1/licenses/${keyHash}/restore`, { method: 'POST' })
}
