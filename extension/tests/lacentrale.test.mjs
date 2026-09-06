import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { CARDS, FICHES, fiche, results } from './lc-page.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
// Le module de site se déclare au registre et lit la page avec les outils
// communs : les deux se chargent avant lui, comme le manifeste les déclare.
require(join(here, '../src/sites.js'))
require(join(here, '../src/sites/read.js'))
const site = require(join(here, '../src/sites/lacentrale.js'))
const { fromDocument, fromScripts, signals, claim, displayed } = site

// Le jour du relevé : 23 jours après la mise en ligne de la fiche non plafonnée.
const NOW = new Date('2026-09-06T18:00:00Z')
const days = (l) => signals(l, NOW).onlineDays

const listings = fromScripts(results(CARDS))
const uncapped = fromScripts(fiche(FICHES.uncapped, { sellerName: 'CW AUTOMOBILES' }))[0]
const capped = fromScripts(fiche(FICHES.capped, { lastname: 'F' }))[0]

test('la fiche non plafonnée rend son ancienneté exacte', () => {
  assert.equal(uncapped.site, 'lc')
  assert.equal(uncapped.siteId, 'W103538172')
  assert.equal(uncapped.publishedAt.toISOString(), '2026-08-14T13:05:57.895Z')
  assert.equal(days(uncapped), 23)
})

// Le cœur du lot : le compteur du site sature à 60 jours, la page transporte
// pourtant la date exacte — cinq ans en ligne.
test('la fiche plafonnée rend 1 810 jours, jamais 60', () => {
  assert.equal(capped.siteId, 'B101733515')
  assert.equal(capped.publishedAt.toISOString(), '2021-09-22T16:17:55.120Z')
  assert.equal(days(capped), 1810)
  assert.notEqual(days(capped), 60)
  assert.equal(signals(capped, NOW).capped, true)
  assert.equal(signals(uncapped, NOW).capped, false)
})

test('la contradiction est nommée avec le libellé du site', () => {
  const c = claim(signals(capped, NOW), 'Publiée il y a 60 jours')
  assert.equal(c.says, 'Publiée il y a 60 jours')
  assert.match(c.label, /La Centrale/)
  assert.match(c.note, /60/)
  // Sous le plafond, le site dit vrai : rien à opposer.
  assert.equal(claim(signals(uncapped, NOW), 'Publiée il y a 23 jours'), null)
})

test('le libellé est lu par son texte, jamais par une classe de build', () => {
  const src = readFileSync(join(here, '../src/sites/lacentrale.js'), 'utf8')
  assert.equal(/__SLIVb|__0sGLk|querySelector\(['"`]\./.test(src), false)
  const node = (text) => ({ textContent: text, children: [] })
  const doc = {
    querySelectorAll: (sel) =>
      sel === 'script'
        ? fiche(FICHES.capped).map((t) => ({ textContent: t, children: [] }))
        : [node('Réf. annonce : B101733515'), node('Publiée il y a 60 jours')],
  }
  assert.equal(displayed(doc), 'Publiée il y a 60 jours')
  assert.equal(fromDocument(doc)[0].siteId, 'B101733515')
})

test('les 23 cartes rendent leur date exacte', () => {
  assert.equal(listings.length, 23)
  const byId = new Map(listings.map((l) => [l.siteId, l]))
  for (const c of CARDS) {
    assert.equal(byId.get(c.reference).publishedAt.toISOString().slice(0, 10), c.firstOnlineDate)
  }
  const ages = listings.map(days).sort((a, b) => a - b)
  // La page n'affiche rien : huit annonces dépassent le plafond de la fiche,
  // la plus ancienne de 216 jours.
  assert.equal(ages.filter((d) => d > 60).length, 8)
  assert.equal(ages.at(-1), 216)
})

test('lastUpdate est rendu comme réactualisation, la fiche ne fabrique rien', () => {
  const bumped = listings.find((l) => l.siteId === 'W103496285')
  assert.equal(bumped.bumpedAt.toISOString(), new Date(1787208912000).toISOString())
  assert.equal(signals(bumped, NOW).bumped, true)
  // Un écart de moins d'un jour n'est pas une remontée.
  assert.equal(signals(listings.find((l) => l.siteId === 'W103544019'), NOW).bumped, false)
  assert.equal(capped.bumpedAt, null)
  assert.equal(signals(capped, NOW).bumped, false)
})

test('le type de vendeur est porté comme donnée des deux côtés', () => {
  assert.equal(uncapped.sellerType, 'pro')
  assert.equal(capped.sellerType, 'private')
  assert.deepEqual([...new Set(listings.map((l) => l.sellerType))], ['pro'])
  const part = fromScripts(results([{ ...CARDS[0], customerType: 'PART' }]))[0]
  assert.equal(part.sellerType, 'private')
})

test("l'identité du professionnel est retenue", () => {
  assert.equal(uncapped.sellerName, 'CW AUTOMOBILES')
  assert.equal(uncapped.sellerId, 'C045122')
  assert.equal(listings[0].sellerName, CARDS[0].sellerName)
  assert.equal(listings[0].sellerId, 'C000077')
})

test("celle d'un particulier ne l'est pas, et le siret ne sort jamais de la page", () => {
  assert.equal(capped.sellerName, null)
  assert.equal(capped.sellerId, null)
  assert.equal(JSON.stringify(capped).includes('"F"'), false)
  const part = fromScripts(results([{ ...CARDS[0], customerType: 'PART' }]))[0]
  assert.equal(part.sellerName, null)
  assert.equal(part.sellerId, null)
  assert.equal(JSON.stringify(listings).includes('34051417300012'), false)
})

test('le véhicule et le prix sont lus sur les deux surfaces', () => {
  assert.equal(uncapped.title, 'Peugeot 208')
  assert.equal(uncapped.brand, 'Peugeot')
  assert.equal(uncapped.model, '208')
  assert.equal(uncapped.version, '1.2 VTI 82 ACTIVE 5P')
  assert.equal(uncapped.year, 2013)
  assert.equal(uncapped.mileage, 108818)
  assert.equal(uncapped.price, 4990)
  assert.equal(uncapped.url, 'https://www.lacentrale.fr/auto-occasion-annonce-87103538172.html')
  const card = listings[0]
  assert.equal(card.brand, 'PEUGEOT')
  assert.equal(card.version, '1.2 PURETECH 110 5P')
  assert.equal(card.year, 2018)
  assert.equal(card.mileage, 52626)
  assert.equal(card.price, CARDS[0].price)
  assert.equal(card.url, `https://www.lacentrale.fr/auto-occasion-annonce-87${CARDS[0].reference.slice(1)}.html`)
})

test("l'extracteur ne rend rien sur une page étrangère au site", () => {
  const foreign = {
    querySelectorAll: () => [
      { textContent: JSON.stringify({ props: { ads: [{ list_id: 1, first_publication_date: '2026-09-01 10:00:00' }] } }), children: [] },
      { textContent: 'var HeaderData= {"menu":[]}', children: [] },
    ],
  }
  assert.deepEqual(fromDocument(foreign), [])
  assert.equal(displayed(foreign), null)
  assert.deepEqual(fromScripts(['']), [])
})
