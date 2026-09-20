import test from 'node:test'
import assert from 'node:assert/strict'
import { EMPTY_FILTERS, badRange, facetsQuery, integer, marketQuery } from '../js/query.js'

// Le second volet des tests de `js/query.js` : les six bornes du contrat, les
// listes qui se répètent, et la requête des facettes. Séparé de
// `query.test.mjs` pour tenir la limite de lignes du dépôt.

const q = (filters, page) => String(marketQuery(filters, page))

// Rouge sur la boucle `for (const [key, name] of RANGES)` de `filterParams` :
// sans elle les six bornes du contrat ne partiraient jamais.
test('les six bornes du contrat s’écrivent en entiers', () => {
  assert.equal(
    q({
      ...EMPTY_FILTERS,
      priceMin: 5000, priceMax: 12000, yearMin: 2018, yearMax: 2021,
      mileageMin: 0, mileageMax: 100000,
    }),
    'price_min=5000&price_max=12000&year_min=2018&year_max=2021'
    + '&mileage_min=0&mileage_max=100000&limit=20',
  )
})

// Rouge sur le `Number.isFinite(n)` de `integer` dans js/query.js : une saisie
// en cours (« 1 2 », « douze ») partirait telle quelle et l'API répondrait 422
// au milieu d'une frappe.
test('une borne illisible ne part pas, une borne à zéro si', () => {
  assert.equal(integer('douze'), null)
  assert.equal(integer(''), null)
  assert.equal(integer(null), null)
  assert.equal(integer('0'), 0)
  assert.equal(integer('12000'), 12000)
  assert.equal(integer(2018.7), 2018)
  assert.equal(q({ ...EMPTY_FILTERS, priceMin: 'douze', priceMax: 0 }), 'price_max=0&limit=20')
})

// Rouge sur le `params.append(name, value)` de `filterParams` : `fuel` et ses
// semblables sont des listes côté API (`fuel=essence&fuel=diesel`), pas une
// valeur unique — un `set` écraserait le premier choix.
test('carburant, boîte, région et département se répètent', () => {
  assert.equal(
    q({ ...EMPTY_FILTERS, fuel: ['essence', 'diesel'], gearbox: ['automatique'], region: ['ile-de-france'], department: ['92', '75'] }),
    'fuel=essence&fuel=diesel&gearbox=automatique&region=ile-de-france'
    + '&department=92&department=75&limit=20',
  )
})

// Rouge sur le `facetsQuery` de js/query.js s'il ajoutait `sort`/`limit` : les
// compteurs portent sur le filtre entier, jamais sur une page ni sur un ordre.
test('la requête des facettes porte les filtres, sans tri ni pagination', () => {
  const filtres = { ...EMPTY_FILTERS, brand: 'Peugeot', sort: 'drop_desc', dropped: true }
  assert.equal(String(facetsQuery(filtres)), 'brand=Peugeot&dropped=true')
})

// Rouge sur le `a > b` de `badRange` dans js/query.js : min > max est un 422
// côté API — l'écran doit le voir avant d'envoyer.
test('une fourchette à l’envers se reconnaît, une fourchette à demi posée non', () => {
  assert.equal(badRange(12000, 5000), true)
  assert.equal(badRange(5000, 12000), false)
  assert.equal(badRange(5000, 5000), false)
  assert.equal(badRange(12000, null), false)
  assert.equal(badRange(null, 5000), false)
})
