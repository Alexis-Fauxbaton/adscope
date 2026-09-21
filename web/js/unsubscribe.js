// La page de désabonnement (§8 du plan) : hors session, un jeton opaque dans
// l'URL. Le clic qui compte est celui, déjà fait, sur le lien de l'email —
// cette page poste directement, jamais un `GET` : les analyseurs de liens qui
// préchargent les URL ne déclenchent qu'un `GET`, jamais l'appel réseau posté
// ici en JavaScript.

import { resubscribe, unsubscribe } from './api-alerts.js'
import { clear, el } from './dom.js'

export function tokenFromSearch(search = location.search) {
  return new URLSearchParams(search).get('t')
}

function carte(texte, action) {
  return el('div', { class: 'carte' }, [
    el('p', { class: 'entree-s', text: texte }),
    action && el('button', { class: 'bouton', text: action.label, onclick: action.onclick }),
  ])
}

function entete() {
  return [el('span', { class: 'marque', text: 'adscope' }), el('h1', { class: 'entree-t', text: 'Désabonnement' })]
}

export async function render(root) {
  const zone = el('div', { class: 'entree' }, entete())
  clear(root).append(zone)
  const token = tokenFromSearch()
  if (!token) { zone.append(carte('Lien invalide.')); return }

  async function reactiver() {
    try {
      await resubscribe(token)
      clear(zone).append(...entete(), carte('Email du matin réactivé.'))
    } catch {
      zone.append(carte("L'action a échoué. Réessayez plus tard."))
    }
  }

  try {
    await unsubscribe(token)
    zone.append(carte("Vous ne recevrez plus l'email du matin.", { label: 'Réactiver', onclick: reactiver }))
  } catch {
    zone.append(carte('Lien invalide ou déjà expiré.'))
  }
}
