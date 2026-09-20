// La rangée toujours visible du marché : chercher, choisir une marque puis un
// modèle, l'ancienneté, la baisse — et la porte du reste. Elle ne calcule
// rien : elle pose l'état et rend la main, c'est `market.js` qui redemande.

import { combo } from './combo.js'
import { el } from './dom.js'
import { activeChips, clearPatch } from './market-chips.js'
import { activeCount, modelsFor } from './market-facets.js'
import { SORTS, familyLabel } from './query.js'

export const AGES = [[0, 'Tous'], [30, '≥ 30 j'], [60, '≥ 60 j'], [90, '≥ 90 j']]
const TRIS = [
  ['age_desc', 'Les plus anciennes'],
  ['drop_desc', 'Les plus fortes baisses'],
  ['recent', 'Les plus récentes'],
]

export function seg(options, current, onPick, label) {
  return el('div', { class: 'seg', role: 'group', 'aria-label': label },
    options.map(([value, texte]) => el('button', {
      class: `seg-b${value === current ? ' on' : ''}`, type: 'button',
      'aria-pressed': value === current ? 'true' : 'false',
      text: texte,
      onclick: () => onPick(value),
    })))
}

function bloc(label, contenu) {
  return el('div', { class: 'bloc' }, [el('p', { class: 'bloc-l', text: label }), contenu])
}

// La saisie ne redessine jamais la rangée pendant la frappe — ça couperait le
// focus au marchand en plein mot. Seuls les résultats et les pastilles bougent
// (`ui.search`) ; la validation (Entrée, tabulation) passe par `ui.patch`,
// sans caractère en vol à perdre.
function champRecherche(ui) {
  const champ = el('input', {
    id: 'q', class: 'champ', type: 'text', spellcheck: 'false', autocomplete: 'off',
    placeholder: 'Marque, modèle, version…', value: ui.filters.q,
    oninput: (event) => ui.search(event.target.value),
    onchange: (event) => ui.patch({ q: event.target.value }),
    onkeydown: (event) => { if (event.key === 'Enter') ui.patch({ q: event.target.value }) },
  })
  return el('div', { class: 'bloc bloc-q' }, [
    el('label', { class: 'bloc-l', for: 'q', text: 'Rechercher' }), champ,
  ])
}

// Pas de `bloc()` autour d'une liste : elle porte déjà son propre `<label>`,
// et deux libellés empilés au-dessus du même contrôle, c'est exactement
// l'empilé qu'on cherche à éviter.
export function brandModelCombos(ui) {
  return [
    combo({
      id: 'marque', label: 'Marque', options: ui.facets.brands || [],
      value: ui.filters.brand, emptyLabel: 'Toutes',
      onPick: (key) => ui.patch({ brand: key }),
    }),
    combo({
      id: 'modele', label: 'Modèle', options: modelsFor(ui.facets, ui.filters),
      value: ui.filters.model,
      // Sans marque, il n'y a pas de liste de modèles à proposer : le contrat
      // ne la sert pas, et « 208 » toutes marques confondues ne veut rien dire.
      emptyLabel: ui.filters.brand ? 'Tous' : 'Choisir une marque',
      disabled: !ui.filters.brand,
      onPick: (key) => ui.patch({ model: key }),
    }),
  ]
}

function boutonPanneau(ui) {
  const n = activeCount(ui.filters)
  const texte = ui.narrow ? `Filtres${n ? ` (${n})` : ''}` : 'Plus de filtres'
  return el('button', {
    class: `plus-f${ui.open ? ' on' : ''}`, type: 'button', id: 'plus-filtres',
    'aria-expanded': ui.open ? 'true' : 'false', 'aria-controls': 'panneau',
    onclick: () => ui.toggleOpen(),
  }, [el('span', { text: texte }), el('span', { class: 'plus-chev', 'aria-hidden': 'true' })])
}

// Sur un écran étroit la rangée se réduit à la recherche et à un bouton
// « Filtres (n) » : marque, modèle, ancienneté et baisse partent dans la
// feuille, où il y a la place de les poser au large. Aligner six contrôles sur
// 390 px les rendrait illisibles.
export function renderFilters(ui) {
  const rangee = ui.narrow
    ? [champRecherche(ui), el('div', { class: 'filtres-fin' }, boutonPanneau(ui))]
    : [champRecherche(ui), ...brandModelCombos(ui)]
  const seconde = ui.narrow ? null : el('div', { class: 'filtres-r filtres-r2' }, [
    bloc('Ancienneté', seg(AGES, ui.filters.minAgeDays,
      (v) => ui.patch({ minAgeDays: v }), 'Ancienneté')),
    bloc('Baisse', seg([[true, 'Avec baisse']], ui.filters.dropped || null,
      () => ui.patch({ dropped: !ui.filters.dropped }), 'Baisse')),
    el('div', { class: 'filtres-fin' }, boutonPanneau(ui)),
  ])
  return el('div', { class: 'carte filtres' }, [
    el('div', { class: 'filtres-r' }, rangee), seconde,
  ])
}

// Les familles déclarées par le marchand ne sont plus un filtre à part : ce
// sont des raccourcis qui posent marque et modèle d'un clic. Elles ne
// paraissent que sur un écran vierge — une fois un filtre posé, la place
// revient aux pastilles, qui disent ce qui agit maintenant.
export function renderFamilies(ui) {
  // Six au plus : au-delà, la ligne passe sur deux rangs et ces raccourcis
  // pèsent plus que la rangée de filtres qu'ils servent.
  const familles = (ui.families || []).slice(0, 6)
  if (!familles.length || activeCount(ui.filters)) return null
  return el('div', { class: 'raccourcis' }, [
    el('span', { class: 'raccourcis-l', text: 'Vos familles' }),
    ...familles.map((f) => el('button', {
      class: 'raccourci', type: 'button', text: familyLabel(f),
      onclick: () => ui.patch({ brand: f.brand, model: f.model }),
    })),
  ])
}

export function renderChips(ui) {
  const chips = activeChips(ui.filters, ui.facets)
  if (!chips.length) return null
  return el('div', { class: 'pastilles' }, [
    ...chips.map((chip) => el('button', {
      class: 'pastille', type: 'button',
      'aria-label': `Retirer le filtre ${chip.label}`,
      onclick: () => ui.patch(chip.patch),
    }, [el('span', { text: chip.label }), el('span', { class: 'pastille-x', 'aria-hidden': 'true', text: '×' })])),
    el('button', {
      class: 'tout-effacer', type: 'button', text: 'Tout effacer',
      onclick: () => ui.patch(clearPatch(ui.filters)),
    }),
  ])
}

// Le tri passe par le même correctif que les filtres : il voyage dans l'URL,
// donc un lien partagé rend aussi l'ordre de lecture de celui qui l'envoie.
export function renderSort(ui) {
  return el('select', {
    class: 'select', 'aria-label': 'Trier',
    onchange: (event) => ui.patch({ sort: event.target.value }),
  }, TRIS.map(([value, texte]) => el('option', {
    value, text: texte, selected: ui.filters.sort === value,
  })))
}

export { SORTS }
