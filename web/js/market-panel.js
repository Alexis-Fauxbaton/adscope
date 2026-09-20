// « Plus de filtres » : le panneau replié par défaut. Ce qui s'y range est ce
// qu'on pose rarement mais précisément — les trois fourchettes, les deux
// champs partiels, le lieu, le type de vendeur.
//
// Replié par défaut parce qu'une page de filtres est l'endroit où l'on retombe
// le plus vite dans le compact et l'empilé : sept sections visibles en
// permanence, c'est le brouillon qu'on a déjà refusé quatre fois.

import { combo } from './combo.js'
import { el } from './dom.js'
import { number } from './format.js'
import { clearPatch } from './market-chips.js'
import { RANGE_GROUPS, SELLER_LABELS, coverageLine } from './market-facets.js'
import { primarySections, section } from './market-sections.js'
import { toggleInList } from './market-state.js'
import { badRange } from './query.js'

const A_LENVERS = 'Le minimum dépasse le maximum : aucune annonce ne peut y entrer.'

// Un vrai `<label>` par champ, caché à l'œil mais pas au lecteur d'écran : le
// titre de section dit « Prix », il ne dit pas laquelle des deux cases est le
// minimum.
function borne(group, bout, ui, suggestion) {
  const id = `${group.id}-${bout}`
  const key = group[bout]
  const mot = bout === 'min' ? 'minimum' : 'maximum'
  return [
    el('label', { class: 'sr', for: id, text: `${group.label} ${mot}` }),
    el('input', {
      id, class: 'champ champ-n', type: 'number', inputmode: 'numeric',
      value: ui.filters[key] == null ? '' : String(ui.filters[key]),
      placeholder: suggestion == null ? mot : (group.grouped ? number(suggestion) : String(suggestion)),
      // `change` et non `input` : une borne se juge entière. Réagir à chaque
      // chiffre enverrait « 1 », puis « 12 », puis « 120 » — trois écrans pour
      // une seule intention.
      onchange: (event) => ui.patch({ [key]: event.target.value }),
    }),
  ]
}

function fourchette(group, ui) {
  const bornes = (ui.facets.ranges || {})[group.id] || {}
  const faux = badRange(ui.filters[group.min], ui.filters[group.max])
  return section(group.label, el('div', { class: `duo${faux ? ' faux' : ''}` }, [
    ...borne(group, 'min', ui, bornes.min),
    el('span', { class: 'duo-t', 'aria-hidden': 'true', text: '–' }),
    ...borne(group, 'max', ui, bornes.max),
    group.unit && el('span', { class: 'duo-u', text: group.unit }),
  ]), faux ? A_LENVERS : null)
}

// Les valeurs d'un champ partiel se cochent, plusieurs à la fois : un marchand
// qui regarde l'essence et l'hybride ne veut pas faire deux recherches.
function pastilles(options, choisies, onToggle, label) {
  return el('div', { class: 'opts', role: 'group', 'aria-label': label },
    options.map((option) => el('button', {
      class: `opt${choisies.includes(option.key) ? ' on' : ''}`, type: 'button',
      'aria-pressed': choisies.includes(option.key) ? 'true' : 'false',
      onclick: () => onToggle(option.key),
    }, [
      el('span', { text: option.label }),
      el('span', { class: 'opt-n', text: number(option.count) }),
    ])))
}

function champPartiel(ui, { field, titre, options, unknown, large }) {
  return section(titre,
    pastilles(options, ui.filters[field], (key) => ui.patch(toggleInList(ui.filters, field, key)), titre),
    coverageLine(field, options, unknown), large)
}

// Région puis département : la liste des départements que le contrat sert est
// déjà celle de la région choisie, il n'y a rien à filtrer de plus ici.
function lieu(ui) {
  const corps = el('div', { class: 'duo-l' }, [
    combo({
      id: 'region', label: 'Région', options: ui.facets.regions || [],
      value: ui.filters.region[0] || '', emptyLabel: 'Toutes',
      onPick: (key) => ui.patch({ region: key ? [key] : [], department: [] }),
    }),
    combo({
      id: 'departement', label: 'Département',
      options: (ui.facets.departments || []).map((d) => ({ ...d, label: d.key })),
      value: ui.filters.department[0] || '', emptyLabel: 'Tous',
      onPick: (key) => ui.patch({ department: key ? [key] : [] }),
    }),
  ])
  return section('Lieu', corps,
    coverageLine('location', ui.facets.departments, ui.facets.location_unknown))
}

function vendeur(ui) {
  const options = [{ key: '', label: 'Tous', count: null },
    ...(ui.facets.seller_type || []).map((o) => ({ ...o, label: SELLER_LABELS[o.key] || o.key }))]
  return section('Vendeur', el('div', { class: 'opts', role: 'group', 'aria-label': 'Vendeur' },
    options.map((option) => el('button', {
      class: `opt${ui.filters.sellerType === option.key ? ' on' : ''}`, type: 'button',
      'aria-pressed': ui.filters.sellerType === option.key ? 'true' : 'false',
      onclick: () => ui.patch({ sellerType: option.key }),
    }, [
      el('span', { text: option.label }),
      option.count != null && el('span', { class: 'opt-n', text: number(option.count) }),
    ]))))
}

export function renderPanel(ui) {
  if (!ui.open) return null
  return el('div', { class: 'carte panneau', id: 'panneau' }, [
    el('div', { class: 'panneau-tete' }, [
      el('h2', { class: 'panneau-t', text: 'Plus de filtres' }),
      el('button', { class: 'panneau-x', type: 'button', text: 'Fermer', onclick: () => ui.toggleOpen() }),
    ]),
    // L'ordre tient la grille en deux colonnes sans trou : les trois
    // fourchettes et le vendeur remplissent deux rangs, le carburant prend
    // toute la largeur (neuf valeurs), la boîte et le lieu ferment.
    el('div', { class: 'panneau-grille' }, [
      ...primarySections(ui),
      ...RANGE_GROUPS.map((group) => fourchette(group, ui)),
      vendeur(ui),
      champPartiel(ui, {
        field: 'fuel', titre: 'Carburant', options: ui.facets.fuel || [],
        unknown: ui.facets.fuel_unknown, large: true,
      }),
      champPartiel(ui, {
        field: 'gearbox', titre: 'Boîte', options: ui.facets.gearbox || [],
        unknown: ui.facets.gearbox_unknown,
      }),
      lieu(ui),
    ]),
    el('div', { class: 'panneau-pied' }, [
      el('button', {
        class: 'panneau-effacer', type: 'button', text: 'Tout effacer',
        onclick: () => ui.patch(clearPatch(ui.filters)),
      }),
      el('button', {
        class: 'bouton panneau-voir', type: 'button',
        text: `Voir ${number(ui.total)} annonce${ui.total > 1 ? 's' : ''}`,
        onclick: () => ui.toggleOpen(),
      }),
    ]),
  ])
}
