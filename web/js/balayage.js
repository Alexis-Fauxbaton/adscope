// La file de balayage (lot F2) : logique pure, sans DOM — `js/balayage-page.js`
// la pilote, `web/tests` la vérifie sans navigateur.
//
// `GET /v1/sweep`, rien n'est consommé : contrairement à `revisits.js`,
// recharger la page et redemander la file ne coûte rien — pas de cache à
// tenir en `sessionStorage`.

export const DEFAULT_PAGES = 120
export const MAX_PAGES = 400

// `?pages=` — bornée comme le paramètre `pages` côté API (1 à 400, ge/le de
// `get_sweep`) ; tout ce qui n'est pas un entier positif retombe sur le
// défaut plutôt que d'envoyer une valeur que l'API refuserait.
export function parsePages(search) {
  const raw = Number(new URLSearchParams(search).get('pages'))
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_PAGES
  return Math.min(Math.round(raw), MAX_PAGES)
}
