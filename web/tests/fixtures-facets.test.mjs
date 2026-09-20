import test from 'node:test'
import assert from 'node:assert/strict'
import { facets } from '../js/fixtures.js'
import { facetsQuery } from '../js/query.js'
import { EMPTY_FILTERS } from '../js/query.js'

const f = (filters) => facets(facetsQuery({ ...EMPTY_FILTERS, ...filters }))
const clés = (rows) => rows.map((r) => r.key)

// Rouge sur le `sans('')` de `facetsOf` dans js/fixtures-facets.js : le total
// porte sur *tous* les filtres, c'est le « N annonces » de l'écran.
test('le total suit tous les filtres', () => {
  assert.equal(f({}).total, 54)
  assert.ok(f({ brand: 'peugeot' }).total < 54)
  assert.equal(f({ brand: 'peugeot' }).total, 9)
})

// Rouge sur le `skip` de `matches` (js/fixtures-filter.js), exercé par
// `sans('fuel')` : c'est LA règle du lot. Choisir « diesel » ne doit pas vider
// la liste des carburants, sinon on ne peut plus passer à « essence » sans
// tout défaire d'abord.
test('une facette se compte sans son propre filtre', () => {
  const libre = f({})
  const dieselisé = f({ fuel: ['diesel'] })
  assert.deepEqual(clés(dieselisé.fuel), clés(libre.fuel))
  assert.ok(clés(dieselisé.fuel).includes('essence'))
  // Et les autres filtres, eux, s'appliquent bien à la facette carburant.
  assert.ok(f({ brand: 'renault' }).fuel.length < libre.fuel.length)
})

// Rouge sur le même `skip`, côté marques : filtrer sur Peugeot ne doit pas
// réduire la liste des marques à Peugeot — on n'en changerait plus jamais.
test('choisir une marque laisse les autres marques choisissables', () => {
  const marques = f({ brand: 'peugeot' }).brands
  assert.ok(marques.length > 20)
  assert.ok(clés(marques).includes('renault'))
})

// Rouge sur le `sans(['brand', 'model'])` de `facetsOf` : avec le seul
// `'brand'`, choisir « Renault Clio » ne laisserait que Renault dans la liste
// des marques — « Clio » n'existe que chez elle. Le marchand serait enfermé :
// plus moyen de passer à Peugeot sans défaire le modèle d'abord.
test('un modèle choisi n’enferme pas dans sa marque', () => {
  const marques = f({ brand: 'renault', model: 'clio' }).brands
  assert.ok(clés(marques).includes('peugeot'))
  assert.ok(marques.length > 20)
  // Les modèles, eux, restent bien ceux de la marque choisie.
  assert.deepEqual(clés(f({ brand: 'renault', model: 'clio' }).models).sort(), ['captur', 'clio', 'megane', 'zoe'])
})

// Rouge sur le `sort((a, b) => b.count - a.count …)` de `tally` : une liste
// de vingt-quatre marques que le marchand doit lire dans l'ordre alphabétique
// pour trouver la sienne n'aide personne ; le contrat dit compte décroissant.
test('les marques viennent par compte décroissant', () => {
  const marques = f({}).brands
  for (let i = 1; i < marques.length; i += 1) {
    assert.ok(marques[i - 1].count >= marques[i].count)
  }
  assert.equal(marques[0].key, 'peugeot')
})

// Rouge sur le `if (!brand) return []` de `models` : le contrat ne rend des
// modèles qu'une marque choisie.
test('les modèles n’arrivent qu’avec une marque', () => {
  assert.deepEqual(f({}).models, [])
  assert.ok(f({ brand: 'peugeot' }).models.length > 0)
})

