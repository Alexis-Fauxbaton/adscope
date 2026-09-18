import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { CARDS, FICHES, fiche, page, results } from './lc-page.mjs'
import { at } from './stage.mjs'

// Le relevé de la fenêtre, chargé avant que le décor ne réinitialise `ADS` : les
// chiffres du diagnostic et les lignes affichées doivent se juger ensemble.
const report = createRequire(import.meta.url)(
  join(dirname(fileURLToPath(import.meta.url)), '../popup/report.js'),
)

// Le jour du relevé des deux pages sauvegardées.
const RELEVE = '2026-09-06T18:00:00Z'

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

// Le diagnostic disait « Données trouvées : non » en rouge sur les deux pages de
// La Centrale, suivi de « la structure du site a changé » — au-dessus d'un panneau
// montrant 23 annonces lues et 23 pastilles posées. La sonde cherchait le bloc
// d'un rendu Next, que ce site ne porte pas et ne portera jamais.
const found = (s) => report.rows(s).find((r) => r.label === 'Données trouvées')

test('sur les deux surfaces du site, la charge est constatée présente', () => {
  for (const [what, build, script] of [['résultats', listing, 'listing.js'], ['fiche', capped, 'detail.js']]) {
    const w = build()
    w.load(script)
    const s = w.status()
    assert.equal(s.payload, true, what)
    assert.equal(found(s).value, 'oui', what)
    assert.equal(found(s).bad, false, what)
    assert.doesNotMatch(report.trouble(s).text || '', /structure du site/, what)
  }
})

// Les trois chiffres du résumé, et le nombre que porte le badge. Comptés à la
// main sur les 23 cartes de la page relevée, au 6 septembre 2026 18 h UTC :
// 14 annonces à 31 jours ou plus (94, 45, 45, 38, 45, 69, 127, 85, 216, 66, 81,
// 41, 53, 66), dont 8 au delà du plafond de 60 jours (94, 69, 127, 85, 216, 66,
// 81, 66). Aucune ne s'approche des bornes à moins d'un jour près.
test('le résumé des résultats compte le seuil dépassé et les alertes', () => {
  const w = at(RELEVE, () => {
    const w = listing()
    w.load('listing.js')
    return w
  })
  const s = w.status()
  assert.equal(s.listings, 23)
  assert.equal(s.old, 14)
  assert.equal(s.alerts, 8)
  // Le badge de l'icône porte le même nombre, et il vient du même comptage.
  assert.equal(w.badges().at(-1).alerts, 8)
  // Le résumé de la fenêtre le rend tel quel.
  const rendered = report.summary(s).map((r) => r.value)
  assert.deepEqual(rendered, ['23', '14', '8'])
})

// Ce que la page montre en pastilles doit dire la même chose que ce que le
// résumé compte : huit alertes, huit pastilles au poids d'alerte.
test('autant de pastilles en alerte que le résumé en annonce', () => {
  const w = at(RELEVE, () => {
    const w = listing()
    w.load('listing.js')
    return w
  })
  const notable = CARDS.filter((c) => /adscope-badge--notable/.test(w.badge(c.reference).className))
  assert.equal(notable.length, 8)
})

// Le défaut le plus grave du lot, vu de la page : une carte dont la charge porte
// la clé de date sans valeur. `null` compté en millisecondes rendait l'époque
// Unix — cinquante-six ans en ligne, et la pastille au rouge.
test("une carte sans date n'énonce aucun âge et ne met rien en alerte", () => {
  const [c] = CARDS
  const w = page({
    path: '/listing',
    scripts: results([{ ...c, firstOnlineDate: null }]),
    cards: [c.reference],
  })
  w.load('listing.js')
  const badge = w.badge(c.reference)
  assert.equal(badge.textContent, 'date absente de la page')
  assert.doesNotMatch(badge.textContent, /\d/)
  assert.match(badge.className, /adscope-badge--quiet/)
  assert.equal(w.status().alerts, 0)
  assert.equal(w.status().old, 0)
})

test("sur une fiche sans date, le panneau et la fenêtre refusent d'épeler un âge", () => {
  const w = page({
    path: '/auto-occasion-annonce-66101733515.html',
    scripts: fiche({ ...FICHES.capped, creationDate: null }),
    label: 'Publiée il y a 60 jours',
  })
  w.load('detail.js')
  const text = w.panel().textContent
  assert.match(text, /date absente de la page/)
  assert.doesNotMatch(text, /ans|mois/)
  // Rien à opposer au site : sans date, il n'y a pas de contradiction à nommer.
  assert.doesNotMatch(text, /La Centrale affiche/)
  assert.equal(w.status().card.onlineDays, null)
  assert.equal(w.status().card.publishedAt, null)
  assert.equal(w.status().alerts, 0)
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

const capped = (over = {}) =>
  page({
    path: '/auto-occasion-annonce-66101733515.html',
    scripts: fiche(FICHES.capped, { lastname: 'F' }),
    label: 'Publiée il y a 60 jours',
    ...over,
  })

// Sur la fiche de ce site, le libellé d'ancienneté ferme la page au ras du pied,
// sous les mentions légales : s'y ancrer poserait le panneau là où personne ne
// le lirait. Le pavé du prix, lui, est en haut. Rouge sur le `mount` de
// src/sites/lacentrale.js, qui laisserait le panneau retomber sur le libellé.
test('le panneau se pose sous le prix, pas au pied de la fiche', () => {
  const w = capped({ price: true })
  w.load('detail.js')
  const kin = w.body.children
  assert.equal(kin[kin.indexOf(w.panel()) - 1].getAttribute('id'), 'pavePrix')
})

// Le cœur du lot, vu de la page : le site écrit « 60 jours », l'annonce en a
// 1 810, et l'écart doit se lire sans quitter la fiche. Le compte de 1 810
// jours n'est vrai qu'au jour du relevé : ce test lisait l'horloge réelle et
// dérivait d'un jour par jour — gelée sur `RELEVE`, l'annonce en a toujours
// 1 810 à la lecture de `detail.js`.
test('sur une fiche plafonnée, la contradiction est lisible', () => {
  const w = at(RELEVE, () => {
    const w = capped()
    w.load('detail.js')
    return w
  })
  const text = w.panel().textContent
  assert.match(text, /En ligne depuis/)
  assert.match(text, /4 ans 11 mois/)
  // La pilule dit la largeur de ce que le site montre ; ce qu'il écrit mot pour
  // mot et ce que ce libellé recouvre restent lisibles sans encombrer la carte.
  assert.match(text, /Le site affiche 60 j/)
  const said = w.panel().querySelector('.adscope-pill').getAttribute('title')
  assert.match(said, /La Centrale affiche/)
  assert.match(said, /Publiée il y a 60 jours/)
  assert.match(said, /compteur plafonné à 60 jours/)
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
  assert.equal(w.panel().querySelector('.adscope-pill'), null)
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
