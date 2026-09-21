// « Mes alertes » — trois cartes : les recherches enregistrées, le réglage de
// l'email du matin, la boîte d'envoi. Un seul chargement à l'affichage ; les
// écritures rechargent la page plutôt que de retoucher l'état à la main — la
// vue est légère, ça ne coûte rien.

import * as alertsApi from './api-alerts.js'
import * as api from './api.js'
import { renderOutbox } from './alerts-outbox.js'
import { payloadFor, renderSearches } from './alerts-searches.js'
import { clear, el } from './dom.js'

function carteRecherches(root, state, rows) {
  async function patch(id, correctif) {
    await alertsApi.updateSearch(id, payloadFor(rows.find((r) => r.id === id), correctif))
    renderAlerts(root, state)
  }
  async function del(id) {
    await alertsApi.deleteSearch(id)
    renderAlerts(root, state)
  }
  return el('section', { class: 'carte alerts-carte' }, [
    el('h2', { class: 'alerts-h', text: 'Mes recherches' }),
    renderSearches(rows, { onPatch: patch, onDelete: del }),
  ])
}

function bascule(label, field, settings, onChange) {
  const id = `alerts-set-${field}`
  const input = el('input', {
    type: 'checkbox', id, checked: settings[field] || null,
    onchange: () => onChange({ ...settings, [field]: input.checked }),
  })
  return el('label', { class: 'alerts-bascule', for: id }, [el('span', { text: label }), input])
}

function carteReglage(root, state, settings) {
  async function change(payload) {
    await alertsApi.putAlertSettings(payload)
    renderAlerts(root, state)
  }
  return el('section', { class: 'carte alerts-carte' }, [
    el('h2', { class: 'alerts-h', text: "L'email du matin" }),
    bascule('Email actif', 'digest_enabled', settings, change),
    bascule('Suivis inclus', 'include_follows', settings, change),
  ])
}

export async function renderAlerts(root, state) {
  const zone = el('p', { class: 'vue-s', text: 'Chargement…' })
  clear(root).append(el('h1', { class: 'vue-t', text: 'Mes alertes' }), zone)
  try {
    const [rows, settings, digests] = await Promise.all([
      alertsApi.searches(), alertsApi.alertSettings(), alertsApi.digests(),
    ])
    clear(root).append(
      el('h1', { class: 'vue-t', text: 'Mes alertes' }),
      el('div', { class: 'alerts-grille' }, [
        carteRecherches(root, state, rows),
        carteReglage(root, state, settings),
        renderOutbox(digests, alertsApi.digest),
      ]),
    )
  } catch (err) {
    if (err instanceof api.AuthError) { state.onAuthError(); return }
    clear(root).append(el('div', {
      class: 'carte vide', text: "L'API n'a pas répondu. Réessayez dans un instant.",
    }))
  }
}
