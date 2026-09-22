import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { CARDS, FICHES, fiche, results } from './lc-page.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
require(join(here, '../src/sites.js'))
require(join(here, '../src/sites/read.js'))
const VF = require(join(here, '../src/sites/vehicle-fields.js'))
const leboncoin = require(join(here, '../src/sites/leboncoin.js'))
const lacentrale = require(join(here, '../src/sites/lacentrale.js'))

const load = (name) => JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'))

// Département : Corse en 2A/2B selon 20200, DOM sur 3 chiffres, 2 sinon. Les
// trois exemples du lot (docs/roadmap.md, programme « recherche filtrée »).
test('le département se dérive du code postal complet', () => {
  assert.equal(VF.department('75015'), '75')
  assert.equal(VF.department('20000'), '2A')
  assert.equal(VF.department('20199'), '2A')
  assert.equal(VF.department('20200'), '2B')
  assert.equal(VF.department('97400'), '974')
  assert.equal(VF.department('9740'), null)
  assert.equal(VF.department(null), null)
})

// leboncoin — cartes : fixture `leboncoin-champs-cartes.json`, réduite depuis
// une page de résultats réelle (2026-09-19). La Réunion y porte `department_id
// : "0"` — non fiable, vérifié en le laissant de côté au profit du CP.
test('leboncoin — cartes : carburant, boîte et département tels qu\'observés', () => {
  const [kuga, electric, corolla] = load('leboncoin-champs-cartes.json').map(leboncoin.normalize)
  assert.equal(kuga.fuel, 'electrique')
  assert.equal(kuga.gearbox, 'automatique')
  assert.equal(kuga.department, '79')
  assert.equal(kuga.postalCode, '79000')
  assert.equal(electric.fuel, 'electrique')
  assert.equal(electric.gearbox, 'manuelle')
  assert.equal(electric.department, '69')
  // Rouge sur `VF.withZip` si `department_id` l'emportait sur le CP : la carte
  // Réunion porte `department_id: "0"`, la fixture porte 97410 dans `zipcode`.
  assert.equal(corolla.department, '974')
  assert.notEqual(corolla.department, '0')
  assert.equal(corolla.postalCode, '97410')
})

// leboncoin — fiches : deux fiches ouvertes en direct, même forme que la carte.
test('leboncoin — fiches : la même lecture qu\'une carte', () => {
  const [corolla, niro] = load('leboncoin-champs-fiches.json').map(leboncoin.normalize)
  assert.equal(corolla.fuel, 'hybride')
  assert.equal(corolla.gearbox, 'automatique')
  assert.equal(corolla.department, '974')
  assert.equal(niro.fuel, 'hybride_rechargeable')
  assert.equal(niro.gearbox, 'automatique')
  assert.equal(niro.department, '50')
  assert.equal(niro.postalCode, '50220')
})

// leboncoin — les neuf codes fuel et les deux codes gearbox, tels que relevés
// le 2026-09-19 (fixture `leboncoin-champs-codes.json`, complétude confirmée
// par `aggregations.fuel`/`.gearbox`). GNV (7) et Hydrogène (9) ont leur
// propre case depuis le 2026-09-19 ; « autre » ne garde plus que le code 5.
test('leboncoin — chaque code fuel connu se traduit dans le vocabulaire fermé', () => {
  const EXPECTED = { 1: 'essence', 2: 'diesel', 3: 'gpl', 4: 'electrique', 5: 'autre', 6: 'hybride', 7: 'gnv', 8: 'hybride_rechargeable', 9: 'hydrogene' }
  for (const [code, label] of Object.entries(load('leboncoin-champs-codes.json').fuel)) {
    const ad = { list_id: code, attributes: [{ key: 'fuel', value: code, value_label: label }] }
    assert.equal(leboncoin.normalize(ad).fuel, EXPECTED[code], `code ${code} (${label})`)
  }
})

