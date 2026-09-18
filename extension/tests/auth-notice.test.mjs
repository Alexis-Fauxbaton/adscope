import test from 'node:test'
import assert from 'node:assert/strict'
import { ad, block, world } from './world.mjs'

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
