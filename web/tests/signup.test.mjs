import test from 'node:test'
import assert from 'node:assert/strict'
import { REGLE_MDP, verifiezMessage } from '../js/signup.js'

// Rouge sur la constante `REGLE_MDP` de js/signup.js : sans elle (ou si elle
// dérive du texte), Karim lirait une règle différente de celle que l'API
// applique vraiment (`passwords.TOO_SHORT`, api/adscope_api/passwords.py).
test('la règle du mot de passe est dite mot pour mot comme l’API', () => {
  assert.equal(REGLE_MDP, "Choisissez un mot de passe d'au moins 10 caractères.")
})

// Rouge sur la branche `email ? … : …` de `verifiezMessage` : sans elle,
// l'écran « vérifiez votre email » prétendrait connaître une adresse même
// quand on y arrive directement (sans être passé par l'inscription).
test('le message nomme l’adresse quand elle est connue', () => {
  assert.match(verifiezMessage('karim@garage.fr'), /karim@garage\.fr/)
})

test('sans adresse, le message reste générique', () => {
  assert.doesNotMatch(verifiezMessage(''), /@/)
})
