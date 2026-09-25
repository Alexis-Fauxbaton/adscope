// Le journal des écarts (lot Corpus) : logique pure, sans DOM —
// `js/ecarts-page.js` la pilote, `web/tests` la vérifie sans navigateur. Le
// contrat est celui de `GET /v1/divergences` (docs/roadmap.md § Lot Corpus,
// point 4) : les clés sont déjà triées côté API, `sortLicenses` n'est qu'une
// garantie côté client — les fixtures de démo n'ont pas à respecter l'ordre.

import { money, shortDate } from './format.js'

export const DEFAULT_DAYS = 30
export const MAX_DAYS = 365

// `?days=` — bornée comme le paramètre `days` de `GET /v1/divergences`
// (1 à 365, ge/le de la route) ; tout ce qui n'est pas un entier positif
// retombe sur le défaut plutôt que d'envoyer une valeur que l'API refuserait.
export function parseDays(search) {
  const raw = Number(new URLSearchParams(search).get('days'))
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_DAYS
  return Math.min(Math.round(raw), MAX_DAYS)
}

// Les champs du journal : un libellé français, jamais le code brut, sur la
// carte d'une clé. `revived` (`.superpowers/disparition-plan.md` §7.2, lot
// Disparition) : la résurrection qu'un marchand a déclarée et que le robot
// contredit (`recheck.mark_revival`, `divergence.on_absence`).
const FIELD_LABELS = {
  price: 'prix',
  published: 'date de mise en ligne',
  vehicle: 'véhicule',
  absence: 'absence',
  bump: 'réactualisation',
  unknown_listing: 'annonce inconnue',
  revived: 'résurrection',
}

export function fieldLabel(field) {
  return FIELD_LABELS[field] || field
}

const HOUR = 3600
const DAY = 86400

// « 45 min », « 2 h », « 6 j » — trois paliers écrits à la main comme
// `format.spellAge` : pas de bibliothèque, et la lecture ne dépend jamais du
// fuseau de la machine qui capture l'écran (les secondes viennent de l'API).
export function delayLabel(seconds) {
  if (seconds < HOUR) return `${Math.max(1, Math.round(seconds / 60))} min`
  if (seconds < 2 * DAY) return `${Math.round(seconds / HOUR)} h`
  return `${Math.round(seconds / DAY)} j`
}

// La valeur déclarée ou constatée, mise en forme selon le champ : un prix en
// euros, une date courte — le reste (« absente », « créée », « aucune » …)
// est déjà un texte lisible composé côté API, il se rend tel quel.
export function valueLabel(field, value) {
  if (value == null) return '—'
  if (field === 'price') return money(Number(value))
  if (field === 'published' || field === 'bump') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return shortDate(value)
  }
  return value
}

// Un écart de prix se lit avec son signe ; les autres champs n'en portent
// aucun (`delta_pct` est `null`) et n'affichent donc rien.
export function deltaLabel(pct) {
  if (pct == null) return null
  return `${pct < 0 ? '−' : '+'}${Math.abs(pct).toFixed(1).replace('.', ',')} %`
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// La phrase du haut : ce qu'Alexis doit lire en dix secondes pour savoir s'il
// referme la page ou s'il descend (docs/roadmap.md § Lot Corpus, point 4).
export function summarize(payload, days) {
  const { total, keys, repeat_keys: repeatKeys } = payload
  const base = `${plural(total, 'écart')} sur ${plural(days, 'jour')}, `
    + `${plural(keys, 'clé')} concernée${keys === 1 ? '' : 's'}`
  return repeatKeys > 0
    ? `${base}, dont ${plural(repeatKeys, 'clé')} avec 3 écarts ou plus.`
    : `${base}.`
}

// Garantie côté client de l'ordre du contrat : compte décroissant, puis délai
// le plus court, puis la clé — pour que deux clés à égalité sortent toujours
// dans le même ordre (§4.2 du plan).
export function sortLicenses(licenses) {
  return [...licenses].sort((a, b) => (
    b.count - a.count
    || a.min_delay_seconds - b.min_delay_seconds
    || String(a.license_key_hash || '').localeCompare(String(b.license_key_hash || ''))
  ))
}
