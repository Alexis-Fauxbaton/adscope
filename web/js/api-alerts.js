// Les appels du lot alertes : recherches enregistrées, réglage du compte,
// boîte d'envoi, désabonnement, mesure de visite. Même porte que le reste du
// site (`request`, exporté d'`api.js`) — pas de second chemin réseau.
//
// Piège nommé au plan : le mode démo des alertes ne passe pas par
// `fixtures.js` (149 lignes, au plafond) mais directement par
// `fixtures-alerts.js`.

import { isDemo, request } from './api.js'
import * as fixtures from './fixtures-alerts.js'

export async function searches() {
  if (isDemo()) return fixtures.searches()
  return request('/v1/searches')
}

export async function createSearch(payload) {
  if (isDemo()) return fixtures.createSearch(payload)
  return request('/v1/searches', { method: 'POST', body: payload })
}

export async function updateSearch(id, payload) {
  if (isDemo()) return fixtures.updateSearch(id, payload)
  return request(`/v1/searches/${id}`, { method: 'PUT', body: payload })
}

export async function deleteSearch(id) {
  if (isDemo()) return fixtures.deleteSearch(id)
  return request(`/v1/searches/${id}`, { method: 'DELETE' })
}

export async function alertSettings() {
  if (isDemo()) return fixtures.alertSettings()
  return request('/v1/alerts/settings')
}

export async function putAlertSettings(payload) {
  if (isDemo()) return fixtures.putAlertSettings(payload)
  return request('/v1/alerts/settings', { method: 'PUT', body: payload })
}

export async function digests(limit = 20) {
  if (isDemo()) return fixtures.digests()
  return request('/v1/digests', { params: new URLSearchParams({ limit: String(limit) }) })
}

export async function digest(id) {
  if (isDemo()) return fixtures.digest(id)
  return request(`/v1/digests/${id}`)
}

// Non authentifiées côté API (§3 du plan) : celui qui clique vient de son
// email, sans session. `isDemo()` n'est pas testée ici — c'est
// `digest-visit.js` qui décide de ne rien appeler en mode démo.
export async function digestVisit(token) {
  return request('/v1/digests/visit', { method: 'POST', body: { token } })
}

export async function unsubscribe(token) {
  return request('/v1/alerts/unsubscribe', { method: 'POST', body: { token } })
}
