// « Emails envoyés » — la boîte d'envoi : jour, sujet, visites. Un email
// sélectionné se rend dans un `<iframe>` bac à sable : `sandbox=""` est la
// restriction maximale (ni scripts, ni même origine, ni formulaires).
//
// Piège nommé au plan (§10) : `dom.el` écarte `null` et `false`, jamais la
// chaîne vide — `sandbox: ''` pose bien l'attribut, `sandbox: false` le
// supprimerait en silence.

import { clear, el } from './dom.js'

function ligne(row, onOpen) {
  return el('button', { class: 'ao-ligne', onclick: () => onOpen(row.id) }, [
    el('span', { class: 'ao-jour', text: row.day }),
    el('span', { class: 'ao-sujet', text: row.subject }),
    el('span', {
      class: 'ao-visites',
      text: row.visits ? `${row.visits} visite${row.visits > 1 ? 's' : ''}` : '—',
    }),
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

  return el('section', { class: 'carte alerts-carte alerts-carte-large' }, [
    el('h2', { class: 'alerts-h', text: 'Emails envoyés' }),
    rows.length
      ? el('div', { class: 'ao-liste' }, rows.map((r) => ligne(r, ouvrir)))
      : el('p', { class: 'vide', text: 'Aucun email envoyé pour le moment.' }),
    apercu,
  ])
}
