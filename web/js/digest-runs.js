// La carte « L'email du matin » (planificateur interne,
// `.superpowers/planificateur.md`) : logique pure, sans DOM —
// `js/digest-runs-page.js` la pilote, `web/tests` la vérifie sans navigateur.
// Le contrat est celui de `GET /v1/digests/runs`.

import { delayLabel } from './ecarts.js'

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// La phrase du haut : ce qu'Alexis doit lire en dix secondes pour savoir si
// l'email est parti, à l'heure, et sinon combien de jours ont manqué. Le
// retard ne se dit que s'il y a eu au moins un envoi réussi — un jour tout
// en échec n'a pas de retard qui veuille dire quelque chose.
export function summarize({ days, ran, missed, max_delay_seconds: maxDelay }) {
  const base = `${plural(days, 'jour')} : ${plural(ran, 'envoi')}, ${plural(missed, 'manqué')}`
  return ran > 0 ? `${base}, retard maximal ${delayLabel(maxDelay)}.` : `${base}.`
}

// L'heure de Paris, déjà composée par l'API (`digest_runs.py`, `_out`) :
// lue directement dans le texte ISO, jamais reconstruite par un `Date` — qui
// retomberait sur le fuseau du navigateur qui capture l'écran, jamais celui
// de Paris (même règle que `format.js` pour l'UTC).
export function timeLabel(iso) {
  return iso.slice(11, 16)
}

// L'état vide honnête : avant la première exécution, la carte ne parle pas
// de jours manqués (`digest_runs.py` ne compte que les jours qui portent une
// ligne) — elle annonce la prochaine heure cible.
export function emptyLabel() {
  return 'Aucune exécution encore — la première est prévue à 07:00.'
}
