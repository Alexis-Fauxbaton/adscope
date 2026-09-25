import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_DAYS, MAX_DAYS, deltaLabel, delayLabel, fieldLabel, parseDays, sortLicenses, summarize,
  valueLabel,
} from '../js/ecarts.js'
import { money } from '../js/format.js'

// Rouge sur `if (seconds < HOUR) return … min` de js/ecarts.js : sans lui, un
// délai de 45 minutes se dirait « 0 h ».
test('un délai sous l’heure se dit en minutes', () => {
  assert.equal(delayLabel(2700), '45 min')
  assert.equal(delayLabel(30), '1 min')
})

// Rouge sur `if (seconds < 2 * DAY) return … h` : un délai de deux heures ou
// de trente-six heures se dit en heures, jamais en jours ni en minutes.
test('un délai sous deux jours se dit en heures', () => {
  assert.equal(delayLabel(7200), '2 h')
  assert.equal(delayLabel(129600), '36 h')
})

// Rouge sur `return … j` (le repli au-delà de deux jours) : six jours ne se
// disent jamais en heures.
test('un délai au-delà de deux jours se dit en jours', () => {
  assert.equal(delayLabel(518400), '6 j')
})

// Rouge sur la clé de tri `(-count, min_delay_seconds, license_key_hash)` de
// `sortLicenses` : sans elle, la clé la plus fautive ne serait pas en tête.
test('les clés se classent par nombre d’écarts puis par délai le plus court', () => {
  const rows = [
    { license_key_hash: 'b', count: 2, min_delay_seconds: 600 },
    { license_key_hash: 'a', count: 4, min_delay_seconds: 7200 },
    { license_key_hash: 'c', count: 4, min_delay_seconds: 1800 },
  ]
  assert.deepEqual(sortLicenses(rows).map((r) => r.license_key_hash), ['c', 'a', 'b'])
})

// Rouge sur `repeatKeys > 0 ? … dont … : …` de `summarize` : sans la
// branche, la phrase ne dirait jamais combien de clés ont trois écarts ou plus.
test('l’entête compte les clés à trois écarts ou plus', () => {
  const avecRepetition = summarize({ total: 8, keys: 3, repeat_keys: 2 }, 30)
  assert.match(avecRepetition, /dont 2 clés avec 3 écarts ou plus/)
  const sansRepetition = summarize({ total: 1, keys: 1, repeat_keys: 0 }, 30)
  assert.doesNotMatch(sansRepetition, /dont/)
})

// Rouge sur `if (pct == null) return null` de `deltaLabel` : un champ sans
// pourcentage (date, véhicule, absence …) ne doit rien afficher.
test('un écart sans pourcentage n’en affiche pas', () => {
  assert.equal(deltaLabel(null), null)
  assert.equal(deltaLabel(30.3), '+30,3 %')
  assert.equal(deltaLabel(-18.9), '−18,9 %')
})

// Rouge sur `FIELD_LABELS[field] || field` : sans le dictionnaire, les six
// champs du journal s’afficheraient sous leur code anglais.
test('les six champs ont un libellé français', () => {
  assert.equal(fieldLabel('price'), 'prix')
  assert.equal(fieldLabel('published'), 'date de mise en ligne')
  assert.equal(fieldLabel('vehicle'), 'véhicule')
  assert.equal(fieldLabel('absence'), 'absence')
  assert.equal(fieldLabel('bump'), 'réactualisation')
  assert.equal(fieldLabel('unknown_listing'), 'annonce inconnue')
  assert.equal(fieldLabel('autre'), 'autre')
})

// Rouge sur `if (field === 'price') return money(...)` de `valueLabel` :
// sans lui, un prix se lirait « 9900 » plutôt que « 9 900 € ».
test('un prix se met en forme, une date aussi, le reste se rend tel quel', () => {
  assert.equal(valueLabel('price', '9900'), money(9900))
  assert.equal(valueLabel('published', '2026-08-01'), '1er août')
  assert.equal(valueLabel('bump', 'aucune'), 'aucune')
  assert.equal(valueLabel('absence', 'présente'), 'présente')
  assert.equal(valueLabel('vehicle', null), '—')
})

// Rouge sur `raw < 1` de `parseDays` dans js/ecarts.js : sans lui, une URL
// trafiquée (`?days=0` ou `?days=abc`) enverrait une valeur que la route
// refuse (`ge=1`).
test('une fenêtre absente ou absurde retombe sur le défaut', () => {
  assert.equal(parseDays(''), DEFAULT_DAYS)
  assert.equal(parseDays('?days=abc'), DEFAULT_DAYS)
  assert.equal(parseDays('?days=0'), DEFAULT_DAYS)
})

// Rouge sur le `Math.min(…, MAX_DAYS)` de `parseDays` : le contrat de la
// route (`le=365`) refuse au-delà.
test('la fenêtre est bornée à ce que la route accepte', () => {
  assert.equal(parseDays('?days=1000'), MAX_DAYS)
  assert.equal(parseDays('?days=7'), 7)
})
