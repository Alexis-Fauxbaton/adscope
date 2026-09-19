// La rangée de filtres du marché. Elle ne calcule rien : elle pose l'état et
// rend la main, c'est `market.js` qui redemande.

import { el } from './dom.js'
import { SORTS, debounce, familyInputPatch, familyLabel } from './query.js'

// Le délai avant qu'une frappe ne déclenche la recherche — un aller-retour
// API par lettre serait absurde, une seconde entière se sentirait mou.
const PAUSE_MS = 300

const AGES = [[0, 'Tous'], [30, '≥ 30 j'], [60, '≥ 60 j'], [90, '≥ 90 j']]
const VENDEURS = [['', 'Tous'], ['pro', 'Pro'], ['private', 'Particulier']]
const TRIS = [
  ['age_desc', 'Les plus anciennes'],
  ['drop_desc', 'Les plus fortes baisses'],
  ['recent', 'Les plus récentes'],
]

function seg(options, current, onPick, label) {
  return el('div', { class: 'seg', role: 'group', 'aria-label': label },
    options.map(([value, texte]) => el('button', {
      class: `seg-b${value === current ? ' on' : ''}`,
      'aria-pressed': value === current,
      text: texte,
      onclick: () => onPick(value),
    })))
}

// Le périmètre du marchand propose, la saisie libre dispose : l'annonce qu'il
// a en tête n'est pas toujours dans une famille qu'il a déjà déclarée — elle
// part alors dans `q`, jamais découpée. Choisir une famille de la liste vide
// la recherche texte, taper une recherche libre désélectionne la famille :
// `familyInputPatch` tranche, ce champ ne fait qu'appliquer.
//
// La saisie ne redessine jamais la boîte de filtres pendant la frappe — ça
// couperait le focus au marchand en plein mot. Seuls les résultats bougent
// (`onSearch`) ; la validation (Entrée, tabulation, choix dans la liste)
// redessine (`onChange`), sans caractère en vol à perdre.
function champFamille(state, families, { onChange, onSearch }) {
  const liste = el('datalist', { id: 'familles' },
    families.map((f) => el('option', { value: familyLabel(f) })))
  const valeur = state.filters.brand || state.filters.model
    ? familyLabel(state.filters) : state.filters.q
  const appliquer = (texte) => {
    Object.assign(state.filters, familyInputPatch(texte, families))
    onChange()
  }
  const retarde = debounce((texte) => {
    Object.assign(state.filters, familyInputPatch(texte, families))
    onSearch()
  }, PAUSE_MS)
  const champ = el('input', {
    class: 'champ', type: 'text', list: 'familles', spellcheck: 'false',
    placeholder: 'Marque et modèle', 'aria-label': 'Famille',
    value: valeur,
    oninput: (event) => retarde(event.target.value),
    onchange: (event) => appliquer(event.target.value),
    onkeydown: (event) => { if (event.key === 'Enter') appliquer(event.target.value) },
  })
  return el('div', { class: 'famille' }, [champ, liste])
}

export function renderFilters(state, families, { onChange, onSearch }) {
  const pose = (patch) => { Object.assign(state.filters, patch); onChange() }
  return el('div', { class: 'carte filtres' }, [
    champFamille(state, families, { onChange, onSearch }),
    seg(AGES, state.filters.minAgeDays, (v) => pose({ minAgeDays: v }), 'Ancienneté'),
    seg([[true, 'Avec baisse']], state.filters.dropped || null,
      () => pose({ dropped: !state.filters.dropped }), 'Baisse'),
    seg(VENDEURS, state.filters.sellerType, (v) => pose({ sellerType: v }), 'Vendeur'),
  ])
}

export function renderSort(state, onChange) {
  return el('select', {
    class: 'select', 'aria-label': 'Trier',
    onchange: (event) => { state.filters.sort = event.target.value; onChange() },
  }, TRIS.map(([value, texte]) => el('option', {
    value, text: texte, selected: state.filters.sort === value,
  })))
}

export { SORTS }
