// Connexion : un champ, une clé. La clé vaut l'identité — on ne demande ni
// courriel ni mot de passe, et il n'y a rien d'autre à faire sur cet écran.

import * as api from './api.js'
import { clear, el } from './dom.js'

export function renderLogin(root, onDone) {
  const champ = el('input', {
    class: 'champ', type: 'text', spellcheck: 'false', autocapitalize: 'off',
    placeholder: 'adsc_…', 'aria-label': 'Clé de licence',
  })
  const erreur = el('p', { class: 'erreur', hidden: true })
  const bouton = el('button', { class: 'bouton', text: 'Entrer' })

  async function submit(event) {
    event.preventDefault()
    const key = champ.value.trim()
    if (!key) return
    bouton.disabled = true
    erreur.hidden = true
    try {
      await api.me(key)
      api.rememberLicense(key)
      onDone()
    } catch (err) {
      // Une clé refusée et une API muette ne se disent pas pareil : dans un
      // cas le marchand corrige sa clé, dans l'autre il n'y peut rien.
      erreur.textContent = err instanceof api.AuthError
        ? "Cette clé n'est pas reconnue."
        : "L'API n'a pas répondu. Réessayez dans un instant."
      erreur.hidden = false
      bouton.disabled = false
    }
  }

  const form = el('form', { class: 'entree', onsubmit: submit }, [
    el('span', { class: 'marque', text: 'adscope' }),
    el('div', { class: 'carte' }, [
      el('h1', { class: 'entree-t', text: 'Votre clé de licence' }),
      el('p', {
        class: 'entree-s',
        text: "Collez la clé reçue — l'extension utilise la même.",
      }),
      champ, bouton, erreur,
    ]),
  ])
  clear(root).append(form)
  champ.focus()
}
