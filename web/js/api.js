// Tous les appels réseau passent ici, et nulle part ailleurs. Le site est servi
// par l'API sous `/app` : même origine, donc des chemins absolus suffisent.
//
// `?demo=1` coupe le réseau et rend les fixtures. C'est ce qui permet de
// dessiner et de capturer les écrans pendant que les routes se livrent.

import * as fixtures from './fixtures.js'

const STORAGE_KEY = 'adscope.license'

export class AuthError extends Error {}

export function isDemo() {
  return new URLSearchParams(location.search).get('demo') === '1'
}

export function licenseKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function rememberLicense(key) {
  try {
    localStorage.setItem(STORAGE_KEY, key)
  } catch { /* navigation privée : la clé vaudra le temps de l'onglet */ }
}

export function forgetLicense() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* rien à oublier */ }
}

async function get(path, params, key = licenseKey()) {
  const query = params && String(params)
  const res = await fetch(query ? `${path}?${query}` : path, {
    headers: { Authorization: `Bearer ${key}` },
  })
  // La licence refusée n'est pas une panne : c'est l'écran de connexion.
  if (res.status === 401 || res.status === 403) throw new AuthError('licence refusée')
  if (!res.ok) throw new Error(`${path} a répondu ${res.status}`)
  return res.json()
}

export async function me(key = licenseKey()) {
  if (isDemo()) return fixtures.me()
  return get('/v1/me', null, key)
}

export async function families() {
  if (isDemo()) return fixtures.families()
  return get('/v1/families')
}

export async function market(params) {
  if (isDemo()) return fixtures.market(params)
  return get('/v1/market', params)
}

export async function feed(sinceDays) {
  if (isDemo()) return fixtures.feed({ since_days: sinceDays })
  const params = new URLSearchParams({ since_days: String(sinceDays) })
  return get('/v1/follows/feed', params)
}

// La file de revisite. Un `POST`, jamais automatique : c'est l'appelant — le
// clic sur « Demander la file » — qui décide de consommer des fiches pour
// sept jours, cette fonction ne fait qu'exécuter la demande.
export async function revisits({ site, limit }) {
  if (isDemo()) return fixtures.revisits({ site, limit })
  const res = await fetch('/v1/revisits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${licenseKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ site, limit }),
  })
  if (res.status === 401 || res.status === 403) throw new AuthError('licence refusée')
  if (!res.ok) throw new Error(`/v1/revisits a répondu ${res.status}`)
  return res.json()
}