// Miroir de `FUEL_VALUES`/`GEARBOX_VALUES` côté API (api/adscope_api/vocab.py) :
// les deux vocabulaires sont tenus à la main en l'absence d'un fichier
// `shared/` commun pour ce genre de liste aujourd'hui (il en existe un pour
// l'empreinte véhicule, `shared/fingerprint-vectors.json` — rien d'équivalent
// ici). Ce test fige la liste traduite ici pour qu'un écart avec l'API
// (`test_the_fuel_vocabulary_matches_what_the_extension_sends`) se voie au
// diff plutôt qu'en silence. `ethanol` (lot F2) entre côté API sans entrer ici :
// la table `FUEL` de leboncoin (1..9) n'a aucun code pour lui — rien inventé,
// voir `extension/tests/lacentrale-fuel.test.mjs` pour La Centrale, qui l'a.
// Neuf valeurs ici, dix côté API : l'écart est celui-là, et lui seul.
test('leboncoin — le vocabulaire fuel traduit correspond à celui que l\'API accepte', () => {
  const EXPECTED = { 1: 'essence', 2: 'diesel', 3: 'gpl', 4: 'electrique', 5: 'autre', 6: 'hybride', 7: 'gnv', 8: 'hybride_rechargeable', 9: 'hydrogene' }
  const translated = new Set(Object.keys(EXPECTED).map((code) => leboncoin.normalize(
    { list_id: code, attributes: [{ key: 'fuel', value: code }] },
  ).fuel))
  assert.deepEqual([...translated].sort(), [
    'autre', 'diesel', 'electrique', 'essence', 'gnv', 'gpl', 'hybride', 'hybride_rechargeable', 'hydrogene',
  ])
})

test('leboncoin — chaque code boîte connu se traduit dans le vocabulaire fermé', () => {
  const EXPECTED = { 1: 'manuelle', 2: 'automatique' }
  for (const [code, label] of Object.entries(load('leboncoin-champs-codes.json').gearbox)) {
    const ad = { list_id: code, attributes: [{ key: 'gearbox', value: code, value_label: label }] }
    assert.equal(leboncoin.normalize(ad).gearbox, EXPECTED[code], `code ${code} (${label})`)
  }
})

// Un code hors table : jamais deviné en « autre » ici — c'est l'API qui range
// et journalise, l'extension transmet ce que la page a réellement dit.
test('leboncoin — un code fuel inconnu part tel qu\'observé (son libellé), pas deviné', () => {
  const ad = { list_id: 1, attributes: [{ key: 'fuel', value: '42', value_label: 'Mystère' }] }
  assert.equal(leboncoin.normalize(ad).fuel, 'Mystère')
})

test('leboncoin — sans libellé, le code brut part tel quel', () => {
  const ad = { list_id: 1, attributes: [{ key: 'fuel', value: '42' }] }
  assert.equal(leboncoin.normalize(ad).fuel, '42')
})

// Rouge sur `place`/`VF.withZip` de `leboncoin.js` : une annonce sans ces
// champs part comme avant, les quatre valent `null`, rien n'est inventé.
test('leboncoin — une annonce sans ces champs part comme avant', () => {
  const l = leboncoin.normalize({
    list_id: 99, price: [1], owner: { type: 'pro' }, attributes: [],
    first_publication_date: '2026-09-01 10:00:00', index_date: '2026-09-01 10:00:00',
  })
  assert.equal(l.fuel, null)
  assert.equal(l.gearbox, null)
  assert.equal(l.department, null)
  assert.equal(l.postalCode, null)
})

// Sans code postal complet, le département vient de la carte plutôt que de
// rester vide — mais un nom de ville seul ne donne toujours rien.
test('leboncoin — sans code postal, le département vient de `department_id`', () => {
  const withDept = leboncoin.normalize({ list_id: 1, attributes: [], location: { department_id: '93' } })
  assert.equal(withDept.department, '93')
  assert.equal(withDept.postalCode, null)
  const cityOnly = leboncoin.normalize({ list_id: 2, attributes: [], location: { city: 'Paris' } })
  assert.equal(cityOnly.department, null)
})

// La Centrale — cartes : les six références de la page sauvegardée à la
// racine du dépôt, retrouvées dans la fixture existante par leur référence et
// enrichies des champs relevés le 2026-09-19 (`lacentrale-champs-cartes.json`).
const CHAMPS_CARTES = load('lacentrale-champs-cartes.json')
const withChamps = (c) => {
  const extra = CHAMPS_CARTES.find((x) => x.reference === c.reference)
  return extra ? { ...c, energy: extra.vehicle.energy, gearbox: extra.vehicle.gearbox, visitPlace: extra.location.visitPlace } : c
}

