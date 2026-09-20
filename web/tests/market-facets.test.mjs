import test from 'node:test'
import assert from 'node:assert/strict'
import { EMPTY_FILTERS, facetsQuery, marketQuery } from '../js/query.js'
import {
  activeCount, anyBadRange, coverage, coverageLine, departmentLabel, labelFor, modelsFor,
  optionFor, panelCount, withoutBadRanges,
} from '../js/market-facets.js'

const MARQUES = [
  { key: 'citroen', label: 'Citroën', count: 812 },
  { key: 'peugeot', label: 'Peugeot', count: 1240 },
]

// Rouge sur le second `options.find(…)` de `optionFor` dans
// js/market-facets.js : le contrat accepte la clé canonique *et* l'écriture
// affichée. Un lien partagé qui porte « Citroën » doit retrouver son option,
// sinon la liste afficherait « Toutes les marques » alors que le filtre agit.
test('une option se retrouve par sa clé comme par son écriture affichée', () => {
  assert.equal(optionFor(MARQUES, 'citroen').label, 'Citroën')
  assert.equal(optionFor(MARQUES, 'Citroën').label, 'Citroën')
  assert.equal(optionFor(MARQUES, 'CITROEN').label, 'Citroën')
  assert.equal(optionFor(MARQUES, 'Ferrari'), null)
  assert.equal(optionFor(MARQUES, ''), null)
})

// Rouge sur le repli `: (value || fallback)` de `labelFor` : une marque
// absente des compteurs (parce que ses annonces sont toutes exclues par un
// autre filtre) doit quand même se nommer sur sa pastille.
test('un libellé inconnu se dit tel quel plutôt que de disparaître', () => {
  assert.equal(labelFor(MARQUES, 'peugeot'), 'Peugeot')
  assert.equal(labelFor(MARQUES, 'ferrari'), 'ferrari')
  assert.equal(labelFor(MARQUES, '', 'Toutes les marques'), 'Toutes les marques')
})

// Rouge sur le `if (!total || total <= 0) return null` de `coverage` : sur
// zéro annonce, « 0 % » serait une mesure inventée — il n'y a rien à mesurer.
test('la couverture ne se calcule que s’il y a quelque chose à mesurer', () => {
  assert.equal(coverage(100, 88), 12)
  assert.equal(coverage(100, 0), 100)
  assert.equal(coverage(0, 0), null)
  assert.equal(coverage(null, 3), null)
})

// Rouge sur le `if (!unknown) return ''` de `coverageLine` : un champ complet
// n'a aucune réserve à afficher, et une ligne « connu sur 100 % » sous chaque
// filtre serait du bruit permanent.
test('la ligne d’honnêteté ne paraît que sur un champ incomplet', () => {
  assert.equal(
    coverageLine('fuel', [{ count: 7 }, { count: 5 }], 88),
    'Carburant connu sur 12 % des annonces — le reste se complète au fil des passages.',
  )
  assert.equal(
    coverageLine('location', [{ count: 8400 }], 47600),
    'Lieu connu sur 15 % des annonces — le reste se complète au fil des passages.',
  )
  // Le participe suit le genre du sujet : « Boîte connu » se voit à l'écran.
  assert.match(coverageLine('gearbox', [{ count: 3 }], 97), /^Boîte connue sur 3 %/)
  assert.equal(coverageLine('gearbox', [{ count: 100 }], 0), '')
  assert.equal(coverageLine('gearbox', [], 0), '')
})

// Rouge sur le `known + unknown` de `coverageLine` : une facette se compte
// sans son propre filtre, donc sur un autre ensemble que `facets.total`.
// Prendre le total affiché comme dénominateur donnerait « connu sur 320 % »
// dès qu'un filtre carburant est posé.
test('la couverture se mesure sur la facette, pas sur le total affiché', () => {
  // 12 annonces au carburant connu, 88 sans — quel que soit le total montré.
  assert.match(coverageLine('fuel', [{ count: 12 }], 88), /sur 12 %/)
})

// Rouge sur le `filters.brand ?` de `modelsFor` : le contrat ne rend des
// modèles que si une marque est choisie ; afficher une liste restée en place
// après avoir retiré la marque proposerait des 208 sous « toutes marques ».
test('les modèles n’existent qu’avec une marque choisie', () => {
  const facettes = { models: [{ key: '208', label: '208', count: 12 }] }
  assert.equal(modelsFor(facettes, { brand: 'peugeot' }).length, 1)
  assert.deepEqual(modelsFor(facettes, { brand: '' }), [])
})

