// Tous les appels réseau passent ici, et nulle part ailleurs. Le site est servi
// par l'API sous `/app` : même origine, donc des chemins absolus suffisent, et
// la session voyage dans un cookie — jamais dans ce fichier, jamais dans
// `localStorage`.
//
// `?demo=1` coupe le réseau et rend les fixtures. C'est ce qui permet de
// dessiner et de capturer les écrans pendant que les routes se livrent.

import * as fixtures from './fixtures.js'

const OLD_LICENSE_KEY = 'adscope.license'

// La connexion par clé collée à la main n'existe plus (remplacée par le lien
// magique) : un marchand qui a un onglet ouvert depuis avant la migration ne
// doit plus la retrouver dans son stockage.
try {
  localStorage.removeItem(OLD_LICENSE_KEY)
} catch { /* pas de stockage disponible, ou navigation privée : rien à purger */ }

export class AuthError extends Error {}

export function isDemo() {
  return new URLSearchParams(location.search).get('demo') === '1'
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE'])

// La construction de la requête, pure — c'est ce que `web/tests/api.test.mjs`
// vérifie sans réseau. Le cookie de session voyage tout seul (`credentials`),
// et `X-Adscope` ne se pose que sur ce qui écrit : une page tierce ne peut pas
// poser cet en-tête sans prévol CORS, donc sa présence prouve que la requête
// vient d'ici. Un `Bearer` (les machines) n'en a pas besoin, mais ce module ne
// pose jamais de `Bearer` : c'est le site d'un marchand, pas un crawler.
export function buildRequest(path, { method = 'GET', params, body } = {}) {
  const query = params && String(params)
  const headers = {}
  if (WRITE_METHODS.has(method)) headers['X-Adscope'] = '1'
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  return {
    url: query ? `${path}?${query}` : path,
    init: {
      method,
      credentials: 'same-origin',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
  }
}

async function request(path, options) {
  const { url, init } = buildRequest(path, options)
  const res = await fetch(url, init)
  // La session refusée n'est pas une panne : c'est l'écran de connexion.
  if (res.status === 401 || res.status === 403) throw new AuthError('session refusée')
  if (!res.ok) throw new Error(`${path} a répondu ${res.status}`)
  return res.status === 204 ? null : res.json()
}

export async function me() {
  if (isDemo()) return fixtures.me()
  return request('/v1/me')
}

// Toujours 202 — l'API ne dit jamais si l'adresse correspond à un compte.
export async function login(email) {
  return request('/v1/auth/login', { method: 'POST', body: { email } })
}

export async function logout() {
  return request('/v1/auth/logout', { method: 'POST' })
}

export async function families() {
  if (isDemo()) return fixtures.families()
  return request('/v1/families')
}

export async function market(params) {
  if (isDemo()) return fixtures.market(params)
  return request('/v1/market', { params })
}

export async function feed(sinceDays) {
  if (isDemo()) return fixtures.feed({ since_days: sinceDays })
  const params = new URLSearchParams({ since_days: String(sinceDays) })
  return request('/v1/follows/feed', { params })
}

// La file de revisite. Un `POST`, jamais automatique : c'est l'appelant — le
// clic sur « Demander la file » — qui décide de consommer des fiches pour
// sept jours, cette fonction ne fait qu'exécuter la demande.
export async function revisits({ site, limit }) {
  if (isDemo()) return fixtures.revisits({ site, limit })
  return request('/v1/revisits', { method: 'POST', body: { site, limit } })
}
