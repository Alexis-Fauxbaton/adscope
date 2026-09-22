// Tous les appels d'authentification : inscription, vérification, renvoi,
// connexion, déconnexion, oubli, réinitialisation, changement — la même
// construction de requête que le reste du site (`buildRequest` d'api.js),
// jamais un second chemin réseau.
//
// Contrairement à `request()` d'api.js, une erreur ici ne veut jamais dire
// « session tombée, montre l'écran de connexion » — l'écran affiché est déjà
// la connexion, l'inscription ou l'oubli : l'erreur porte le message exact
// que l'API a choisi pour Karim (`ApiError.message`), à afficher tel quel.

import { buildRequest, isDemo } from './api.js'

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail)
    this.status = status
  }
}

async function call(path, body) {
  const { url, init } = buildRequest(path, { method: 'POST', body })
  const res = await fetch(url, init)
  if (res.ok) return res.status === 204 ? null : res.json()
  let detail = `${path} a répondu ${res.status}`
  try { detail = (await res.json()).detail || detail } catch { /* corps vide ou non JSON */ }
  throw new ApiError(res.status, detail)
}

// Mode démo : aucun appel réseau — une capture d'écran ne doit jamais
// dépendre d'une route qui répond, et il n'y a aucune API à côté d'elle.
const demo = () => Promise.resolve(null)

export function signup(email, password) {
  return isDemo() ? demo() : call('/v1/auth/signup', { email, password })
}

export function verify(token) {
  return isDemo() ? demo() : call('/v1/auth/verify', { token })
}

export function resend(email) {
  return isDemo() ? demo() : call('/v1/auth/resend', { email })
}

export function login(email, password) {
  return isDemo() ? demo() : call('/v1/auth/login', { email, password })
}

export function logout() {
  return isDemo() ? demo() : call('/v1/auth/logout', undefined)
}

export function forgot(email) {
  return isDemo() ? demo() : call('/v1/auth/forgot', { email })
}

export function resetPassword(token, password) {
  return isDemo() ? demo() : call('/v1/auth/password/reset', { token, password })
}

export function changePassword(current, password) {
  return isDemo() ? demo() : call('/v1/auth/password', { current, password })
}
