import test from 'node:test'
import assert from 'node:assert/strict'
import { outcomeFor } from '../js/login.js'
import { ApiError } from '../js/api-auth.js'

// Rouge sur `err.status === 403` dans `outcomeFor` de js/login.js : sans lui,
// une connexion refusée pour compte non vérifié retomberait sur le
// formulaire d'erreur générique au lieu du renvoi d'email.
test('le 403 bascule sur l’écran « vérifiez votre email »', () => {
  assert.equal(outcomeFor(new ApiError(403, 'Vérifiez votre email : un lien vous attend dans votre boîte.')), 'verifiez')
})

// Rouge sur le même `=== 403` : un mot de passe faux (401) ou un plafond
// (429) doivent rester sur le formulaire, jamais glisser vers le renvoi.
test('les autres échecs restent sur le formulaire', () => {
  assert.equal(outcomeFor(new ApiError(401, 'Email ou mot de passe incorrect.')), 'erreur')
  assert.equal(outcomeFor(new ApiError(429, 'Trop de tentatives. Réessayez dans quelques minutes.')), 'erreur')
})
