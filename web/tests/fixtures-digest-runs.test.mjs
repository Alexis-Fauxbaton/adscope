import test from 'node:test'
import assert from 'node:assert/strict'
import { digestRuns } from '../js/fixtures-digest-runs.js'

// Rouge sur `missedDays = rows.filter((row) => row.sent == null)...` dans
// `digestRuns` : la fixture doit nommer le jour manqué, pas seulement le
// compter — `digest-runs.js` (`summarize`) en a besoin pour la phrase du
// haut (`.superpowers/planificateur.md`).
test('la fixture démo nomme le jour manqué (panne du 10 septembre)', () => {
  const payload = digestRuns(14)
  assert.equal(payload.missed, 1)
  assert.deepEqual(payload.missed_days, ['2026-09-10'])
})
