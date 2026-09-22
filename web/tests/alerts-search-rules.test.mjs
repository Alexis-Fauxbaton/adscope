import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AGE_CHOICES, coverageSentence, countLabel, dropsSentence, payloadFor, withCurrent,
} from '../js/alerts-search-rules.js'

// Rouge sur les deux interpolations de `dropsSentence` : sans elles, la
// carte dirait la même phrase pour toutes les recherches, quels que soient
// leurs propres seuils.
test('la phrase de baisse porte les seuils propres à la recherche', () => {
  assert.equal(
    dropsSentence({ min_age_days: 30, min_drop_pct: 3 }),
    "Une annonce en ligne depuis plus de 30 jours baisse d'au moins 3 %.",
  )
  assert.equal(
    dropsSentence({ min_age_days: 15, min_drop_pct: 5 }),
    "Une annonce en ligne depuis plus de 15 jours baisse d'au moins 5 %.",
  )
})

// Rouge sur `total == null` de `countLabel` : sans ce cas, la carte
// afficherait « 0 annonce » pendant que le compte est encore en vol, comme
// si le marché n'avait vraiment rien à montrer.
test('un compte pas encore connu ne se dit pas « 0 annonce »', () => {
  assert.equal(countLabel(null), 'Marché : compte en cours…')
  assert.equal(countLabel(undefined), 'Marché : compte en cours…')
})

test('le compte accorde « annonce » au pluriel', () => {
  assert.equal(countLabel(0), "0 annonce aujourd'hui")
  assert.equal(countLabel(1), "1 annonce aujourd'hui")
  assert.equal(countLabel(124), "124 annonces aujourd'hui")
})

// Rouge sur `const { id, created_at, ...base } = search` puis `{ ...base,
// ...patch }` de `payloadFor` : sans le repli sur les champs existants,
// cocher une règle effacerait le nom et la requête envoyés en `PUT`.
test('patcher un seul champ garde tous les autres', () => {
  const search = {
    id: 4, name: 'Clio IV diesel', query: 'brand=Renault', notify_drops: true,
    notify_new: false, min_age_days: 30, min_drop_pct: 3, paused: false, created_at: '2026-08-01T00:00:00Z',
  }
  const payload = payloadFor(search, { paused: true })
  assert.equal(payload.paused, true)
  assert.equal(payload.name, 'Clio IV diesel')
  assert.equal(payload.query, 'brand=Renault')
  assert.equal('id' in payload, false)
  assert.equal('created_at' in payload, false)
})

// Rouge sur `choices.some(([v]) => v === value)` de `withCurrent` : sans
// lui, un seuil déjà enregistré mais absent des trois choix proposés (un
// vieux réglage) disparaîtrait du menu au lieu d'y rester sélectionné.
test('un seuil déjà enregistré mais hors choix reste dans la liste', () => {
  assert.deepEqual(withCurrent(AGE_CHOICES, 45), [[45, '45'], ...AGE_CHOICES])
})

test('un seuil déjà dans les choix ne se duplique pas', () => {
  assert.deepEqual(withCurrent(AGE_CHOICES, 30), AGE_CHOICES)
})

// Rouge sur `search.sweep_status === 'trop_large' || … === 'texte_libre'` de
// `coverageSentence` : sans ce garde, une recherche hors balayage afficherait
// un pourcentage qui n'existe pas plutôt que dire pourquoi.
test('une recherche trop large ou en texte libre dit pourquoi, jamais un pourcentage', () => {
  assert.equal(
    coverageSentence({ sweep_status: 'trop_large', coverage_24h: 0.9 }),
    'Hors balayage, trop large : précisez une marque et un modèle.',
  )
  assert.equal(
    coverageSentence({ sweep_status: 'texte_libre', coverage_24h: 0.9 }),
    'Hors balayage, trop large : précisez une marque et un modèle.',
  )
})

// Rouge sur `search.coverage_24h == null` de `coverageSentence` : sans lui,
// une recherche jamais balayée (périmètre vide, `coverage.coverage_of`
// rend `None`) afficherait « NaN % » plutôt que dire qu'elle attend son tour.
test('une recherche jamais balayée le dit, sans pourcentage', () => {
  assert.equal(coverageSentence({ sweep_status: 'ok', coverage_24h: null }), 'Pas encore balayée.')
})

// Rouge sur `Math.round(search.coverage_24h * 100)` de `coverageSentence` :
// sans lui, la carte afficherait une fraction (0.82) plutôt qu'un pourcentage
// lisible par un marchand.
test('une couverture connue se dit en pourcentage entier', () => {
  assert.equal(
    coverageSentence({ sweep_status: 'ok', coverage_24h: 0.821 }),
    '82 % des annonces vues depuis 24 h.',
  )
})
