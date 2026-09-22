// Connexion : email + mot de passe, comme n'importe quel site. Le lien
// magique a disparu (lot Comptes avec mot de passe, 2026-09-22) ; sa
// mécanique reste, mais sert désormais les liens de vérification et de
// réinitialisation (`auth-routes.js`).

import * as apiAuth from './api-auth.js'
import { clear, el } from './dom.js'
import { verifiezCard } from './signup.js'

// Ce que répond une tentative refusée : le `403` est un compte non vérifié —
// le même écran que juste après l'inscription, avec le renvoi ; tout le
// reste (401, 429, panne) reste sur le formulaire avec le message de l'API.
export function outcomeFor(err) {
  return err.status === 403 ? 'verifiez' : 'erreur'
}

export function renderLogin(root, { onAuthenticated } = {}) {
  const champEmail = el('input', {
    class: 'champ', type: 'email', spellcheck: 'false', autocapitalize: 'off',
    autocomplete: 'email', placeholder: 'vous@garage.fr', 'aria-label': 'Adresse email',
  })
  const champMdp = el('input', {
    class: 'champ', type: 'password', autocomplete: 'current-password',
    placeholder: 'Mot de passe', 'aria-label': 'Mot de passe',
  })
  const erreur = el('p', { class: 'erreur', hidden: true })
  const bouton = el('button', { class: 'bouton', text: 'Se connecter' })
  const carte = el('div', { class: 'carte' })

  async function submit(event) {
    event.preventDefault()
    const email = champEmail.value.trim()
    const password = champMdp.value
    if (!email || !password) return
    bouton.disabled = true
    erreur.hidden = true
    try {
      await apiAuth.login(email, password)
      onAuthenticated && onAuthenticated()
    } catch (err) {
      if (outcomeFor(err) === 'verifiez') {
        clear(carte).append(...verifiezCard(email))
        return
      }
      erreur.textContent = err.message || "L'API n'a pas répondu. Réessayez dans un instant."
      erreur.hidden = false
      bouton.disabled = false
    }
  }

  clear(carte).append(
    el('h1', { class: 'entree-t', text: 'Connexion' }),
    el('form', { onsubmit: submit }, [champEmail, champMdp, bouton]),
    erreur,
    el('div', { class: 'entree-liens' }, [
      el('a', { href: '#/mdp-oublie', text: 'Mot de passe oublié ?' }),
      el('a', { href: '#/inscription', text: 'Créer un compte' }),
    ]),
  )

  clear(root).append(el('div', { class: 'entree' }, [
    el('span', { class: 'marque', text: 'adscope' }),
    carte,
  ]))
  champEmail.focus()
}
