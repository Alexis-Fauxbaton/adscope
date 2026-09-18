process.env.TZ = 'Europe/Paris'

import test from 'node:test'
import assert from 'node:assert/strict'
import { factsOf, hasMoved, isGone } from '../js/facts.js'

const NBSP = ' '
const THIN = ' '
const MINUS = '−'

function item(patch = {}) {
  return {
    price: 22700,
    disappeared_at: null,
    changes: [],
    flags: { dropped: false, crossed: null, disappeared: false },
    ...patch,
  }
}

// Rouge sur la branche `changes.length === 1` de `priceFact` dans js/facts.js :
// c'est la phrase que le marchand lit en premier le matin.
test('une baisse unique se dit avec son montant et sa date', () => {
  const [fait] = factsOf(item({
    changes: [{ at: '2026-09-16T10:00:00Z', from: 23900, to: 22700 }],
    flags: { dropped: true, crossed: null, disappeared: false },
  }))
  assert.equal(fait.kind, 'dropped')
  assert.equal(fait.text, `${MINUS}1${THIN}200${NBSP}€ le 16 sept.`)
})

// Rouge sur le `reduce` de `priceFact` dans js/facts.js : sans le cumul, deux
// baisses dans la fenêtre n'en montreraient qu'une, et le marchand croirait
// l'annonce moins mûre qu'elle n'est.
test('plusieurs baisses se cumulent et se comptent', () => {
  const [fait] = factsOf(item({
    changes: [
      { at: '2026-09-13T10:00:00Z', from: 18150, to: 17650 },
      { at: '2026-09-17T10:00:00Z', from: 17650, to: 17250 },
    ],
    flags: { dropped: true, crossed: null, disappeared: false },
  }))
  assert.equal(fait.text, `${MINUS}900${NBSP}€ en 2 baisses, le dernier le 17 sept.`)
})

// Rouge sur le `total < 0 ? 'dropped' : 'raised'` de js/facts.js : une remontée
// de prix n'est pas une baisse, et se dit avec son vrai signe.
test('une remontée de prix se dit comme une hausse', () => {
  const [fait] = factsOf(item({
    changes: [{ at: '2026-09-16T10:00:00Z', from: 22700, to: 23200 }],
  }))
  assert.equal(fait.kind, 'raised')
  assert.equal(fait.text, `+500${NBSP}€ le 16 sept.`)
})

// Rouge sur le `if (total === 0) return null` de js/facts.js : deux
// changements qui s'annulent ne sont pas un mouvement de prix à annoncer.
test('des changements qui s’annulent ne font pas un fait', () => {
  const faits = factsOf(item({
    changes: [
      { at: '2026-09-13T10:00:00Z', from: 22700, to: 22200 },
      { at: '2026-09-16T10:00:00Z', from: 22200, to: 22700 },
    ],
  }))
  assert.deepEqual(faits, [])
})

// Rouge sur `crossedFact` dans js/facts.js : le seuil franchi est la mesure
// qu'adscope apporte et que le site cache.
test('un seuil franchi se dit en jours en ligne', () => {
  const [fait] = factsOf(item({
    flags: { dropped: false, crossed: 90, disappeared: false },
  }))
  assert.deepEqual(fait, { kind: 'crossed', text: 'a franchi 90 jours en ligne' })
})

// Rouge sur `goneFact` dans js/facts.js. Règle produit : une annonce
// **disparaît**, on ignore pourquoi — jamais « vendue ».
test('une disparition se dit disparition, jamais vente', () => {
  const [fait] = factsOf(item({
    disappeared_at: '2026-09-17T08:00:00Z',
    flags: { dropped: false, crossed: null, disappeared: true },
  }))
  assert.equal(fait.text, 'a disparu le 17 sept.')
  assert.ok(!/vendu/i.test(fait.text))
})

test('une disparition sans date se dit quand même', () => {
  const [fait] = factsOf(item({
    flags: { dropped: false, crossed: null, disappeared: true },
  }))
  assert.equal(fait.text, 'a disparu')
})

// Rouge sur l'ordre du tableau de `factsOf` dans js/facts.js : une annonce
// partie n'a plus de prix à négocier, la disparition passe devant.
test('la disparition prime sur la baisse, la baisse sur le seuil', () => {
  const faits = factsOf(item({
    disappeared_at: '2026-09-17T08:00:00Z',
    changes: [{ at: '2026-09-16T10:00:00Z', from: 23900, to: 22700 }],
    flags: { dropped: true, crossed: 60, disappeared: true },
  }))
  assert.deepEqual(faits.map((f) => f.kind), ['disappeared', 'dropped', 'crossed'])
})

test('une annonce sans fait n’a pas bougé', () => {
  assert.equal(hasMoved(item()), false)
  assert.equal(hasMoved(item({ flags: { crossed: 30 } })), true)
})

// Rouge sur le `principal.kind === 'disappeared'` de `isGone` dans
// js/facts.js : c'est cette ligne qui retire « Voir l'annonce » d'une carte
// disparue — sans elle, le lien mènerait à une fiche morte.
test('isGone ne vaut vrai que si le fait principal est une disparition', () => {
  assert.equal(isGone(item({ flags: { dropped: false, crossed: null, disappeared: true } })), true)
  assert.equal(isGone(item({
    changes: [{ at: '2026-09-16T10:00:00Z', from: 23900, to: 22700 }],
    flags: { dropped: true, crossed: null, disappeared: false },
  })), false)
  assert.equal(isGone(item()), false)
})
