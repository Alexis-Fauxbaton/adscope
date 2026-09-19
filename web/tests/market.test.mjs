import test from 'node:test'
import assert from 'node:assert/strict'
import { messageVide } from '../js/market.js'

// Rouge sur le `q ? … : RIEN` de `messageVide` dans js/market.js : sans lui,
// une recherche texte sans résultat afficherait le même message générique
// qu'un filtre ordinaire, et le marchand ne saurait pas ce qu'il a tapé.
test('l’état vide nomme la recherche en cours', () => {
  assert.equal(
    messageVide({ q: 'ferrari' }),
    'Aucune annonce pour « ferrari » parmi celles qu\'adscope a vues.',
  )
})

// Rouge sur le `.trim()` de `messageVide` : une recherche vide ou blanche
// n'est pas une recherche, elle ne doit pas se citer dans le message.
test('sans recherche, l’état vide reste générique', () => {
  assert.equal(messageVide({ q: '' }), 'Aucune annonce vue ne répond à ces filtres.')
  assert.equal(messageVide({ q: '   ' }), 'Aucune annonce vue ne répond à ces filtres.')
  assert.equal(messageVide({}), 'Aucune annonce vue ne répond à ces filtres.')
})
