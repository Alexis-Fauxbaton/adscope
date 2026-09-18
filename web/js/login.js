// Connexion : un email, un lien à usage unique envoyé par l'API. Personne ne
// voit ni ne saisit plus de clé ici — ça reste pour les machines, ailleurs.

import * as api from './api.js'
import { clear, el } from './dom.js'

// Ce que la carte montre après l'envoi : le lien direct en mode local
// (`ADSCOPE_DEV_LOGIN=1` côté API), sinon la même phrase qu'un compte
// inconnu — l'API ne dit jamais lequel, pour ne rien laisser deviner.
export function envoiOutcome(reponse) {
  return reponse && reponse.dev_link ? 'dev' : 'sent'
}

export function estExpire(search) {
  return new URLSearchParams(search).get('login') === 'expired'
}

function carteEnvoye() {
  return [
    el('h1', { class: 'entree-t', text: 'Lien envoyé' }),
    el('p', {
      class: 'entree-s',
      text: 'Si un compte existe pour cette adresse, un lien vient de partir.',
    }),
  ]
}

function carteDev(lien) {
  return [
    el('h1', { class: 'entree-t', text: 'Mode local — ouvrez ce lien' }),
    el('p', {
      class: 'entree-s',
      text: "Pas d'envoi d'email en local : ouvrez ce lien pour vous connecter.",
    }),
    el('a', { class: 'lien-sortant', href: lien, text: lien }),
  ]
}

export function renderLogin(root) {
  const champ = el('input', {
    class: 'champ', type: 'email', spellcheck: 'false', autocapitalize: 'off',
    autocomplete: 'email', placeholder: 'vous@garage.fr', 'aria-label': 'Adresse email',
  })
  const erreur = el('p', { class: 'erreur', hidden: true })
  const bouton = el('button', { class: 'bouton', text: 'Recevoir le lien' })
  const carte = el('div', { class: 'carte' })

  async function submit(event) {
    event.preventDefault()
    const email = champ.value.trim()
    if (!email) return
    bouton.disabled = true
    erreur.hidden = true
    try {
      const reponse = await api.login(email)
      const contenu = envoiOutcome(reponse) === 'dev' ? carteDev(reponse.dev_link) : carteEnvoye()
      clear(carte).append(...contenu)
    } catch {
      // L'envoi lui-même a échoué — API muette, pas une adresse refusée : la
      // route ne refuse jamais une adresse, justement pour ne rien énumérer.
      erreur.textContent = "L'API n'a pas répondu. Réessayez dans un instant."
      erreur.hidden = false
      bouton.disabled = false
    }
  }

  clear(carte).append(
    el('h1', { class: 'entree-t', text: 'Connexion' }),
    el('p', { class: 'entree-s', text: 'Recevez un lien de connexion par email.' }),
    el('form', { onsubmit: submit }, [champ, bouton]),
    erreur,
  )

  const expiree = estExpire(location.search)
    ? el('p', { class: 'erreur', text: 'Ce lien a expiré ou a déjà servi.' })
    : null

  clear(root).append(el('div', { class: 'entree' }, [
    el('span', { class: 'marque', text: 'adscope' }),
    expiree,
    carte,
  ]))
  champ.focus()
}
