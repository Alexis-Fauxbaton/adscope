// La liste des résultats du marché : le compte, les cartes, « Voir plus », et
// les trois états qu'un écran filtré doit savoir tenir — chargement, aucun
// résultat, panne.

import * as api from './api.js'
import { clear, el } from './dom.js'
import { number } from './format.js'
import { carteAnnonce } from './market-card.js'
import { clearPatch } from './market-chips.js'
import { anyBadRange } from './market-facets.js'
import { PAGE_SIZE, marketQuery } from './query.js'

const PANNE = "L'API n'a pas répondu. Réessayez dans un instant."
const RIEN = 'Aucune annonce pour ces filtres.'

export function compte(total) {
  return `${number(total)} annonce${total > 1 ? 's' : ''}`
}

// Zéro résultat sur une recherche texte ne se lit pas comme zéro résultat sur
// un filtre : le marchand veut savoir ce qu'il a tapé, pas juste « rien ».
export function messageVide(filters) {
  const q = String((filters && filters.q) || '').trim()
  return q ? `Aucune annonce pour « ${q} » parmi celles qu'adscope a vues.` : RIEN
}

// Un écran vide sans porte de sortie est un cul-de-sac : le marchand a
// empilé quatre filtres, il ne sait plus lequel a tout coupé. Le bouton lui
// rend le marché entier d'un clic.
function vide(state, onClear) {
  return el('div', { class: 'carte vide vide-f' }, [
    el('p', { text: messageVide(state.filters) }),
    el('button', {
      class: 'tout-effacer', type: 'button', text: 'Tout effacer',
      onclick: () => onClear(clearPatch(state.filters)),
    }),
  ])
}

export function createList({ state, zone, etiquette, auth, onClear }) {
  function peindre(charger) {
    clear(zone)
    if (!state.items.length) { zone.append(vide(state, onClear)); return }
    zone.append(el('div', { class: 'pile' }, state.items.map(carteAnnonce)))
    if (state.items.length < state.total) {
      zone.append(el('button', {
        class: 'plus', type: 'button', text: 'Voir plus', onclick: () => charger(true),
      }))
    }
  }

  // Un double clic (ou deux Entrée) sur « Voir plus » ne doit demander la même
  // page qu'une fois : `offset` se lit avant tout `await`, donc un second appel
  // parti pendant que le premier est en vol lirait le même `state.items.length`
  // et doublerait la page suivante dans la liste.
  let enCours = false

  async function charger(append) {
    if (enCours) return
    enCours = true
    try {
      await chargerUneFois(append)
    } finally {
      enCours = false
    }
  }

  async function chargerUneFois(append) {
    const offset = append ? state.items.length : 0
    if (!append) { state.items = []; etiquette.textContent = 'Chargement…' }
    // Une fourchette à l'envers ne part pas : l'API répondrait 422 et l'écran
    // dirait « panne » pour une saisie que le panneau signale déjà.
    if (anyBadRange(state.filters)) {
      state.total = 0
      etiquette.textContent = compte(0)
      peindre(charger)
      return
    }
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
    peindre(charger)
  }

  return charger
}
