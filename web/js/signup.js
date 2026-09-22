// Créer un compte, et l'écran « Vérifiez votre email » qui suit — le même
// qu'une connexion refusée pour compte non vérifié (`login.js`) : Karim n'a
// qu'un seul endroit où lire ce message et cliquer « Renvoyer l'email ».

import * as apiAuth from './api-auth.js'
import { clear, el } from './dom.js'
import { passwordField } from './password-field.js'

// Mot pour mot le message que rend l'API sur un mot de passe trop court
// (`passwords.TOO_SHORT`) : la règle est dite ici *avant* l'envoi, avec les
// mêmes mots — Karim ne doit jamais lire deux formulations de la même règle.
export const REGLE_MDP = "Choisissez un mot de passe d'au moins 10 caractères."

// Rouge si on oublie de nommer l'adresse : sans elle (arrivée directe sur
// `#/verifiez`, sans être passé par l'inscription), le message générique
// reste vrai mais ne doit pas prétendre connaître une adresse qu'on n'a pas.
export function verifiezMessage(email) {
  return email
    ? `Un email est parti à ${email}. Ouvrez-le pour activer votre compte.`
    : "Ouvrez l'email reçu à l'inscription pour activer votre compte."
}

export function verifiezCard(email) {
  const note = el('p', { class: 'entree-s', hidden: true })
  const bouton = el('button', { class: 'lien-sortant', text: "Renvoyer l'email" })
  bouton.addEventListener('click', async () => {
    if (!email) return
    bouton.disabled = true
    try {
      await apiAuth.resend(email)
      note.textContent = 'Email renvoyé.'
    } catch {
      note.textContent = "L'API n'a pas répondu. Réessayez dans un instant."
    }
    note.hidden = false
    bouton.disabled = false
  })
  return [
    el('h1', { class: 'entree-t', text: 'Vérifiez votre email' }),
    el('p', { class: 'entree-s', text: verifiezMessage(email) }),
    bouton,
    note,
  ]
}

export function renderVerifiez(root, email) {
  clear(root).append(el('div', { class: 'entree' }, [
    el('span', { class: 'marque', text: 'adscope' }),
    el('div', { class: 'carte' }, verifiezCard(email)),
  ]))
}

export function renderSignup(root) {
  const champEmail = el('input', {
    class: 'champ', type: 'email', spellcheck: 'false', autocapitalize: 'off',
    autocomplete: 'email', placeholder: 'vous@garage.fr', 'aria-label': 'Adresse email',
  })
  const { wrap: champMdpWrap, input: champMdp } = passwordField('new-password', 'Mot de passe')
  const erreur = el('p', { class: 'erreur', hidden: true })
  const bouton = el('button', { class: 'bouton', text: 'Créer mon compte' })
  const carte = el('div', { class: 'carte' })

  async function submit(event) {
    event.preventDefault()
    const email = champEmail.value.trim()
    const password = champMdp.value
    if (!email || !password) return
    bouton.disabled = true
    erreur.hidden = true
    try {
      await apiAuth.signup(email, password)
      clear(carte).append(...verifiezCard(email))
    } catch (err) {
      erreur.textContent = err.message || "L'API n'a pas répondu. Réessayez dans un instant."
      erreur.hidden = false
      bouton.disabled = false
    }
  }

  clear(carte).append(
    el('h1', { class: 'entree-t', text: 'Créer un compte' }),
    el('form', { onsubmit: submit }, [
      champEmail, champMdpWrap,
      el('p', { class: 'regle', text: REGLE_MDP }),
      bouton,
    ]),
    erreur,
    el('div', { class: 'entree-liens' }, [
      el('a', { href: '#/connexion', text: 'J’ai déjà un compte' }),
    ]),
  )

  clear(root).append(el('div', { class: 'entree' }, [
    el('span', { class: 'marque', text: 'adscope' }),
    carte,
  ]))
  champEmail.focus()
}
