// L'assemblage : deux entrées en haut, une vue dessous, la session en garde.

import * as api from './api.js'
import { clear, el } from './dom.js'
import { renderFollows } from './follows.js'
import { renderLogin } from './login.js'
import { renderMarket } from './market.js'
import { EMPTY_FILTERS } from './query.js'
import { filtersFromHash, splitHash } from './url-state.js'

const ROUTES = [['#/suivis', 'Mes suivis'], ['#/marche', 'Le marché']]

const racine = document.getElementById('racine')

const state = {
  sinceDays: 7,
  filters: { ...EMPTY_FILTERS },
  items: [],
  total: 0,
  families: null,
  email: null,
  onAuthError: () => { montrerConnexion() },
}

// Le fragment porte la route *et* les filtres (`#/marche?brand=…`) : la route
// se lit avant le point d'interrogation, sinon aucune page ne se reconnaîtrait
// dès qu'un filtre est posé.
function route() {
  const { route: courante } = splitHash(location.hash)
  return ROUTES.some(([href]) => href === courante) ? courante : ROUTES[0][0]
}

async function deconnecter() {
  // `?demo=1` n'a jamais de session à couper : le bouton reste sans effet,
  // comme le reste du mode démo qui ne fait aucun appel.
  if (api.isDemo()) return
  // Le cookie tombe côté serveur ; qu'il réponde ou non, il n'y a plus rien à
  // montrer ici qu'un écran de connexion.
  try { await api.logout() } catch { /* déjà tombée, ou API muette */ }
  montrerConnexion()
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
    el('div', { class: 'tete-compte' }, [
      state.email && el('span', { class: 'moi', text: state.email }),
      el('button', { class: 'deco', text: 'Se déconnecter', onclick: deconnecter }),
    ]),
  ]))
}

function vue() {
  const zone = el('main', { class: 'vue' })
  clear(racine).append(entete(), zone)
  // Changer de vue remet la pagination à zéro : « Voir plus » compte des
  // annonces, pas des visites.
  state.items = []
  // Les filtres se relisent dans l'URL à chaque affichage : c'est ce qui fait
  // marcher le bouton retour du navigateur, puisque revenir en arrière émet
  // `hashchange` et repasse ici.
  state.filters = filtersFromHash(location.hash)
  if (route() === '#/marche') renderMarket(zone, state)
  else renderFollows(zone, state)
}

function montrerConnexion() {
  state.email = null
  renderLogin(racine)
}

// Connecté ou non se sait par ce que rend `/v1/me` — jamais par un secret
// gardé côté navigateur. Une panne d'API se traite pareil qu'une session
// absente : sans identité confirmée, il n'y a que l'écran de connexion à
// montrer.
async function demarrer() {
  if (api.isDemo()) { vue(); return }
  try {
    const moi = await api.me()
    state.email = moi.email
    vue()
  } catch {
    montrerConnexion()
  }
}

addEventListener('hashchange', vue)
demarrer()
