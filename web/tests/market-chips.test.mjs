import test from 'node:test'
import assert from 'node:assert/strict'
import { EMPTY_FILTERS } from '../js/query.js'
import { activeChips, clearPatch } from '../js/market-chips.js'

const FACETTES = {
  brands: [{ key: 'renault', label: 'Renault', count: 900 }],
  models: [{ key: 'clio', label: 'Clio', count: 310 }],
  fuel: [{ key: 'hybride_rechargeable', label: 'Hybride rechargeable', count: 12 }],
  gearbox: [{ key: 'automatique', label: 'Automatique', count: 40 }],
  regions: [{ key: 'ile-de-france', label: 'Île-de-France', count: 88 }],
  departments: [{ key: '92', label: 'Hauts-de-Seine', count: 21 }],
}

const libelles = (filters) => activeChips(filters, FACETTES).map((c) => c.label)

// Rouge sur le `labelFor(facets.brands …)` d'`activeChips` dans
// js/market-chips.js : la pastille doit porter l'écriture officielle
// (« Île-de-France », « Hybride rechargeable »), pas la clé d'URL.
test('chaque pastille porte l’écriture officielle, pas la clé', () => {
  assert.deepEqual(
    libelles({
      ...EMPTY_FILTERS,
      brand: 'renault', fuel: ['hybride_rechargeable'], region: ['ile-de-france'],
    }),
    ['Renault', 'Hybride rechargeable', 'Île-de-France'],
  )
})

// Rouge sur le `key === 'department' ? …` de `listChips` : « 92 » tout seul
// sur une pastille ne dit pas ce que c'est — une année tronquée, un nombre
// d'annonces ?
test('un département se nomme comme tel', () => {
  assert.deepEqual(
    libelles({ ...EMPTY_FILTERS, department: ['92'] }),
    ['Département 92 · Hauts-de-Seine'],
  )
})

// Rouge sur le `departmentLabel(optionFor(…), value)` de `listChips` : sans le
// repli sur le code, un département absent des compteurs (filtré par un
// filtre non lié, comme un modèle très rare) n'afficherait rien du tout.
test('un département sans compteur garde au moins son code', () => {
  assert.deepEqual(
    libelles({ ...EMPTY_FILTERS, department: ['08'] }),
    ['Département 08'],
  )
})

// Rouge sur les trois branches de `rangeChip` : une fourchette à demi posée
// est le cas courant (« sous 10 000 € »), et « Prix 0 – 10 000 € »
// inventerait une borne basse que personne n'a demandée.
test('une fourchette se dit entière, ouverte à gauche ou ouverte à droite', () => {
  assert.deepEqual(
    libelles({ ...EMPTY_FILTERS, priceMin: 5000, priceMax: 12000 }),
    ['Prix 5 000 – 12 000 €'],
  )
  assert.deepEqual(libelles({ ...EMPTY_FILTERS, priceMax: 10000 }), ['Prix ≤ 10 000 €'])
  assert.deepEqual(libelles({ ...EMPTY_FILTERS, mileageMin: 20000 }), ['Kilométrage ≥ 20 000 km'])
  // L'année n'a pas d'unité : « Année 2018 – 2021 an » ne veut rien dire.
  assert.deepEqual(libelles({ ...EMPTY_FILTERS, yearMin: 2018, yearMax: 2021 }), ['Année 2018 – 2021'])
})

// Rouge sur le `patch: { brand: '', model: '' }` d'`activeChips` : retirer la
// marque en gardant le modèle laisserait « Clio » filtrer toutes marques
// confondues — un filtre que le marchand n'a jamais demandé.
test('retirer la marque emporte le modèle', () => {
  const chips = activeChips({ ...EMPTY_FILTERS, brand: 'renault', model: 'clio' }, FACETTES)
  assert.deepEqual(chips.find((c) => c.id === 'brand').patch, { brand: '', model: '' })
  assert.deepEqual(chips.find((c) => c.id === 'model').patch, { model: '' })
})

// Rouge sur le `.filter((v) => v !== value)` de `listChips` : retirer
// « diesel » doit laisser « essence » en place, pas vider la liste entière.
test('retirer une valeur d’une liste laisse les autres', () => {
  const chips = activeChips({ ...EMPTY_FILTERS, fuel: ['essence', 'diesel'] }, FACETTES)
  assert.equal(chips.length, 2)
  assert.deepEqual(chips[1].patch, { fuel: ['essence'] })
})

// Rouge sur le `if (filters.q)` : une recherche texte est un filtre comme un
// autre depuis le lot 4, elle doit pouvoir se retirer d'un clic.
test('la recherche texte est une pastille retirable', () => {
  const chips = activeChips({ ...EMPTY_FILTERS, q: 'clio' }, FACETTES)
  assert.deepEqual(chips, [{ id: 'q', label: '« clio »', patch: { q: '' } }])
})

test('un écran sans filtre n’a aucune pastille', () => {
  assert.deepEqual(activeChips(EMPTY_FILTERS, FACETTES), [])
})

// Rouge sur le `sort: filters.sort` de `clearPatch` : « Tout effacer » efface
// les filtres. Remettre le tri à zéro ferait sauter la liste sous les yeux du
// marchand sans qu'il ait rien demandé là-dessus.
test('« Tout effacer » garde le tri choisi', () => {
  const patch = clearPatch({ ...EMPTY_FILTERS, brand: 'renault', sort: 'drop_desc' })
  assert.equal(patch.sort, 'drop_desc')
  assert.equal(patch.brand, '')
  assert.deepEqual(patch.fuel, [])
})
