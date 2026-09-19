import test from 'node:test'
import assert from 'node:assert/strict'
import { ad, block, world } from './world.mjs'
import { CARDS, FICHES, fiche, href, page, results } from './lc-page.mjs'
import { at } from './stage.mjs'

// L'adresse d'une fiche, telle que le site l'écrit : le chemin seul, sans l'origine.
const SLUG = (ref) => href(ref).split('/').pop()

const ID = '3254194817'

const listing = () => world(ID, { path: '/voitures/occasions', data: block(ad(ID)) })
const detail = () => world(ID, { path: `/ad/voitures/${ID}`, data: block(ad(ID)) })

// Fait rougir la branche `if (down)` de `paint` dans src/listing.js : sans
// elle, la pastille resterait affichée avec un signal qu'on ne rafraîchit
// plus, comme si la session tenait encore.
test('une session tombée efface la pastille et pose la mention de reconnexion', () => {
  const w = listing()
  w.load('listing.js')
  w.denySession()
  const badge = w.badge()
  assert.equal(badge.className, '')
  assert.equal(badge.children.length, 1)
  assert.equal(badge.children[0].className, 'ads-auth-msg')
  assert.match(badge.children[0].textContent, /adscope — reconnectez-vous/)
})

// Le contrôle de santé du crawl (crawler/RUNBOOK.md) compte les
// `[class*="adscope-"]` : la mention ne doit jamais en satisfaire une, sous
// peine de le faire tourner à vide en se croyant sain.
test('la mention ne satisfait pas [class*="adscope-"]', () => {
  const w = listing()
  w.load('listing.js')
  w.denySession()
  assert.equal(w.doc.querySelectorAll('[class*="adscope-"]').length, 0)
})

test("la mention ouvre l'application, pas la page hôte", () => {
  const w = listing()
  w.load('listing.js')
  w.denySession()
  w.badge().children[0].click()
  assert.deepEqual(w.opened(), [{ url: 'http://localhost:8000/app', target: '_blank' }])
})

// Un échec relance la pause de 30 s de src/sync.js (elle laisse passer la
// rafale, pas la page suivante) : sans avancer l'horloge, `send` se tairait
// et aucun nouvel appel ne partirait à rejouer. `mutate` rejoue le rendu,
// comme le ferait la page en changeant ses résultats.
const recover = (w) => {
  const real = Date.now
  Date.now = () => real() + 40000
  try {
    w.mutate(1)
    w.arrive({})
  } finally {
    Date.now = real
  }
}

// Fait rougir `setAuth(false)` dans src/sync.js : sans lui, la mention
// resterait posée après le retour de la session.
test("un appel réussi qui suit efface la mention et rend la pastille", () => {
  const w = listing()
  w.load('listing.js')
  w.denySession()
  recover(w)
  const badge = w.badge()
  assert.notEqual(badge.className, '')
  assert.equal(badge.children[0].className, 'adscope-badge-page')
})

test('le panneau de la fiche se remplace lui aussi par la mention', () => {
  const w = detail()
  w.load('detail.js')
  w.denySession()
  const panel = w.panel()
  assert.equal(panel.className, '')
  assert.match(panel.textContent, /adscope — reconnectez-vous/)
})

// Sur une même fiche, jamais revisitée, `detail.js` ne rejoue son envoi que si
// son marquage se désaccorde de l'URL (voir detail.test.mjs) : un identifiant
// d'URL qui ne correspond à aucune annonce connue y force le rejeu à chaque
// mutation, ce qui isole ici la seule question posée — un appel réussi
// efface-t-il la mention ?
test('le panneau revient après un appel réussi', () => {
  const w = world(ID, { path: '/ad/voitures/9999999999', data: block(ad(ID)) })
  w.load('detail.js')
  w.denySession()
  assert.equal(w.panel().className, '')
  recover(w)
  assert.equal(w.panel().className, 'adscope-panel')
})

// ── Le pendant sur l'autre site ─────────────────────────────────────────────
//
// Trou de couverture relevé le 2026-09-19 : tout ce qui précède ne tourne que
// sur le DOM leboncoin (`world.mjs`). La session tombe pourtant partout, et le
// remplacement de la pastille passe par le site — ses cartes, son conteneur,
// sa façon de nommer une annonce. Ce qui suit rejoue les mêmes constats sur la
// page La Centrale sauvegardée (`lc-page.mjs`), y compris sur une annonce que
// la page montre deux fois.

// Le jour du relevé des pages sauvegardées.
const RELEVE = '2026-09-06T18:00:00Z'
// `W103496285` porte une bannière `boostVo` et reparaît parmi les résultats
// ordinaires : une annonce, deux cartes.
const TWICE = 'W103496285'
const FICHE = FICHES.uncapped

const lcListing = () =>
  at(RELEVE, () => {
    const w = page({
      path: '/listing',
      scripts: results(CARDS),
      cards: CARDS.map((c) => c.reference),
      boost: TWICE,
    })
    w.load('listing.js')
    return w
  })

// La même branche `if (down)` de `paint` dans src/listing.js, sur l'autre site :
// c'est le module de site qui rend les cartes, et rien ne garantissait que le
// remplacement les atteigne toutes.
test('La Centrale : une session tombée efface la pastille de chacune des cartes', () => {
  const w = lcListing()
  assert.equal(w.badgesOf(TWICE).length, 2, 'une annonce, deux cartes')
  w.denySession()
  for (const badge of w.badgesOf(TWICE)) {
    assert.equal(badge.className, '')
    assert.equal(badge.children.length, 1)
    assert.equal(badge.children[0].className, 'ads-auth-msg')
    assert.match(badge.children[0].textContent, /adscope — reconnectez-vous/)
  }
})

test('La Centrale : la mention ne satisfait pas [class*="adscope-"]', () => {
  const w = lcListing()
  assert.ok(w.doc.querySelectorAll('[class*="adscope-"]').length, 'il y en avait avant')
  w.denySession()
  assert.equal(w.doc.querySelectorAll('[class*="adscope-"]').length, 0)
})

test("La Centrale : un appel réussi rend les deux pastilles", () => {
  const w = lcListing()
  w.denySession()
  recover(w)
  for (const badge of w.badgesOf(TWICE)) {
    assert.ok(badge.className.includes('adscope-badge'))
    assert.equal(badge.children[0].className, 'adscope-badge-page')
  }
})

test('La Centrale : le panneau de la fiche se remplace lui aussi par la mention', () => {
  const w = at(RELEVE, () => {
    const w = page({ path: `/${SLUG(FICHE.reference)}`, scripts: fiche(FICHE), price: true })
    w.load('detail.js')
    return w
  })
  assert.equal(w.panel().className, 'adscope-panel')
  w.denySession()
  assert.equal(w.panel().className, '')
  assert.match(w.panel().textContent, /adscope — reconnectez-vous/)
})
