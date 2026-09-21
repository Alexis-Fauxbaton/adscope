// Mes recherches — une ligne par recherche enregistrée : ouvrir, cocher les
// règles, mettre en pause, supprimer. `query` est déjà la forme canonique
// rendue par l'API ; ce fichier la résume pour l'œil, il ne la réécrit pas.

import { el } from './dom.js'

export function querySummary(query) {
  const params = new URLSearchParams(query)
  const parts = []
  const brand = params.get('brand')
  const model = params.get('model')
  if (brand) parts.push([brand, model].filter(Boolean).join(' '))
  const fuel = params.getAll('fuel')
  if (fuel.length) parts.push(fuel.join('/'))
  const dept = params.getAll('department')
  if (dept.length) parts.push(`dépt. ${dept.join(', ')}`)
  return parts.join(' · ') || 'Tout le marché'
}

// `PUT` est complet : on repart de la recherche affichée et on applique un
// seul correctif — le contrat n'a pas de `PATCH` (§3 du plan).
export function payloadFor(search, patch) {
  const { id, created_at, ...base } = search
  return { ...base, ...patch }
}

function casePour(search, field, label, onPatch) {
  const id = `as-${field}-${search.id}`
  const input = el('input', {
    type: 'checkbox', id, checked: search[field] || null,
    onchange: () => onPatch(search.id, { [field]: input.checked }),
  })
  return el('label', { class: 'as-case', for: id }, [input, el('span', { text: label })])
}

// « Supprimer » demande confirmation en place — jamais `window.confirm` — un
// second clic sur le même bouton, devenu « Confirmer », déclenche la
// suppression.
function boutonSupprimer(search, onDelete) {
  let arme = false
  const bouton = el('button', { class: 'as-suppr', text: 'Supprimer' })
  bouton.addEventListener('click', () => {
    if (!arme) {
      arme = true
      bouton.textContent = 'Confirmer'
      bouton.classList.add('as-suppr-arme')
      return
    }
    onDelete(search.id)
  })
  return bouton
}

function ligne(search, { onPatch, onDelete }) {
  return el('div', { class: 'as-ligne' }, [
    el('div', { class: 'as-info' }, [
      el('a', { class: 'as-nom', href: `#/marche?${search.query}`, text: search.name }),
      el('p', { class: 'as-resume', text: querySummary(search.query) }),
    ]),
    el('div', { class: 'as-regles' }, [
      casePour(search, 'notify_drops', 'Baisses', onPatch),
      casePour(search, 'notify_new', 'Nouvelles', onPatch),
      casePour(search, 'paused', 'En pause', onPatch),
    ]),
    boutonSupprimer(search, onDelete),
  ])
}

export function renderSearches(rows, callbacks) {
  if (!rows.length) {
    return el('p', { class: 'vide', text: 'Aucune recherche enregistrée pour le moment.' })
  }
  return el('div', { class: 'as-liste' }, rows.map((s) => ligne(s, callbacks)))
}
