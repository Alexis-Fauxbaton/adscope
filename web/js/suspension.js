// Le bouton de suspension d'une clé, sur `/app/ecarts.html`
// (`.superpowers/disparition-plan.md` §6.3) : chaque carte propose
// « Suspendre » ou « Rétablir », jamais les deux, jamais rien pour une clé
// supprimée (`license_key_hash` nul). Le clic ouvre une confirmation
// *dans la page* — jamais `window.confirm`, imcapturable en démo, même règle
// que `save-search.js`.

import * as licensesApi from './api-ecarts.js'
import { clear, el } from './dom.js'

export function actionFor(lic) {
  if (!lic.license_key_hash) return null
  return lic.active ? 'suspend' : 'restore'
}

const VERBS = { suspend: 'Suspendre', restore: 'Rétablir' }

export function confirmLabel(lic, action) {
  const suite = action === 'suspend' ? ' Ses appels seront refusés.' : ''
  return `${VERBS[action]} ${lic.label} ?${suite}`
}

// `lic` est repeint en place (`lic.active`) : la carte qui le porte se
// repeint depuis la réponse sans recharger la page (`onChanged`).
export function renderSuspendControl(lic, onChanged) {
  if (!actionFor(lic)) return null
  const wrap = el('div', { class: 'suspend-bloc' })
  let mode = 'idle'
  let erreur = null

  function repaint() {
    const action = actionFor(lic)
    if (mode === 'idle') {
      clear(wrap).append(el('button', {
        class: 'suspend-b', text: `${VERBS[action]} cette clé`,
        onclick: () => { mode = 'confirm'; repaint() },
      }))
      return
    }
    const enAttente = mode === 'pending'
    const bloc = [el('p', { class: 'fait-2', text: confirmLabel(lic, action) })]
    if (erreur) bloc.push(el('p', { class: 'erreur', text: erreur }))
    bloc.push(el('button', {
      class: 'bouton suspend-go', text: `Oui, ${VERBS[action].toLowerCase()}`,
      disabled: enAttente, onclick: agir,
    }))
    bloc.push(el('button', {
      class: 'suspend-annuler', text: 'Annuler', disabled: enAttente,
      onclick: () => { mode = 'idle'; erreur = null; repaint() },
    }))
    clear(wrap).append(el('div', { class: 'suspend-confirm' }, bloc))
  }

  async function agir() {
    const action = actionFor(lic)
    mode = 'pending'
    erreur = null
    repaint()
    try {
      const out = action === 'suspend'
        ? await licensesApi.suspend(lic.license_key_hash)
        : await licensesApi.restore(lic.license_key_hash)
      lic.active = out.active
      mode = 'idle'
      onChanged()
    } catch {
      mode = 'confirm'
      erreur = "L'action a échoué. Réessayez."
      repaint()
    }
  }

  repaint()
  return wrap
}