test('La Centrale — cartes : énergie, boîte et département tels qu\'observés', () => {
  const byRef = new Map(lacentrale.fromScripts(results(CARDS.map(withChamps))).map((l) => [l.siteId, l]))
  assert.equal(byRef.get('W103536233').fuel, 'diesel')
  assert.equal(byRef.get('W103536233').gearbox, 'manuelle')
  assert.equal(byRef.get('W103536233').department, '93')
  // Aucun code postal ni aucune ville sur cette surface : rien à en dériver.
  assert.equal(byRef.get('W103536233').postalCode, null)
  assert.equal(byRef.get('W103527802').fuel, 'essence')
  assert.equal(byRef.get('W103527802').gearbox, 'automatique')
  assert.equal(byRef.get('W103527802').department, '75')
})

// La Centrale — fiches : les deux fiches sauvegardées à la racine du dépôt,
// mêmes références que `FICHES.uncapped`/`.capped` déjà en fixture ; le
// vocabulaire de boîte diffère de la carte (MECANIQUE/AUTOMATIQUE, pas
// MANUAL/AUTO) et se canonise vers le même mot.
test('La Centrale — fiche : le code postal du vendeur donne le département', () => {
  const [uncapped] = lacentrale.fromScripts(fiche(FICHES.uncapped, {
    sellerName: 'CW AUTOMOBILES', visitPlace: '92', energy: 'ESSENCE', gearboxType: 'MECANIQUE',
    sellerZip: '92120', sellerCity: 'MONTROUGE',
  }))
  assert.equal(uncapped.fuel, 'essence')
  assert.equal(uncapped.gearbox, 'manuelle')
  assert.equal(uncapped.department, '92')
  assert.equal(uncapped.postalCode, '92120')

  const [capped] = lacentrale.fromScripts(fiche(FICHES.capped, {
    lastname: 'F', visitPlace: '85', energy: 'ESSENCE', gearboxType: 'AUTOMATIQUE',
    sellerZip: '85300', sellerCity: 'CHALLANS',
  }))
  assert.equal(capped.fuel, 'essence')
  assert.equal(capped.gearbox, 'automatique')
  assert.equal(capped.department, '85')
  assert.equal(capped.postalCode, '85300')
})

// Un mot hors table (énergie ou boîte jamais observée sur ce site) : transmis
// tel quel, jamais deviné — seuls ESSENCE/DIESEL et les quatre mots de boîte
// ont été vus pendant la reconnaissance.
test('La Centrale — un mot inconnu part tel qu\'observé', () => {
  const [weird] = lacentrale.fromScripts(results([{ ...CARDS[0], energy: 'HYBRIDE', gearbox: 'SEMI_AUTO' }]))
  assert.equal(weird.fuel, 'HYBRIDE')
  assert.equal(weird.gearbox, 'SEMI_AUTO')
})

test('La Centrale — une carte sans ces champs part comme avant', () => {
  const [plain] = lacentrale.fromScripts(results([CARDS[0]]))
  assert.equal(plain.fuel, null)
  assert.equal(plain.gearbox, null)
  assert.equal(plain.department, null)
  assert.equal(plain.postalCode, null)
})

// L'empreinte véhicule (shared/fingerprint.md) ne porte que brand/model/
// version/year/mileage : les quatre nouveaux champs sont purement additifs,
// vérifié ici sur les mêmes fixtures que ci-dessus.
test('les nouveaux champs n\'altèrent pas ceux de l\'empreinte véhicule', () => {
  const [kuga] = load('leboncoin-champs-cartes.json').map(leboncoin.normalize)
  assert.equal(kuga.brand, 'Ford')
  assert.equal(kuga.model, 'Kuga')
  const [uncapped] = lacentrale.fromScripts(fiche(FICHES.uncapped, { visitPlace: '92', energy: 'ESSENCE', sellerZip: '92120' }))
  assert.equal(uncapped.brand, 'Peugeot')
  assert.equal(uncapped.model, '208')
  assert.equal(uncapped.version, '1.2 VTI 82 ACTIVE 5P')
  assert.equal(uncapped.year, 2013)
  assert.equal(uncapped.mileage, 108818)
})