// Rouge sur le `[...rows.filter(…), ...autres]` de `models` : « Modèle non
// précisé » est un fourre-tout, pas un modèle. En tête de liste il donnerait
// l'impression que la marque n'a rien d'autre à offrir.
test('« Modèle non précisé » ferme la liste des modèles', () => {
  const modèles = f({ brand: 'peugeot' }).models
  assert.equal(modèles[modèles.length - 1].key, 'autres')
  assert.equal(modèles[modèles.length - 1].label, 'Modèle non précisé')
  assert.equal(modèles[0].key, '208')
})

// Rouge sur `unknowns` dans js/fixtures-facets.js : sans ce compte, l'écran
// laisserait croire qu'un filtre carburant a vu tout le marché, alors que le
// champ n'est rempli que sur les annonces revues depuis le 2026-09-19.
test('les champs partiels déclarent ce qu’ils ne savent pas', () => {
  const libre = f({})
  const connus = libre.fuel.reduce((n, r) => n + r.count, 0)
  assert.equal(connus + libre.fuel_unknown, 54)
  assert.ok(libre.fuel_unknown > connus)
  assert.equal(libre.gearbox_unknown + libre.gearbox.reduce((n, r) => n + r.count, 0), 54)
  assert.equal(
    libre.location_unknown + libre.departments.reduce((n, r) => n + r.count, 0),
    54,
  )
})

// Rouge sur le `tally(sans('region'), …, (i) => i.region_label)` : la facette
// doit porter l'écriture officielle, celle qu'on affiche, pas la clé d'URL.
test('une région porte son nom officiel et sa clé', () => {
  const idf = f({}).regions.find((r) => r.key === 'ile-de-france')
  assert.equal(idf.label, 'Île-de-France')
  assert.equal(idf.count, 3)
})

// Rouge sur le `label: DEPARTMENT_LABELS[key] || null` de `facetsOf` : sans
// lui, la liste des départements ne porterait que des codes, et l'écran
// afficherait « 92 » au lieu de « 92 · Hauts-de-Seine ».
test('un département porte son code et son nom', () => {
  const idf = f({}).departments.find((d) => d.key === '92')
  assert.equal(idf.label, 'Hauts-de-Seine')
  assert.equal(idf.count, 1)
})

// Rouge sur le `sans(['region', 'department'])` de `facetsOf` : avec le seul
// `'region'`, choisir un département enfermerait la liste des régions dans
// celle du département choisi — le même cul-de-sac que la marque sans le
// modèle.
test('un département choisi n’enferme pas dans sa région', () => {
  const régions = f({ region: ['ile-de-france'], department: ['92'] }).regions
  assert.ok(clés(régions).includes('auvergne-rhone-alpes'))
  assert.ok(régions.length > 1)
})

// Rouge sur le `span(sans('price'), 'price')` de `facetsOf` : les bornes
// suggérées servent à *élargir* la fourchette posée. Les recalculer dedans
// les enfermerait sur ce que le marchand vient de saisir.
test('les bornes suggérées ignorent la fourchette déjà posée', () => {
  const libre = f({}).ranges
  const serré = f({ priceMin: 20000, priceMax: 25000 }).ranges
  assert.deepEqual(serré.price, libre.price)
  assert.equal(libre.price.min, 5990)
  assert.equal(libre.year.min, 1969)
})

// Rouge sur le `inList` de js/fixtures-filter.js : une annonce dont le
// carburant n'est pas relevé ne « passe » pas un filtre carburant — elle
// n'est pas décidée, et la compter serait une invention.
test('un filtre sur un champ partiel ne ramasse pas les annonces muettes', () => {
  const essence = f({ fuel: ['essence'] })
  const connu = f({}).fuel.find((r) => r.key === 'essence').count
  assert.equal(essence.total, connu)
  assert.ok(essence.total > 0)
  // Deux carburants cochés ramassent la somme des deux, pas plus.
  const diesel = f({}).fuel.find((r) => r.key === 'diesel').count
  assert.equal(f({ fuel: ['essence', 'diesel'] }).total, connu + diesel)
})
