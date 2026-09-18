// Le marché — ce qu'adscope a vu, filtré comme le marchand le regarde.

import * as api from './api.js'
import { clear, el } from './dom.js'
import { number } from './format.js'
import { carteAnnonce } from './market-card.js'
import { renderFilters, renderSort } from './market-filters.js'
import { PAGE_SIZE, marketQuery } from './query.js'

const PERIMETRE = "Sur les annonces qu'adscope a vues — pas tout le marché."
const PANNE = "L'API n'a pas répondu. Réessayez dans un instant."
const RIEN = 'Aucune annonce vue ne répond à ces filtres.'

function compte(total) {
  return `${number(total)} annonce${total > 1 ? 's' : ''}`
}

export async function renderMarket(root, state) {
  // Une licence refusée en cours de route ramène à l'écran de connexion ; le
  // reste des pannes reste dans la page.
  const auth = (err) => { if (err instanceof api.AuthError) state.onAuthError() }

  // Le périmètre ne change pas d'un filtre à l'autre : il se demande une fois.
  if (!state.families) {
    state.families = await api.families().catch((err) => { auth(err); return [] })
  }

  const filtres = el('div')
  const etiquette = el('p', { class: 'compte' })
  const zone = el('div')
  const tri = el('div')

  // Les filtres se redessinent dans leur boîte, pas la page entière : la
  // saisie de la famille est validée avant, donc rien ne se perd.
  function poserFiltres() {
    clear(filtres).append(renderFilters(state, state.families, () => {
      poserFiltres()
      charger(false)
    }))
  }

  async function charger(append) {
    const offset = append ? state.items.length : 0
    if (!append) { state.items = []; etiquette.textContent = 'Chargement…' }
    const params = marketQuery(state.filters, { limit: PAGE_SIZE, offset })
    let reponse
    try {
      reponse = await api.market(params)
    } catch (err) {
      auth(err)
      etiquette.textContent = ''
      clear(zone).append(el('div', { class: 'carte vide', text: PANNE }))
      return
    }
    state.total = reponse.total
    state.items = state.items.concat(reponse.items)
    etiquette.textContent = compte(state.total)
    peindre()
  }

  function peindre() {
    clear(zone)
    if (!state.items.length) {
      zone.append(el('div', { class: 'carte vide', text: RIEN }))
      return
    }
    zone.append(el('div', { class: 'pile' }, state.items.map(carteAnnonce)))
    if (state.items.length < state.total) {
      zone.append(el('button', {
        class: 'plus', text: 'Voir plus', onclick: () => charger(true),
      }))
    }
  }

  clear(tri).append(renderSort(state, () => charger(false)))
  clear(root).append(
    el('h1', { class: 'vue-t', text: 'Le marché' }),
    el('p', { class: 'vue-s', text: PERIMETRE }),
    filtres,
    el('div', { class: 'compte-ligne' }, [etiquette, tri]),
    zone,
  )
  poserFiltres()
  await charger(false)
}
