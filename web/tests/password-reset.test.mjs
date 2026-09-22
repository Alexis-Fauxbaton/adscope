import test from 'node:test'
import assert from 'node:assert/strict'
import { MESSAGE_ENVOYE } from '../js/password-reset.js'

// Rouge sur la constante `MESSAGE_ENVOYE` de js/password-reset.js : sans une
// phrase indistincte (D3 du plan), une adresse inconnue et une adresse
// cliente pourraient un jour recevoir deux textes différents — ce qui
// énumérerait les comptes existants.
test('le message après « mot de passe oublié » ne distingue jamais l’adresse', () => {
  assert.equal(MESSAGE_ENVOYE, 'Si un compte existe pour cette adresse, un lien vient de partir.')
  assert.doesNotMatch(MESSAGE_ENVOYE, /@/)
})
