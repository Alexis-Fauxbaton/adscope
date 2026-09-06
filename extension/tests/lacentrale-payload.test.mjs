import test from 'node:test'
import assert from 'node:assert/strict'
import { CARDS, page, results } from './lc-page.mjs'

// Ce que la page porte et ce qu'elle montre ne sont pas la même chose, et relire
// sa charge à chaque lot de mutations se paie. Deux questions d'une seule page de
// résultats : celle relevée le 2026-09-06, vingt-trois cartes et six annonces
// préchargées que rien ne rend.
const cards = CARDS.map((c) => c.reference)
const RESERVE = ['W103336930', 'W103346813', 'W103450795', 'W103336985', 'W103534159', 'W103540609']

const listing = () => page({ path: '/listing', scripts: results(CARDS), cards })
const withReserve = () => page({ path: '/listing', scripts: results(CARDS, RESERVE), cards })

// Point 2. Ces annonces-là ne sont rendues nulle part : aucun lien de la page ne
// les nomme, et elles arrivent sans véhicule, sans vendeur et sans date de
// modification. Les compter parmi les annonces lues faisait passer le diagnostic
// pour défaillant — vingt-neuf lues, vingt-trois pastilles, et rien pour le dire.
test("les annonces préchargées sans carte ne comptent pas parmi les annonces lues", () => {
  const w = withReserve()
  w.load('listing.js')
  const s = w.status()
  assert.equal(s.listings, 23)
  assert.equal(s.badges, 23)
  // L'écart est dit, et il vaut exactement la réserve.
  assert.equal(s.unshown, 6)
})

// Rouge sur `ADS.sync.send(shown)` de src/listing.js : avec `send(listings)`, les
// six repartent au suivi mutualisé sans qu'aucune pastille les couvre.
test("les annonces préchargées sans carte ne partent pas au suivi", () => {
  const w = withReserve()
  w.load('listing.js')
  assert.equal(w.messages()[0].listings.length, 23)
  for (const ref of RESERVE) assert.ok(!w.queued().includes(ref), `${ref} transmise sans carte`)
})

// Point 1. Le site balaie tous ses scripts en ligne pour lire ses annonces :
// 3,46 ms mesurés sur la page sauvegardée, contre 0,018 ms pour la signature qui
// dit que rien n'a bougé. Rouge sur `listings: (doc) => latest || reread(doc)` de
// src/feed.js : sans le mémo, vingt lots donnent vingt-et-une extractions.
test("les résultats ne sont pas réextraits à chaque lot de mutations", () => {
  const w = listing()
  w.load('listing.js')
  assert.equal(w.counts.extract, 1)

  w.mutate(20)
  assert.equal(w.counts.extract, 1)
  assert.equal(w.status().listings, 23)
})

// Et le mémo s'efface : une charge réécrite est une page qui a changé d'annonces.
test("une charge réécrite est relue", () => {
  const w = listing()
  w.load('listing.js')
  const [first, ...rest] = CARDS
  w.scripts[0].textContent = results([first])[0]
  w.mutate(1)
  assert.equal(w.counts.extract, 2)
  assert.equal(w.status().listings, 1)
  assert.ok(rest.length)
})
