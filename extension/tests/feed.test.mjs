import test from 'node:test'
import assert from 'node:assert/strict'
import { ad, block, world } from './world.mjs'

const PAGE1 = '3254194817'
const PAGE2 = '3263931610'
// Le bloc `__NEXT_DATA__` décrit la page 1 ; la carte affichée est de la page 2.
const paginated = () => world(PAGE2, { path: '/voitures/occasions?page=2', data: block(ad(PAGE1)) })

test('la page suivante est pastillée dès la réception, sans lot de mutations', () => {
  const w = paginated()
  w.load('listing.js')
  assert.equal(w.badge(), null)

  w.receive({ ads: [ad(PAGE2)] })
  assert.ok(w.badge(), 'la pastille se pose sans attendre de mutation')
  assert.equal(w.badge().getAttribute('data-adscope'), PAGE2)
})

test('le diagnostic décrit la page réellement affichée', () => {
  const w = paginated()
  w.load('listing.js')
  assert.equal(w.status().source, 'page')
  assert.equal(w.status().badges, 0)

  w.receive({ ads: [ad(PAGE2)] })
  const s = w.status()
  assert.equal(s.kind, 'listing')
  assert.equal(s.url, '/voitures/occasions?page=2')
  assert.equal(s.listings, 1)
  assert.equal(s.badges, 1)
  assert.equal(s.source, 'live')
})

test('une charge sans annonce laisse la page en place', () => {
  const w = paginated()
  w.load('listing.js')
  w.receive({ ads: [ad(PAGE2)] })
  w.receive({ pivot: null })
  assert.equal(w.badge().getAttribute('data-adscope'), PAGE2)
  assert.equal(w.status().listings, 1)
})

// Le suivi, lui, n'était pas paginé : les pastilles se posaient en page 2 mais
// ces annonces n'entraient jamais en base et ne recevaient aucun signal.
test('les annonces de la page suivante sont versées au suivi', () => {
  const w = paginated()
  w.load('listing.js')
  assert.deepEqual(w.queued(), [PAGE1])

  w.receive({ ads: [ad(PAGE2)] })
  assert.deepEqual(w.queued(), [PAGE1, PAGE2])
})

test('les annonces déjà transmises ne repartent pas à chaque lot', () => {
  const w = paginated()
  w.load('listing.js')
  w.receive({ ads: [ad(PAGE2)] })
  w.mutate(5)
  w.receive({ ads: [ad(PAGE2)] })
  assert.equal(w.messages().length, 2)
})

test('les signaux de la page suivante atteignent sa pastille', () => {
  const w = paginated()
  w.load('listing.js')
  w.receive({ ads: [ad(PAGE2)] })
  w.arrive({ [PAGE2]: { price: 12000, price_delta_since_first: -500, price_delta_days_since_first: 4 } })
  assert.match(w.badge().textContent, /▼ −500/)
})

test("le diagnostic dit ce qui a réellement été transmis", () => {
  const w = paginated()
  w.load('listing.js')
  assert.equal(w.status().sent, 0)

  w.arrive({})
  assert.equal(w.status().sent, 1)

  w.receive({ ads: [ad(PAGE2)] })
  w.arrive({})
  assert.equal(w.status().sent, 2)
})

// Les charges de fiche arrivent maintenant elles aussi, sous leur propre nom :
// la liste ne doit pas les lire, une fiche porte ses annonces similaires.
test('une charge de fiche ne remplace pas la liste affichée', () => {
  const w = paginated()
  w.load('listing.js')
  w.receive({ ads: [ad(PAGE2)] })
  w.receive({ props: { similar: { ads: [ad(PAGE1), ad(PAGE2)] } } }, 'detail')
  assert.equal(w.badge().getAttribute('data-adscope'), PAGE2)
  assert.equal(w.status().listings, 1)
})
