// /app/ecarts.html — la carte « L'email du matin », en tête de la page
// opérateur (planificateur interne, `.superpowers/planificateur.md`) :
// Alexis veut répondre en dix secondes à « est-ce que ça part, à l'heure, et
// sinon pourquoi ». Module à part d'`ecarts-page.js` : deux cartes, deux
// cycles de peinture indépendants — un repaint de la liste des écarts (après
// une suspension de clé) n'a aucune raison de refaire celui-ci.

import * as runsApi from './api-digest-runs.js'
import * as api from './api.js'
import { clear, el } from './dom.js'
import { delayLabel } from './ecarts.js'
import { emptyLabel, summarize, timeLabel } from './digest-runs.js'
import { shortDate } from './format.js'

const racine = document.getElementById('planificateur')
const DAYS = 14

function ligne(row) {
  return el('div', { class: 'run-ligne' }, [
    el('span', { class: 'run-jour', text: shortDate(row.day) }),
    el('span', { text: `parti à ${timeLabel(row.started_at)}` }),
    el('span', { text: `retard ${delayLabel(row.delay_seconds)}` }),
    el('span', { text: `${row.accounts} compte${row.accounts > 1 ? 's' : ''}` }),
    el('span', { text: `${row.sent == null ? '—' : row.sent} email${row.sent === 1 ? '' : 's'}` }),
    row.error ? el('span', { class: 'run-erreur', text: row.error }) : null,
  ])
}

// Le corps de la carte : rien pendant le chargement (le titre seul suffit à
// tenir la place), le message d'erreur ou l'état vide, ou le résumé et les
// lignes récentes.
function corps(state, payload) {
  if (state === 'loading') return []
  if (state === 'error') return [el('p', { class: 'fait-2', text: "L'API n'a pas répondu." })]
  if (payload.runs.length === 0) return [el('p', { class: 'fait-2', text: emptyLabel() })]
  return [
    el('p', { class: 'ecart-resume', text: summarize(payload) }),
    el('div', { class: 'run-liste' }, payload.runs.map(ligne)),
  ]
}

function peindre(state, payload = null) {
  clear(racine)
  if (state === 'no-license') return  // la page le dit déjà (ecarts-page.js)
  racine.append(el('div', { class: 'carte' }, [
    el('div', { class: 'suivi-h', text: "L'email du matin" }),
    ...corps(state, payload),
  ]))
}

function demarrer() {
  if (!racine) return
  if (api.isDemo()) {
    runsApi.digestRuns(DAYS).then((payload) => peindre('data', payload))
    return
  }
  peindre('loading')
  api.me()
    .then(() => runsApi.digestRuns(DAYS))
    .then((payload) => peindre('data', payload))
    .catch((err) => peindre(err instanceof api.AuthError ? 'no-license' : 'error'))
}

demarrer()
