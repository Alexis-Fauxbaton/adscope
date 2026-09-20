import test from 'node:test'
import assert from 'node:assert/strict'
import { EMPTY_FILTERS } from '../js/query.js'
import { filtersFromHash, filtersFromQuery, hashOf, splitHash } from '../js/url-state.js'

// Rouge sur le `raw.indexOf('?')` de `splitHash` dans js/url-state.js : sans
// la coupure, la route vaudrait « #/marche?brand=Peugeot » et `app.js` ne
// reconnaîtrait plus aucune page — l'écran retomberait sur « Mes suivis ».
test('la route se lit avant les filtres, dans le même fragment', () => {
  assert.deepEqual(splitHash('#/marche?brand=Peugeot'), { route: '#/marche', query: 'brand=Peugeot' })
  assert.deepEqual(splitHash('#/suivis'), { route: '#/suivis', query: '' })
  assert.deepEqual(splitHash(''), { route: '#', query: '' })
})

// Rouge sur le `query ? … : route` de `hashOf` : un écran sans filtre doit
// donner « #/marche », pas « #/marche? » — sinon le premier affichage écrit
// déjà une entrée d'historique différente de l'adresse d'arrivée.
test('sans filtre, l’URL ne porte pas de point d’interrogation', () => {
  assert.equal(hashOf('#/marche', EMPTY_FILTERS), '#/marche')
})

const POSÉ = {
  ...EMPTY_FILTERS,
  q: 'clio', brand: 'renault', model: 'clio', sellerType: 'pro',
  minAgeDays: 60, dropped: true,
  priceMin: 5000, priceMax: 12000, yearMin: 2018, yearMax: null,
  mileageMin: null, mileageMax: 100000,
  fuel: ['essence', 'diesel'], gearbox: ['automatique'],
  region: ['ile-de-france'], department: ['92'],
  sort: 'drop_desc',
}

// Rouge sur n'importe laquelle des trois boucles de `filtersFromQuery` : un
// lien partagé doit rendre exactement l'écran de celui qui l'a envoyé. Le
// tour complet est la seule vérification qui le prouve.
test('l’URL et l’état se relisent l’un l’autre sans rien perdre', () => {
  const hash = hashOf('#/marche', POSÉ)
  assert.deepEqual(filtersFromHash(hash), POSÉ)
  assert.equal(
    hash,
    '#/marche?q=clio&brand=renault&model=clio&seller_type=pro&min_age_days=60'
    + '&dropped=true&price_min=5000&price_max=12000&year_min=2018&mileage_max=100000'
    + '&fuel=essence&fuel=diesel&gearbox=automatique&region=ile-de-france'
    + '&department=92&sort=drop_desc',
  )
})

// Rouge sur le `AGE_STEPS.includes(age)` et le `SORTS.includes(sort)` de
// `filtersFromQuery` : une URL est un texte qu'un inconnu a pu écrire. Une
// ancienneté de 47 jours ou un tri « le_moins_cher » n'ont aucun bouton à
// allumer dans l'écran ; les laisser passer enverrait un filtre invisible.
test('une valeur hors de l’écran retombe sur le défaut', () => {
  assert.equal(filtersFromQuery('min_age_days=47').minAgeDays, 0)
  assert.equal(filtersFromQuery('min_age_days=90').minAgeDays, 90)
  assert.equal(filtersFromQuery('sort=le_moins_cher').sort, 'age_desc')
  assert.equal(filtersFromQuery('sort=recent').sort, 'recent')
  assert.equal(filtersFromQuery('price_min=beaucoup').priceMin, null)
  assert.deepEqual(filtersFromQuery('fuel=&fuel=diesel').fuel, ['diesel'])
})

// Rouge sur le `params.get('dropped') === 'true'` : « dropped=false » dans
// l'URL doit laisser la case décochée, pas l'allumer parce qu'un paramètre
// existe.
test('« avec baisse » ne s’allume que sur la valeur vraie', () => {
  assert.equal(filtersFromQuery('dropped=false').dropped, false)
  assert.equal(filtersFromQuery('dropped=true').dropped, true)
  assert.equal(filtersFromQuery('').dropped, false)
})
