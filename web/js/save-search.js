// « Enregistrer cette recherche » sur Le marché : un champ de nom déplié dans
// la page, jamais `window.prompt`. `query` est la même sérialisation que
// l'URL et les facettes (`filterParams`) — le site n'a pas de second
// sérialiseur. Démo ou session expirée : pas de recherche fictive, le bouton
// renvoie vers la connexion.

import * as alertsApi from './api-alerts.js'
import * as api from './api.js'
import { dropsSentence } from './alerts-search-rules.js'
import { clear, el } from './dom.js'
import { familyLabel, filterParams } from './query.js'

export function validName(raw) {
  return raw.trim().length > 0
}

export function searchPayload(name, filters) {
  return { name: name.trim(), query: String(filterParams(filters)) }
}

// « Renault Clio · diesel · dépt. 59 » : marque/modèle d'abord, puis
// carburant, puis département — les filtres les plus parlants pour se
// souvenir d'une recherche, dans l'ordre où un marchand les poserait.
export function suggestedName(filters, families = []) {
  const parts = []
  const fam = families.find((f) => f.brand === filters.brand && (!filters.model || f.model === filters.model))
  if (filters.brand) parts.push(fam ? familyLabel(fam) : [filters.brand, filters.model].filter(Boolean).join(' '))
  if (filters.fuel && filters.fuel.length) parts.push(filters.fuel.join('/'))
  if (filters.department && filters.department.length) parts.push(`dépt. ${filters.department.join(', ')}`)
  return parts.join(' · ') || 'Ma recherche'
}

export function renderSaveSearch(ui, requireLogin) {
  const wrap = el('div', { class: 'save-search' })

  function bouton() {
    clear(wrap).append(el('button', {
      class: 'save-search-b', text: 'Enregistrer cette recherche',
      onclick: () => { if (api.isDemo()) requireLogin(); else formulaire() },
    }))
  }

  function formulaire() {
    const nom = el('input', {
      class: 'champ save-search-nom', value: suggestedName(ui.filters, ui.families),
      'aria-label': 'Nom de la recherche',
    })
    const erreur = el('p', { class: 'erreur', hidden: true })
    async function enregistrer() {
      if (!validName(nom.value)) {
        erreur.textContent = 'Donnez un nom à cette recherche.'
        erreur.hidden = false
        return
      }
      try {
        const created = await alertsApi.createSearch(searchPayload(nom.value, ui.filters))
        clear(wrap).append(el('div', { class: 'save-search-ok' }, [
          el('p', { class: 'save-search-fait', text: 'Recherche enregistrée.' }),
          el('p', { class: 'save-search-suite', text: `Vous serez alerté dans l'email du matin : ${dropsSentence(created)}` }),
          el('a', { class: 'save-search-lien', href: '#/alertes', text: 'Régler cette alerte →' }),
        ]))
      } catch (err) {
        if (err instanceof api.AuthError) { requireLogin(); return }
        erreur.textContent = "L'enregistrement a échoué. Réessayez."
        erreur.hidden = false
      }
    }
    clear(wrap).append(el('div', { class: 'save-search-form' }, [
      nom,
      el('button', { class: 'bouton save-search-go', text: 'Enregistrer', onclick: enregistrer }),
      el('button', { class: 'save-search-annuler', text: 'Annuler', onclick: bouton }),
      erreur,
    ]))
    nom.focus()
  }

  bouton()
  return wrap
}
