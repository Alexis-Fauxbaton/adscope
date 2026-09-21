// La mesure d'usage interne (§9 du plan) : un lien d'email porte `?d=…`. À
// l'arrivée, on compte une visite sur la ligne de boîte d'envoi puis on
// efface la trace dans l'URL — sans quoi un simple rechargement compterait
// une visite de plus. Aucun pixel, aucun outil tiers.

import { isDemo } from './api.js'
import { digestVisit } from './api-alerts.js'

export function tokenFromSearch(search = location.search) {
  return new URLSearchParams(search).get('d')
}

// `?d=` vit dans la query string, la route dans le fragment (`#/…`) : on ne
// touche qu'à l'un des deux.
export function withoutD(href) {
  const url = new URL(href)
  url.searchParams.delete('d')
  return url.pathname + url.search + url.hash
}

export function runDigestVisit() {
  // Le mode démo ne fait aucun appel réseau — même règle que `fixtures.js` —
  // et une capture ne doit jamais dépendre d'une route qui répond.
  if (isDemo()) return
  const token = tokenFromSearch()
  if (!token) return
  // Un échec de comptage est de la télémétrie interne : il ne doit rien
  // casser sur la page qui arrive.
  digestVisit(token).catch(() => {})
  history.replaceState(null, '', withoutD(location.href))
}
