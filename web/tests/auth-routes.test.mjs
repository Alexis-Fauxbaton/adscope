import test from 'node:test'
import assert from 'node:assert/strict'
import { emailFromHash, pageFor, tokenFromHash, withoutToken } from '../js/auth-routes.js'

// Rouge sur `PAGES[splitHash(hash).route]` dans `pageFor` de js/auth-routes.js :
// sans lui, chaque route publique rendrait le même écran.
test('le hash choisit la page', () => {
  assert.equal(pageFor('#/connexion'), 'connexion')
  assert.equal(pageFor('#/inscription'), 'inscription')
  assert.equal(pageFor('#/verifiez?email=karim%40garage.fr'), 'verifiez')
  assert.equal(pageFor('#/verification?token=abc'), 'verification')
  assert.equal(pageFor('#/mdp-oublie'), 'mdp-oublie')
  assert.equal(pageFor('#/nouveau-mdp?token=abc'), 'nouveau-mdp')
})

// Rouge sur le `|| 'connexion'` de `pageFor` : sans lui, une route inconnue
// (ou un hash de l'application authentifiée) planterait au lieu de retomber
// sur la connexion.
test('une route inconnue retombe sur la connexion', () => {
  assert.equal(pageFor('#/marche?brand=Peugeot'), 'connexion')
  assert.equal(pageFor(''), 'connexion')
})

// Rouge sur `new URLSearchParams(splitHash(hash).query).get('token')` de
// `tokenFromHash` : sans lui, la page d'arrivée ne saurait pas quel jeton
// poster.
test('le jeton se lit dans le fragment, pas dans la requête', () => {
  assert.equal(tokenFromHash('#/verification?token=abc123'), 'abc123')
  assert.equal(tokenFromHash('#/verification'), null)
})

test('l’adresse se lit dans le fragment de #/verifiez', () => {
  assert.equal(emailFromHash('#/verifiez?email=karim%40garage.fr'), 'karim@garage.fr')
  assert.equal(emailFromHash('#/verifiez'), '')
})

// Rouge sur `url.hash = splitHash(url.hash).route` de `withoutToken` : sans
// lui, un simple rechargement de la page d'arrivée rejouerait le jeton — déjà
// consommé, donc un 400 au lieu du succès affiché juste avant.
test('le jeton est retiré de l’URL après usage, la route reste', () => {
  const sans = withoutToken('http://localhost:8000/app/?demo=1#/verification?token=abc123')
  assert.equal(sans, '/app/?demo=1#/verification')
})
