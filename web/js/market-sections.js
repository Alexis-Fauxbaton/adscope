// Une section du panneau, et le bloc que le mobile seul y ajoute.
//
// Sur un écran étroit la rangée se réduit à la recherche et à « Filtres (n) » :
// marque, modèle, ancienneté et baisse n'ont plus de place visible. Sans ce
// bloc en tête de la feuille, ils deviendraient injoignables au téléphone —
// c'est-à-dire absents pour la moitié des visites.

import { el } from './dom.js'
import { AGES, brandModelCombos, seg } from './market-filters.js'

export function section(titre, contenu, note, large) {
  return el('section', { class: `sec${large ? ' sec-large' : ''}` }, [
    el('h3', { class: 'sec-t', text: titre }),
    contenu,
    note && el('p', { class: 'sec-n', text: note }),
  ])
}

export function primarySections(ui) {
  if (!ui.narrow) return []
  return [
    section('Véhicule', el('div', { class: 'duo-l' }, brandModelCombos(ui)), null, true),
    section('Ancienneté', seg(AGES, ui.filters.minAgeDays,
      (v) => ui.patch({ minAgeDays: v }), 'Ancienneté')),
    section('Baisse', seg([[true, 'Avec baisse']], ui.filters.dropped || null,
      () => ui.patch({ dropped: !ui.filters.dropped }), 'Baisse')),
  ]
}
