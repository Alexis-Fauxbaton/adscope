// « Mes alertes » — ce que reçoit un compte chaque matin, et comment le
// régler : l'email du matin d'abord (c'est lui qui prévient), puis les
// recherches qui l'alimentent, puis ce qui a déjà été envoyé. Un seul
// chargement à l'affichage ; chaque carte gère ensuite ses propres écritures
// sans recharger les autres (`alerts-digest.js`, `alerts-searches.js`).

import * as alertsApi from './api-alerts.js'
import * as api from './api.js'
import { renderDigestCard } from './alerts-digest.js'
import { renderOutbox } from './alerts-outbox.js'
import { renderSearchSection } from './alerts-searches.js'
import { clear, el } from './dom.js'
import { facetsQuery } from './query.js'
import { filtersFromQuery } from './url-state.js'

const INTRO = 'Chaque matin, un email avec ce qui a bougé sur vos recherches et vos annonces '
  + "suivies ; rien s'il n'y a rien à dire."

// Le marché que couvre chaque recherche aujourd'hui — la même route que Le
// marché (`/v1/market/facets`), rejouée sur les filtres de la recherche. Une
// panne sur l'une ne bloque pas les autres ni le reste de la page.
async function facetsPerSearch(rows) {
  const entries = await Promise.all(rows.map(async (row) => {
    try { return [row.id, await api.facets(facetsQuery(filtersFromQuery(row.query)))] }
    catch { return [row.id, null] }
  }))
  return Object.fromEntries(entries)
}

export async function renderAlerts(root, state) {
  const zone = el('p', { class: 'vue-s', text: 'Chargement…' })
  clear(root).append(el('h1', { class: 'vue-t', text: 'Mes alertes' }), zone)
  try {
    const [rows, settings, digests] = await Promise.all([
      alertsApi.searches(), alertsApi.alertSettings(), alertsApi.digests(),
    ])
    const facetsById = await facetsPerSearch(rows)

    const zoneEmail = el('div')
    const zoneRecherches = el('div')

    clear(root).append(
      el('h1', { class: 'vue-t', text: 'Mes alertes' }),
      el('p', { class: 'vue-s', text: INTRO }),
      el('div', { class: 'pile alerts-pile' }, [
        zoneEmail,
        zoneRecherches,
        renderOutbox(digests, alertsApi.digest),
      ]),
    )
    renderDigestCard(zoneEmail, settings, state.email, alertsApi)
    renderSearchSection(zoneRecherches, rows, facetsById, alertsApi)
  } catch (err) {
    if (err instanceof api.AuthError) { state.onAuthError(); return }
    clear(root).append(el('div', {
      class: 'carte vide', text: "L'API n'a pas répondu. Réessayez dans un instant.",
    }))
  }
}
