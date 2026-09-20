// Une liste de choix avec ses compteurs, filtrable au clavier.
//
// Pourquoi pas un `<select>` : le contrat sert un compte par option, qu'un
// `<option>` ne sait montrer qu'en le collant au libellé, et la vraie base
// porte une centaine de marques — sans champ de filtre, le marchand fait
// défiler. D'où ce composant, avec ce qu'un `<select>` donnait gratuitement et
// qu'il faut ici tenir à la main : un vrai `<label>`, les flèches, Entrée,
// Échap, et le focus rendu au bouton en sortant.

import { clear, el } from './dom.js'
import { number } from './format.js'
import { optionFor } from './market-facets.js'
import { fold } from './query.js'

const AUCUNE = 'Aucune correspondance'

function ligne(option, index, id, value, choisir) {
  const choisi = option.key === value
  return el('li', {
    class: `combo-o${choisi ? ' on' : ''}`, role: 'option', id: `${id}-o${index}`,
    'aria-selected': choisi ? 'true' : 'false',
    // `mousedown` et non `click` : le champ de filtre perdrait le focus avant
    // que le clic n'arrive, et la liste se serait déjà refermée sous le doigt.
    onmousedown: (event) => { event.preventDefault(); choisir(option) },
  }, [
    el('span', { class: 'combo-t', text: option.label }),
    option.count != null && el('span', { class: 'combo-n', text: number(option.count) }),
  ])
}

export function combo({ id, label, options = [], value = '', emptyLabel, disabled, onPick }) {
  const toutes = [{ key: '', label: emptyLabel }, ...options]
  // La valeur peut arriver dans l'écriture affichée (un raccourci de famille,
  // un lien partagé) : `optionFor` la ramène à la clé de la liste, sinon le
  // bouton dirait « Toutes » alors que le filtre agit bel et bien.
  const choisie = optionFor(options, value)
  const clé = choisie ? choisie.key : value
  const liste = el('ul', { class: 'combo-list', role: 'listbox', 'aria-label': label })
  const rien = el('p', { class: 'combo-rien', text: AUCUNE, hidden: true })
  const filtre = el('input', {
    class: 'combo-f', type: 'text', spellcheck: 'false', autocomplete: 'off',
    'aria-label': `Filtrer : ${label}`, placeholder: 'Filtrer…',
  })
  const pop = el('div', { class: 'combo-pop', id: `${id}-pop`, hidden: true }, [filtre, liste, rien])
  const bouton = el('button', {
    id, class: `combo-b${choisie ? ' on' : ''}`, type: 'button', disabled,
    'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': `${id}-pop`,
  }, [
    el('span', { class: 'combo-v', text: choisie ? choisie.label : emptyLabel }),
    el('span', { class: 'combo-chev', 'aria-hidden': 'true' }),
  ])
  const racine = el('div', { class: 'combo' }, [
    el('label', { class: 'combo-l', for: id, text: label }), bouton, pop,
  ])

  let visibles = toutes
  let actif = 0

  function souligner() {
    const items = [...liste.children]
    items.forEach((node, i) => node.classList.toggle('actif', i === actif))
    const courant = items[actif]
    filtre.setAttribute('aria-activedescendant', courant ? courant.id : '')
    if (courant) courant.scrollIntoView({ block: 'nearest' })
  }

  function peindre(texte) {
    const cherche = fold(texte)
    visibles = toutes.filter((o) => !cherche
      || fold(o.label).includes(cherche) || fold(o.key).includes(cherche))
    clear(liste).append(...visibles.map((o, i) => ligne(o, i, id, clé, choisir)))
    rien.hidden = visibles.length > 0
    actif = visibles.length ? 0 : -1
    souligner()
  }

  function dehors(event) { if (!racine.contains(event.target)) fermer() }

  function fermer({ rendreLeFocus = true } = {}) {
    pop.hidden = true
    bouton.setAttribute('aria-expanded', 'false')
    document.removeEventListener('mousedown', dehors)
    if (rendreLeFocus) bouton.focus()
  }

  function ouvrir() {
    pop.hidden = false
    bouton.setAttribute('aria-expanded', 'true')
    filtre.value = ''
    peindre('')
    filtre.focus()
    document.addEventListener('mousedown', dehors)
  }

  // Le focus repart au bouton *avant* d'annoncer le choix : la page se
  // redessine sur `onPick`, et un focus resté dans une liste détruite
  // retomberait sur le `body` — le clavier perdrait sa place.
  function choisir(option) {
    fermer()
    onPick(option.key)
  }

  bouton.addEventListener('click', () => (pop.hidden ? ouvrir() : fermer()))
  filtre.addEventListener('input', (event) => peindre(event.target.value))
  filtre.addEventListener('keydown', (event) => {
    const pas = { ArrowDown: 1, ArrowUp: -1 }[event.key]
    if (pas) {
      event.preventDefault()
      actif = Math.min(Math.max(actif + pas, 0), visibles.length - 1)
      souligner()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (visibles[actif]) choisir(visibles[actif])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      fermer()
    }
  })
  return racine
}
