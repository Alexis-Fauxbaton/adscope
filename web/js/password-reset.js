// Mot de passe oublié, et le formulaire qui suit le lien reçu — même
// mécanique de jeton que la vérification d'email (`auth-routes.js`), un
// `purpose` différent côté API (`reset` plutôt que `verify`).

import * as apiAuth from './api-auth.js'
import { clear, el } from './dom.js'
import { passwordField } from './password-field.js'
import { REGLE_MDP } from './signup.js'

// Réponse indistincte, adresse connue ou non (D3 du plan) : jamais d'autre
// texte à afficher sur cet écran une fois le formulaire envoyé.
export const MESSAGE_ENVOYE = 'Si un compte existe pour cette adresse, un lien vient de partir.'

export function renderForgot(root) {
  const champ = el('input', {
    class: 'champ', type: 'email', spellcheck: 'false', autocapitalize: 'off',
    autocomplete: 'email', placeholder: 'vous@garage.fr', 'aria-label': 'Adresse email',
  })
  const bouton = el('button', { class: 'bouton', text: 'Recevoir le lien' })
  const carte = el('div', { class: 'carte' })

  async function submit(event) {
    event.preventDefault()
    const email = champ.value.trim()
    if (!email) return
    bouton.disabled = true
    try {
      await apiAuth.forgot(email)
    } catch { /* la réponse reste la même, connue ou non : rien à distinguer */ }
    clear(carte).append(
      el('h1', { class: 'entree-t', text: 'Mot de passe oublié' }),
      el('p', { class: 'entree-s', text: MESSAGE_ENVOYE }),
    )
  }

  clear(carte).append(
    el('h1', { class: 'entree-t', text: 'Mot de passe oublié' }),
    el('p', { class: 'entree-s', text: 'Recevez un lien pour choisir un nouveau mot de passe.' }),
    el('form', { onsubmit: submit }, [champ, bouton]),
    el('div', { class: 'entree-liens' }, [
      el('a', { href: '#/connexion', text: 'Retour à la connexion' }),
    ]),
  )

  clear(root).append(el('div', { class: 'entree' }, [
    el('span', { class: 'marque', text: 'adscope' }),
    carte,
  ]))
  champ.focus()
}

export function renderNewPassword(root, token, { onAuthenticated } = {}) {
  const { wrap, input } = passwordField('new-password', 'Nouveau mot de passe')
  const erreur = el('p', { class: 'erreur', hidden: true })
  const bouton = el('button', { class: 'bouton', text: 'Choisir ce mot de passe' })
  const carte = el('div', { class: 'carte' })

  async function submit(event) {
    event.preventDefault()
    const password = input.value
    if (!password) return
    bouton.disabled = true
    erreur.hidden = true
    try {
      await apiAuth.resetPassword(token, password)
      onAuthenticated && onAuthenticated()
    } catch (err) {
      erreur.textContent = err.message || "L'API n'a pas répondu. Réessayez dans un instant."
      erreur.hidden = false
      bouton.disabled = false
    }
  }

  clear(carte).append(
    el('h1', { class: 'entree-t', text: 'Nouveau mot de passe' }),
    el('form', { onsubmit: submit }, [
      wrap,
      el('p', { class: 'regle', text: REGLE_MDP }),
      bouton,
    ]),
    erreur,
  )

  clear(root).append(el('div', { class: 'entree' }, [
    el('span', { class: 'marque', text: 'adscope' }),
    carte,
  ]))
}
