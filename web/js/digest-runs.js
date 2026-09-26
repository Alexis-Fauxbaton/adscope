// La carte « L'email du matin » (planificateur interne,
// `.superpowers/planificateur.md`) : logique pure, sans DOM —
// `js/digest-runs-page.js` la pilote, `web/tests` la vérifie sans navigateur.
// Le contrat est celui de `GET /v1/digests/runs`.

import { delayLabel } from './ecarts.js'
import { shortDate } from './format.js'

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function dayOnly(iso) {
  const day = new Date(iso).getUTCDate()
  return day === 1 ? '1er' : String(day)
}

function monthOf(iso) {
  return new Date(iso).getUTCMonth()
}

// « a, b et c » — jamais de virgule avant le dernier.
function joinFr(parts) {
  if (parts.length < 2) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`
}

// Nomme les jours manqués pour que la phrase du haut réponde déjà à
// « lesquels », sans descendre à la liste : le mois ne s'écrit qu'une fois
// par groupe, sur le dernier jour du groupe (même règle que « constatée
// entre le 14 et le 17 sept. », `fixtures-alerts.js`).
function missedDaysLabel(missedDays) {
  const parts = missedDays.map((iso, i) => {
    const next = missedDays[i + 1]
    const sameMonthAsNext = next !== undefined && monthOf(iso) === monthOf(next)
    return `le ${sameMonthAsNext ? dayOnly(iso) : shortDate(iso)}`
  })
  return `manqué ${joinFr(parts)}`
}

// La phrase du haut : ce qu'Alexis doit lire en dix secondes pour savoir si
// l'email est parti, à l'heure, et sinon combien de jours ont manqué (et
// lesquels). Le retard ne se dit que s'il y a eu au moins un envoi réussi —
// un jour tout en échec n'a pas de retard qui veuille dire quelque chose.
export function summarize({
  days, ran, missed, max_delay_seconds: maxDelay, missed_days: missedDays = [],
}) {
  const base = `${plural(days, 'jour')} : ${plural(ran, 'envoi')}, ${plural(missed, 'manqué')}`
  const withDelay = ran > 0 ? `${base}, retard maximal ${delayLabel(maxDelay)}.` : `${base}.`
  if (!missedDays.length) return withDelay
  const named = missedDaysLabel(missedDays)
  const point = named.endsWith('.') ? '' : '.'  // le mois abrégé porte déjà le point (« sept. »)
  return `${withDelay} ${named[0].toUpperCase()}${named.slice(1)}${point}`
}

// L'heure de Paris, déjà composée par l'API (`digest_runs.py`, `_out`) :
// lue directement dans le texte ISO, jamais reconstruite par un `Date` — qui
// retomberait sur le fuseau du navigateur qui capture l'écran, jamais celui
// de Paris (même règle que `format.js` pour l'UTC).
export function timeLabel(iso) {
  return iso.slice(11, 16)
}

// L'état vide honnête : avant la première exécution, aucune ligne n'existe
// encore nulle part (`digest_runs.py`, `_missed_days` rend `[]`) — la carte
// ne parle donc pas de jours manqués, elle annonce la prochaine heure cible.
export function emptyLabel() {
  return 'Aucune exécution encore — la première est prévue à 07:00.'
}
