// Le champ de mot de passe, avec un œil pour l'afficher — jamais de champ
// « confirmez ». Police proportionnelle : ce champ n'a plus rien à voir avec
// une clé collée à la main (l'ancien `.entree .champ` en monospace).

import { el } from './dom.js'

export function passwordField(autocomplete, label) {
  const input = el('input', {
    class: 'champ', type: 'password', autocomplete, placeholder: label, 'aria-label': label,
  })
  const oeil = el('button', { type: 'button', class: 'oeil', text: 'Afficher' })
  oeil.addEventListener('click', () => {
    const visible = input.type === 'text'
    input.type = visible ? 'password' : 'text'
    oeil.textContent = visible ? 'Afficher' : 'Masquer'
  })
  const wrap = el('div', { class: 'champ-mdp' }, [input, oeil])
  return { wrap, input }
}
