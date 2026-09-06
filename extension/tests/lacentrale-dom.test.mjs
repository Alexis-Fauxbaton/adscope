import test from 'node:test'
import assert from 'node:assert/strict'
import { CARDS, FICHES, fiche, page, results } from './lc-page.mjs'

const OLDEST = 'W103409201' // 216 jours en ligne le jour du relevé
const FRESH = 'W103546110' // 5 jours
const TOUCHED = 'W103496285' // 94 jours, et un `lastUpdate` postérieur

const listing = () =>
  page({ path: '/listing', scripts: results(CARDS), cards: CARDS.map((c) => c.reference) })

// Ce que le site n'écrit nulle part sur ses cartes : depuis quand l'annonce est
// en ligne. La page de résultats n'affiche aucune ancienneté, la charge la porte.
test('sur une page de résultats, chaque carte porte son ancienneté réelle', () => {
  const w = listing()
  w.load('listing.js')
  assert.equal(w.status().kind, 'listing')
  assert.equal(w.status().listings, 23)
  assert.equal(w.status().badges, 23)
  assert.match(w.badge(OLDEST).textContent, /en ligne/)
  assert.match(w.badge(OLDEST).textContent, /mois|ans?/)
  assert.match(w.badge(FRESH).textContent, /\d+ j en ligne/)
})

// L'alerte de La Centrale est le plafond de son compteur, mesuré sur sa fiche ;
// celle de leboncoin — ancienne et encore poussée — n'y est pas transposée.
test('la carte qui dépasse le plafond du site est mise en alerte, pas les autres', () => {
  const w = listing()
  w.load('listing.js')
  assert.match(w.badge(OLDEST).className, /adscope-badge--notable/)
  assert.match(w.badge(FRESH).className, /adscope-badge--quiet/)
})

test("la carte modifiée le dit sans reprendre le mot de l'autre site", () => {
  const w = listing()
  w.load('listing.js')
  assert.match(w.badge(TOUCHED).textContent, /modifiée/)
  assert.doesNotMatch(w.badge(TOUCHED).textContent, /réactualisée/i)
})

test('les annonces de La Centrale partent au suivi sous leur propre site', () => {
  const w = listing()
  w.load('listing.js')
  assert.equal(w.messages()[0].site, 'lc')
  assert.equal(w.asked()[0].site, 'lc')
  assert.equal(w.messages()[0].listings.length, 23)
})

const capped = () =>
  page({
    path: '/auto-occasion-annonce-66101733515.html',
    scripts: fiche(FICHES.capped, { lastname: 'F' }),
    label: 'Publiée il y a 60 jours',
  })

// Le cœur du lot, vu de la page : le site écrit « 60 jours », l'annonce en a
// 1 810, et l'écart doit se lire sans quitter la fiche.
test('sur une fiche plafonnée, la contradiction est lisible', () => {
  const w = capped()
  w.load('detail.js')
  const text = w.panel().textContent
  assert.match(text, /En ligne depuis/)
  assert.match(text, /ans/)
  assert.match(text, /La Centrale affiche/)
  assert.match(text, /Publiée il y a 60 jours/)
  assert.match(text, /compteur plafonné à 60 jours/)
  assert.match(w.panel().className, /adscope-panel--notable/)
})

test("la fiche est reconnue par la référence que porte son adresse", () => {
  const w = capped()
  w.load('detail.js')
  const s = w.status()
  assert.equal(s.kind, 'detail')
  assert.equal(s.site, 'lc')
  assert.equal(s.urlId, 'B101733515')
  assert.equal(s.pickedId, 'B101733515')
  assert.equal(s.matchesUrl, true)
})

test("sous le plafond, aucune contradiction n'est inventée", () => {
  const w = page({
    path: '/auto-occasion-annonce-87103538172.html',
    scripts: fiche(FICHES.uncapped, { sellerName: 'CW AUTOMOBILES' }),
    label: 'Publiée il y a 23 jours',
  })
  w.load('detail.js')
  assert.doesNotMatch(w.panel().textContent, /La Centrale affiche/)
  assert.match(w.panel().textContent, /professionnel/)
  assert.equal(w.panel().className, 'adscope-panel')
})

// Sur une page de résultats, le panneau décrit la première annonce : c'est là
// que la ligne de mise à jour d'une carte se lit en toutes lettres.
test("le panneau emprunte au site le mot de sa ligne de mise à jour", () => {
  const w = listing()
  w.load('detail.js')
  assert.match(w.panel().textContent, /Modifiée/)
  assert.doesNotMatch(w.panel().textContent, /Réactualisée/i)
})

// La page de résultats n'a pas d'identifiant dans son adresse : c'est ce qui
// désigne l'auteur du diagnostic, ici comme sur l'autre site.
test("une page de résultats n'écrit pas le diagnostic d'une fiche", () => {
  const w = listing()
  w.load('detail.js')
  w.load('listing.js')
  assert.equal(w.status().kind, 'listing')
})
