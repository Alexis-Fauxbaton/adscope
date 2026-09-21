import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Statique : « Supprimer » se confirme en place (un second clic devenu
// « Confirmer »), jamais par une boîte de dialogue native — recherché en
// syntaxe d'appel, pour ne pas se déclencher sur la phrase qui l'explique en
// commentaire.
test('aucun appel à la boîte de dialogue native dans alerts-searches.js', () => {
  const source = readFileSync(new URL('../js/alerts-searches.js', import.meta.url), 'utf8')
  assert.ok(!/\b(confirm|prompt)\s*\(/.test(source))
})
