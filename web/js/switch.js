// L'interrupteur du registre — piste et pastille à l'accent — à la place
// d'une case native partout où un réglage se coche/décoche dans « Mes
// alertes ». `role="switch"` en plus de `type="checkbox"` : la sémantique
// annoncée est « activé/désactivé », pas « coché/décoché », et le
// `<input>` reste le seul élément qui porte l'état — jamais une `<div>` qui
// ferait semblant. Le clic applique tout de suite ; si `onChange` refuse,
// l'interrupteur revient en arrière et le dit à côté de lui, jamais par une
// alerte du navigateur.

import { el } from './dom.js'

export function renderSwitch({ id, checked, onChange, content, disabled }) {
  const erreur = el('p', { class: 'switch-erreur', role: 'alert', hidden: true })
  const input = el('input', {
    type: 'checkbox', role: 'switch', id, checked: checked || null, disabled: disabled || null,
    class: 'switch-input',
  })
  input.addEventListener('change', async () => {
    const value = input.checked
    input.disabled = true
    erreur.hidden = true
    try {
      await onChange(value)
    } catch {
      input.checked = !value
      erreur.textContent = "Le changement n'a pas été enregistré. Réessayez."
      erreur.hidden = false
    } finally {
      input.disabled = false
    }
  })
  const label = el('label', { class: 'switch', for: id }, [
    input,
    el('span', { class: 'switch-track', 'aria-hidden': 'true' }, [el('span', { class: 'switch-thumb' })]),
    el('span', { class: 'switch-texte' }, content),
  ])
  return el('div', { class: 'switch-bloc' }, [label, erreur])
}
