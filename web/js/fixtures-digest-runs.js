// Le mode démo de la carte « L'email du matin » (`.superpowers/planificateur.md`) :
// la même forme que `GET /v1/digests/runs`, sans réseau. Quatorze jours,
// treize envois, un manqué (panne, tentatives épuisées), un retard maximal
// de deux minutes — l'exemple même de la carte. Les jours sont ancrés sur
// celui de `DEMO_NOW` (`fixtures-data.js`, 2026-09-18).

const ACCOUNTS = 42
const MAX_ATTEMPTS = 3

// jour, emails écrits (null si manqué), retard en secondes, erreur.
const ROWS = [
  ['2026-09-18', 4, 18, null],
  ['2026-09-17', 6, 25, null],
  ['2026-09-16', 2, 15, null],
  ['2026-09-15', 5, 120, null],
  ['2026-09-14', 3, 20, null],
  ['2026-09-13', 1, 14, null],
  ['2026-09-12', 7, 30, null],
  ['2026-09-11', 2, 22, null],
  ['2026-09-10', null, 45, 'connexion à la base perdue'],
  ['2026-09-09', 4, 19, null],
  ['2026-09-08', 3, 16, null],
  ['2026-09-07', 5, 28, null],
  ['2026-09-06', 2, 13, null],
  ['2026-09-05', 6, 21, null],
]

function pad(n) {
  return String(n).padStart(2, '0')
}

// L'heure de Paris composée en texte, jamais via `Date` : les fixtures se
// lisent pareil quel que soit le fuseau de la machine qui les charge. Cible
// 07:00 partout ici ; aucun retard de la liste n'atteint l'heure suivante.
function parisIso(day, delaySeconds) {
  return `${day}T07:${pad(Math.floor(delaySeconds / 60))}:${pad(delaySeconds % 60)}+02:00`
}

function item([day, sent, delaySeconds, error]) {
  const startedAt = parisIso(day, delaySeconds)
  return {
    day, due_at: `${day}T07:00:00+02:00`, started_at: startedAt, finished_at: startedAt,
    accounts: ACCOUNTS, sent, error, trigger: 'scheduler',
    attempts: sent == null ? MAX_ATTEMPTS : 1, delay_seconds: delaySeconds,
  }
}

export function digestRuns(days = 14) {
  const rows = ROWS.slice(0, days).map(item)
  const delays = rows.filter((row) => row.sent != null).map((row) => row.delay_seconds)
  const ran = delays.length
  return {
    days, ran, missed: rows.length - ran,
    max_delay_seconds: delays.length ? Math.max(...delays) : 0,
    last_error: rows.find((row) => row.error)?.error ?? null,
    runs: rows,
  }
}
