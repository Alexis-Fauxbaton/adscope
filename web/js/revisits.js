// La file de revisite : logique pure, sans DOM — `js/revisits-page.js` la
// pilote, `web/tests` la vérifie sans navigateur.
//
// La clé n'entre jamais ici. Ce module ne connaît que ce que l'API de
// revisite rend (site, site_id, url) ; il ne lit ni n'écrit d'en-tête, ni de
// licence, et ne les met jamais en cache.

export const SITE = 'lbc'
export const DEFAULT_LIMIT = 40
export const MAX_LIMIT = 100
const CACHE_KEY = 'adscope.revisits.queue'

// `?limit=` — bornée comme `RevisitIn` côté API (1 à 100) ; tout ce qui n'est
// pas un entier positif retombe sur le défaut plutôt que d'envoyer une valeur
// que l'API refuserait.
export function parseLimit(search) {
  const raw = Number(new URLSearchParams(search).get('limit'))
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_LIMIT
  return Math.min(Math.round(raw), MAX_LIMIT)
}

// Ce que la page doit montrer avant tout appel réseau. Sans licence, rien ne
// se demande. Avec une file déjà obtenue ce run, on la réaffiche — un
// rechargement ne redemande jamais, il consommerait des fiches pour rien.
export function initialView(hasLicense, cachedQueue) {
  if (!hasLicense) return 'no-license'
  if (cachedQueue) return 'queue'
  return 'idle'
}

export function readQueue(storage) {
  try {
    const raw = storage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function writeQueue(storage, items) {
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(items))
  } catch { /* sessionStorage indisponible : la file ne survit pas au rechargement */ }
}

export function forgetQueue(storage) {
  try {
    storage.removeItem(CACHE_KEY)
  } catch { /* rien à oublier */ }
}
