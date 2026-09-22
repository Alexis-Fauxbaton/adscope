// Mon compte : l'adresse, changer le mot de passe (ancien + nouveau), se
// déconnecter — le même geste que le bouton de l'entête, ici en toutes
// lettres (§7 du plan).

import * as apiAuth from './api-auth.js'
import { clear, el } from './dom.js'
import { passwordField } from './password-field.js'
import { REGLE_MDP } from './signup.js'

export function renderCompte(root, state, { onLogout } = {}) {
  const champActuel = passwordField('current-password', 'Mot de passe actuel')
  const champNouveau = passwordField('new-password', 'Nouveau mot de passe')
  const erreur = el('p', { class: 'erreur', hidden: true })
  const succes = el('p', { class: 'entree-s', hidden: true, text: 'Mot de passe changé.' })
  const bouton = el('button', { class: 'bouton', text: 'Changer le mot de passe' })

  async function submit(event) {
    event.preventDefault()
    const current = champActuel.input.value
    const password = champNouveau.input.value
    if (!current || !password) return
    bouton.disabled = true
    erreur.hidden = true
    succes.hidden = true
    try {
      await apiAuth.changePassword(current, password)
      succes.hidden = false
      champActuel.input.value = ''
      champNouveau.input.value = ''
    } catch (err) {
      erreur.textContent = err.message || "L'API n'a pas répondu. Réessayez dans un instant."
      erreur.hidden = false
    }
    bouton.disabled = false
  }

  clear(root).append(el('div', { class: 'pile' }, [
    el('div', { class: 'carte' }, [
      el('h1', { class: 'vue-t', text: 'Mon compte' }),
      el('p', { class: 'vue-s', text: state.email }),
    ]),
    el('div', { class: 'carte' }, [
      el('h2', { class: 'entree-t', text: 'Changer le mot de passe' }),
      el('form', { onsubmit: submit }, [
        champActuel.wrap, champNouveau.wrap,
        el('p', { class: 'regle', text: REGLE_MDP }),
        bouton,
      ]),
      erreur, succes,
    ]),
    el('div', { class: 'carte' }, [
      el('button', { class: 'bouton', text: 'Se déconnecter', onclick: () => onLogout && onLogout() }),
    ]),
  ]))
}
