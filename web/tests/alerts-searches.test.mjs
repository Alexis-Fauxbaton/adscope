import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { payloadFor, querySummary } from '../js/alerts-searches.js'

// Rouge sur `[filters.brand, filters.model]`/`fuel.join`/`dept.join` de
// `querySummary` : sans eux, la ligne d'une recherche ne dirait rien de ses
// filtres.
test('le résumé compose marque, carburant et départements', () => {
  assert.equal(
    querySummary('brand=Renault&model=Clio&fuel=diesel&department=59&department=62'),
    'Renault Clio · diesel · dépt. 59, 62',
  )
})

test('une requête vide retombe sur « Tout le marché »', () => {
  assert.equal(querySummary(''), 'Tout le marché')
})

// Rouge sur `const { id, created_at, ...base } = search` puis `{ ...base,
// ...patch }` de `payloadFor` : sans le repli sur les champs existants,
// cocher « En pause » effacerait le nom et la requête envoyés en `PUT`.
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

// Statique : « Supprimer » se confirme en place (un second clic devenu
// « Confirmer »), jamais par une boîte de dialogue native — recherché en
// syntaxe d'appel, pour ne pas se déclencher sur la phrase qui l'explique en
// commentaire.
test('aucun appel à la boîte de dialogue native dans alerts-searches.js', () => {
  const source = readFileSync(new URL('../js/alerts-searches.js', import.meta.url), 'utf8')
  assert.ok(!/\b(confirm|prompt)\s*\(/.test(source))
})
