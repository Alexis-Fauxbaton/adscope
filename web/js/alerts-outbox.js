// « Emails envoyés » — la boîte d'envoi : jour, sujet, visites en clair. Un
// email sélectionné se rend dans un `<iframe>` bac à sable : `sandbox=""`
// est la restriction maximale (ni scripts, ni même origine, ni formulaires).
//
// Piège nommé au plan (§10) : `dom.el` écarte `null` et `false`, jamais la
// chaîne vide — `sandbox: ''` pose bien l'attribut, `sandbox: false` le
// supprimerait en silence.

import { clear, el } from './dom.js'
import { shortDate } from './format.js'

const VIDE = "Le premier email partira le matin où une de vos recherches aura bougé. "
  + "Seul ce qui se passe après l'enregistrement d'une recherche compte."

// « — » ne dit pas si personne n'a ouvert ou si la page ne sait pas
// compter : un chiffre dit en toutes lettres ne laisse pas ce doute.
export function visitsLabel(visits) {
  if (!visits) return 'Pas encore ouvert'
  return `${visits} visite${visits > 1 ? 's' : ''}`
}

function ligne(row, onOpen) {
  return el('button', { class: 'ao-ligne', onclick: () => onOpen(row.id) }, [
    el('span', { class: 'ao-jour', text: shortDate(row.day) }),
    el('span', { class: 'ao-sujet', text: row.subject }),
    el('span', { class: 'ao-visites', text: visitsLabel(row.visits) }),
  ])
}

export function renderOutbox(rows, fetchDigest) {
  const apercu = el('div', { class: 'ao-apercu' })

  async function ouvrir(id) {
    clear(apercu).append(el('p', { class: 'vue-s', text: 'Chargement…' }))
    try {
      const d = await fetchDigest(id)
      clear(apercu).append(el('iframe', {
        class: 'ao-iframe', sandbox: '', srcdoc: d.html, title: `Email du ${d.day}`,
      }))
    } catch {
      clear(apercu).append(el('p', { class: 'vue-s', text: "L'email n'a pas pu être ouvert." }))
    }
  }

  return el('section', { class: 'carte alerts-carte' }, [
    el('h2', { class: 'alerts-h', text: 'Emails envoyés' }),
    rows.length
      ? el('div', { class: 'ao-liste' }, rows.map((r) => ligne(r, ouvrir)))
      : el('p', { class: 'vide', text: VIDE }),
    apercu,
  ])
}