// Rouge sur la boucle `for (const g of RANGE_GROUPS)` de `activeCount` : une
// fourchette est *un* filtre. Compter ses deux bornes annoncerait
// « Filtres (2) » au marchand qui n'en a posé qu'un.
test('le compteur du mobile compte des filtres, pas des bornes', () => {
  assert.equal(activeCount(EMPTY_FILTERS), 0)
  assert.equal(activeCount({ ...EMPTY_FILTERS, priceMin: 5000, priceMax: 12000 }), 1)
  assert.equal(activeCount({ ...EMPTY_FILTERS, priceMin: 5000 }), 1)
  assert.equal(activeCount({ ...EMPTY_FILTERS, fuel: ['essence', 'diesel'] }), 2)
  assert.equal(
    activeCount({ ...EMPTY_FILTERS, q: 'clio', brand: 'renault', minAgeDays: 60, dropped: true }),
    4,
  )
  // Le tri n'est pas un filtre : il ne retire aucune annonce de la liste.
  assert.equal(activeCount({ ...EMPTY_FILTERS, sort: 'drop_desc' }), 0)
})

// Rouge sur `anyBadRange` dans js/market-facets.js : sans lui, une fourchette
// à l'envers partirait vers l'API, qui répondrait 422 — et l'écran dirait
// « L'API n'a pas répondu » pour une saisie que le panneau signale déjà.
test('une fourchette à l’envers se reconnaît sur les trois champs', () => {
  assert.equal(anyBadRange(EMPTY_FILTERS), false)
  assert.equal(anyBadRange({ ...EMPTY_FILTERS, priceMin: 30000, priceMax: 5000 }), true)
  assert.equal(anyBadRange({ ...EMPTY_FILTERS, yearMin: 2021, yearMax: 2018 }), true)
  assert.equal(anyBadRange({ ...EMPTY_FILTERS, mileageMin: 10, mileageMax: 200000 }), false)
})

// Rouge sur le `if (badRange(…))` de `withoutBadRanges` dans
// js/market-facets.js : sans lui, une adresse partagée portant une marque
// valide *et* une fourchette inversée laissait la garde de market.js couper
// tout l'appel aux facettes — marque et modèle retombaient sur « Toutes »,
// et la fourchette fautive, elle, restait dans la requête au lieu d'être
// seule écartée.
test('une fourchette à l’envers est seule écartée, pas le reste des filtres', () => {
  const filtres = {
    ...EMPTY_FILTERS, brand: 'renault', model: 'clio', priceMin: 30000, priceMax: 10000,
  }
  const nettoyés = withoutBadRanges(filtres)
  assert.equal(nettoyés.priceMin, null)
  assert.equal(nettoyés.priceMax, null)
  assert.equal(nettoyés.brand, 'renault')
  assert.equal(nettoyés.model, 'clio')
  // Ce que market.js envoie réellement : un appel part, sans la fourchette.
  assert.equal(String(facetsQuery(nettoyés)), 'brand=renault&model=clio')
  assert.equal(String(marketQuery(nettoyés)), 'brand=renault&model=clio&limit=20')
  // Une fourchette valide, elle, n'est jamais touchée.
  const posée = { ...EMPTY_FILTERS, priceMin: 5000, priceMax: 12000 }
  assert.deepEqual(withoutBadRanges(posée), posée)
})

// Rouge sur le `option.label ? … : option.key` de `departmentLabel` : sans le
// repli, un département sans libellé afficherait « 92 · undefined » plutôt
// que « 92 » tout seul.
test('un département affiche son code et son nom, ou son code seul', () => {
  assert.equal(departmentLabel({ key: '92', label: 'Hauts-de-Seine' }), '92 · Hauts-de-Seine')
  assert.equal(departmentLabel({ key: '92', label: null }), '92')
  assert.equal(departmentLabel(null, '92'), '92')
})

// Rouge sur `panelCount` dans js/market-facets.js : ce qui décide si une
// adresse partagée arrive panneau ouvert. La recherche, la marque,
// l'ancienneté et la baisse se voient dans la rangée — elles n'ont pas à
// déplier quoi que ce soit.
test('seuls les filtres du panneau font ouvrir le panneau', () => {
  assert.equal(panelCount({ ...EMPTY_FILTERS, q: 'clio', brand: 'renault', minAgeDays: 60, dropped: true }), 0)
  assert.equal(panelCount({ ...EMPTY_FILTERS, priceMax: 20000 }), 1)
  assert.equal(panelCount({ ...EMPTY_FILTERS, sellerType: 'pro' }), 1)
  assert.equal(panelCount({ ...EMPTY_FILTERS, department: ['92'] }), 1)
})
