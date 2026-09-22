// Le routeur public : les écrans qu'on voit sans session — connexion,
// inscription, vérification d'email, mot de passe oublié et sa
// réinitialisation. Le jeton des deux derniers voyage dans le *fragment*
// (`#/verification?token=…`), jamais envoyé au serveur par un `GET` : un
// antivirus de messagerie qui précharge les liens d'un email ne doit pas
// brûler l'usage unique avant le clic de Karim (D1 du plan). La page lit le
// fragment, POSTe, puis l'efface (`history.replaceState`) — même geste que
// `digest-visit.js` pour `?d=`.

import * as apiAuth from './api-auth.js'
import { clear, el } from './dom.js'
import { renderLogin } from './login.js'
import { renderForgot, renderNewPassword } from './password-reset.js'
import { renderSignup, renderVerifiez } from './signup.js'
import { splitHash } from './url-state.js'

export const AUTH_ROUTES = new Set([
  '#/connexion', '#/inscription', '#/verifiez', '#/verification',
  '#/mdp-oublie', '#/nouveau-mdp',
])

const PAGES = {
  '#/connexion': 'connexion',
  '#/inscription': 'inscription',
  '#/verifiez': 'verifiez',
  '#/verification': 'verification',
  '#/mdp-oublie': 'mdp-oublie',
  '#/nouveau-mdp': 'nouveau-mdp',
}

// Rouge sur `PAGES[splitHash(hash).route]` : sans lui, une route inconnue ou
// un hash qui porte encore des filtres du marché tomberait sur `undefined`
// plutôt que sur la connexion.
export function pageFor(hash = '') {
  return PAGES[splitHash(hash).route] || 'connexion'
}

export function tokenFromHash(hash = '') {
  return new URLSearchParams(splitHash(hash).query).get('token')
}

export function emailFromHash(hash = '') {
  return new URLSearchParams(splitHash(hash).query).get('email') || ''
}

// Efface le jeton de l'URL sans recharger la page — le pendant de `withoutD`
// dans `digest-visit.js`, sur le fragment plutôt que la requête.
export function withoutToken(href) {
  const url = new URL(href)
  url.hash = splitHash(url.hash).route
  return url.pathname + url.search + url.hash
}

function renderVerification(root, token, { onAuthenticated }) {
  const carte = el('div', { class: 'carte' })
  clear(root).append(el('div', { class: 'entree' }, [
    el('span', { class: 'marque', text: 'adscope' }),
    carte,
  ]))
  history.replaceState(null, '', withoutToken(location.href))
  const echoue = (texte) => clear(carte).append(
    el('h1', { class: 'entree-t', text: 'Lien invalide' }),
    el('p', { class: 'erreur', text: texte }),
    el('a', { class: 'lien-sortant', href: '#/connexion', text: 'Retour à la connexion' }),
  )
  if (!token) return echoue('Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.')
  apiAuth.verify(token).then(() => {
    clear(carte).append(
      el('h1', { class: 'entree-t', text: 'Votre email est vérifié' }),
      el('button', { class: 'bouton', text: 'Voir mes suivis', onclick: () => onAuthenticated() }),
    )
  }).catch((err) => echoue(err.message || 'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.'))
}

export function render(root, hash, callbacks = {}) {
  const page = pageFor(hash)
  if (page === 'connexion') return renderLogin(root, callbacks)
  if (page === 'inscription') return renderSignup(root)
  if (page === 'verifiez') return renderVerifiez(root, emailFromHash(hash))
  if (page === 'verification') return renderVerification(root, tokenFromHash(hash), callbacks)
  if (page === 'mdp-oublie') return renderForgot(root)
  return renderNewPassword(root, tokenFromHash(hash), callbacks)
}
