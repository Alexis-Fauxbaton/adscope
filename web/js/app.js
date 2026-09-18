// L'assemblage : deux entrées en haut, une vue dessous, la licence en garde.

import * as api from './api.js'
import { clear, el } from './dom.js'
import { renderFollows } from './follows.js'
import { renderLogin } from './login.js'
import { renderMarket } from './market.js'
import { EMPTY_FILTERS } from './query.js'

const ROUTES = [['#/suivis', 'Mes suivis'], ['#/marche', 'Le marché']]

const racine = document.getElementById('racine')

const state = {
  sinceDays: 7,
  filters: { ...EMPTY_FILTERS },
  items: [],
  total: 0,
  families: null,
  onAuthError: () => { api.forgetLicense(); demarrer() },
}

function route() {
  return ROUTES.some(([href]) => href === location.hash) ? location.hash : ROUTES[0][0]
}

function entete() {
  const courant = route()
  return el('header', { class: 'tete' }, el('div', { class: 'tete-in' }, [
    el('span', { class: 'marque', text: 'adscope' }),
    el('nav', { class: 'nav' }, ROUTES.map(([href, label]) => el('a', {
      class: `nav-a${href === courant ? ' on' : ''}`,
      href,
      'aria-current': href === courant ? 'page' : null,
      text: label,
    }))),
    el('button', {
      class: 'deco',
      text: 'Se déconnecter',
      onclick: () => { api.forgetLicense(); demarrer() },
    }),
  ]))
}

function vue() {
  const zone = el('main', { class: 'vue' })
  clear(racine).append(entete(), zone)
  // Changer de vue remet la pagination à zéro : « Voir plus » compte des
  // annonces, pas des visites.
  state.items = []
  if (route() === '#/marche') renderMarket(zone, state)
  else renderFollows(zone, state)
}

function demarrer() {
  if (!api.isDemo() && !api.licenseKey()) {
    renderLogin(racine, demarrer)
    return
  }
  vue()
}

addEventListener('hashchange', vue)
demarrer()
