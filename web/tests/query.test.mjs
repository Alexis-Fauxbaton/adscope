import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_FILTERS, MAX_LIMIT, familyLabel, marketQuery, parseFamily,
} from '../js/query.js'

const q = (filters, page) => String(marketQuery(filters, page))

// Rouge sur chacun des `if (…)` de `marketQuery` dans js/query.js : un
// paramètre vide envoyé (`brand=`, `seller_type=`) est une demande que le
// marchand n'a pas faite, et que l'API n'a aucune raison d'interpréter.
test('un filtre vide ne s’écrit pas dans la requête', () => {
  assert.equal(q(EMPTY_FILTERS), 'limit=20')
})

// Rouge sur le `filters.sort !== DEFAULT_SORT` de js/query.js : répéter la
// valeur par défaut fait deux URL pour un même écran.
test('le tri par défaut ne s’écrit pas, les autres si', () => {
  assert.equal(q({ ...EMPTY_FILTERS, sort: 'age_desc' }), 'limit=20')
  assert.equal(q({ ...EMPTY_FILTERS, sort: 'drop_desc' }), 'sort=drop_desc&limit=20')
})

// Rouge sur le `trimmed()` de js/query.js : « Peugeot » collé avec une espace
// de fin ne filtre rien du tout côté API.
test('la marque et le modèle sont rognés avant d’être envoyés', () => {
  assert.equal(
    q({ ...EMPTY_FILTERS, brand: '  Peugeot ', model: ' 208 ' }),
    'brand=Peugeot&model=208&limit=20',
  )
  assert.equal(q({ ...EMPTY_FILTERS, brand: '   ' }), 'limit=20')
})

// Rouge sur le `filters.minAgeDays > 0` de js/query.js : « tous » vaut 0, et
// `min_age_days=0` n'est pas un filtre, c'est du bruit.
test('« tous » en ancienneté n’écrit pas de borne', () => {
  assert.equal(q({ ...EMPTY_FILTERS, minAgeDays: 0 }), 'limit=20')
  assert.equal(q({ ...EMPTY_FILTERS, minAgeDays: 60 }), 'min_age_days=60&limit=20')
})

// Rouge sur le `if (filters.dropped)` de js/query.js : « dropped=false » se
// lirait comme « les annonces sans baisse », qui n'est pas ce qu'on demande.
test('« avec baisse » ne s’écrit que quand il est coché', () => {
  assert.equal(q({ ...EMPTY_FILTERS, dropped: false }), 'limit=20')
  assert.equal(q({ ...EMPTY_FILTERS, dropped: true }), 'dropped=true&limit=20')
})

// Rouge sur le `Math.min(…, MAX_LIMIT)` de js/query.js : le contrat borne
// `limit` à 100, et au-delà l'API refuse — donc un écran vide là où tout est.
test('limit est borné à ce que le contrat accepte', () => {
  assert.equal(q(EMPTY_FILTERS, { limit: 500 }), `limit=${MAX_LIMIT}`)
  assert.equal(q(EMPTY_FILTERS, { limit: 0 }), 'limit=1')
})

// Rouge sur le `if (offset > 0)` de js/query.js : la première page n'a pas
// d'offset à déclarer.
test('l’offset ne s’écrit qu’à partir de la deuxième page', () => {
  assert.equal(q(EMPTY_FILTERS, { limit: 20, offset: 0 }), 'limit=20')
  assert.equal(q(EMPTY_FILTERS, { limit: 20, offset: 20 }), 'limit=20&offset=20')
})

test('un filtre complet s’écrit en entier', () => {
  assert.equal(
    q({
      brand: 'Renault', model: 'Clio', sellerType: 'pro',
      minAgeDays: 90, dropped: true, sort: 'drop_desc',
    }, { limit: 20, offset: 40 }),
    'brand=Renault&model=Clio&seller_type=pro&min_age_days=90'
    + '&dropped=true&sort=drop_desc&limit=20&offset=40',
  )
})

// Rouge sur le `words.slice(1).join(' ')` de `parseFamily` dans js/query.js :
// « Peugeot 208 II » a un modèle en deux mots, qu'on ne coupe pas.
test('la saisie libre se coupe en marque puis modèle, le reste au modèle', () => {
  assert.deepEqual(parseFamily('Peugeot 208'), { brand: 'Peugeot', model: '208' })
  assert.deepEqual(parseFamily('Peugeot 208 II'), { brand: 'Peugeot', model: '208 II' })
  assert.deepEqual(parseFamily('  Renault  '), { brand: 'Renault', model: '' })
  assert.deepEqual(parseFamily(''), { brand: '', model: '' })
})

test('une famille se réaffiche telle qu’elle se saisit', () => {
  assert.equal(familyLabel({ brand: 'Citroën', model: 'C3' }), 'Citroën C3')
  assert.equal(familyLabel({ brand: 'Citroën', model: '' }), 'Citroën')
})
