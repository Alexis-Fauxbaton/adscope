import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_FILTERS, MAX_LIMIT, debounce, familyInputPatch, familyLabel, marketQuery,
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

test('une famille se réaffiche telle qu’elle se saisit', () => {
  assert.equal(familyLabel({ brand: 'Citroën', model: 'C3' }), 'Citroën C3')
  assert.equal(familyLabel({ brand: 'Citroën', model: '' }), 'Citroën')
})

// Rouge sur le `q ? params.set(…)` de `marketQuery` dans js/query.js : sans
// lui, la saisie libre du marchand ne partirait jamais vers l'API.
test('q part dans la requête, rogné, et se combine aux autres filtres', () => {
  assert.equal(q({ ...EMPTY_FILTERS, q: '  citroën c3  ' }), 'q=citro%C3%ABn+c3&limit=20')
  assert.equal(
    q({ ...EMPTY_FILTERS, q: 'clio', minAgeDays: 60 }),
    'q=clio&min_age_days=60&limit=20',
  )
  assert.equal(q({ ...EMPTY_FILTERS, q: '   ' }), 'limit=20')
})

const FAMILLES = [{ brand: 'Renault', model: 'Clio' }, { brand: 'Citroën', model: 'C3' }]

// Rouge sur le `match` de `familyInputPatch` dans js/query.js : une saisie
// qui reprend exactement une famille connue doit filtrer par marque/modèle
// exacts, pas par texte — et elle efface toute recherche `q` en cours.
test('une saisie qui reprend une famille connue devient un filtre exact', () => {
  assert.deepEqual(
    familyInputPatch('Renault Clio', FAMILLES),
    { brand: 'Renault', model: 'Clio', q: '' },
  )
  // Insensible à la casse et aux accents, comme la recherche texte.
  assert.deepEqual(
    familyInputPatch('renault clio', FAMILLES),
    { brand: 'Renault', model: 'Clio', q: '' },
  )
  assert.deepEqual(
    familyInputPatch('citroen c3', FAMILLES),
    { brand: 'Citroën', model: 'C3', q: '' },
  )
})

// Rouge sur le `return { brand: '', model: '', q: trimmed(text) }` de
// `familyInputPatch` : la saisie libre (« land rover », qu'aucune famille
// déclarée ne recouvre) doit partir telle quelle dans `q`, jamais coupée en
// mots — c'est le bug daté du 2026-09-18 que ce lot corrige.
test('une saisie libre part dans q sans être découpée, et désélectionne la famille', () => {
  assert.deepEqual(
    familyInputPatch('land rover', FAMILLES),
    { brand: '', model: '', q: 'land rover' },
  )
  // Même en tapant le début d'une famille connue : rien ne se cumule tant
  // que la saisie n'est pas la famille exacte.
  assert.deepEqual(
    familyInputPatch('Renault Cli', FAMILLES),
    { brand: '', model: '', q: 'Renault Cli' },
  )
  // Un champ vidé n'a plus ni famille ni recherche.
  assert.deepEqual(familyInputPatch('', FAMILLES), { brand: '', model: '', q: '' })
})

// Rouge sur le `timers.clearTimeout(handle)` de `debounce` dans js/query.js :
// sans lui, trois frappes rapprochées déclencheraient trois recherches au
// lieu d'une seule, à la fin de la pause. Minuterie posée à la main : le
// test ne connaît aucun vrai délai.
test('debounce n’agit qu’une fois la pause écoulée, avec le dernier appel', () => {
  let planifie = null
  let annules = 0
  const minuterie = {
    setTimeout: (fn) => { planifie = fn; return 1 },
    clearTimeout: () => { annules += 1 },
  }
  const appels = []
  const retarde = debounce((texte) => appels.push(texte), 300, minuterie)
  retarde('c')
  retarde('ci')
  retarde('cit')
  assert.equal(annules, 2)
  assert.deepEqual(appels, [])
  planifie()
  assert.deepEqual(appels, ['cit'])
})
