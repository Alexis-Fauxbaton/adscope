import test from 'node:test'
import assert from 'node:assert/strict'
import { envoiOutcome, estExpire } from '../js/login.js'

// Rouge sur le `reponse.dev_link` de `envoiOutcome` dans js/login.js : sans
// lui, le mode local (`ADSCOPE_DEV_LOGIN=1`) resterait sur le message
// générique et ne montrerait jamais le lien cliquable.
test('la réponse avec dev_link ouvre la carte du mode local', () => {
  assert.equal(envoiOutcome({ sent: true, dev_link: 'https://x/v1/auth/verify?token=t' }), 'dev')
})

// Rouge sur le même `reponse.dev_link` : sans lui, une réponse de prod
// (`{sent: true}`, sans lien) tomberait aussi sur « dev » et afficherait un
// lien qui n'existe pas.
test('la réponse sans dev_link ne montre que le message générique', () => {
  assert.equal(envoiOutcome({ sent: true }), 'sent')
})

// Rouge sur le `new URLSearchParams(search).get('login') === 'expired'` de
// js/login.js : sans lui, `?login=expired` ne se distinguerait pas d'un écran
// de connexion ordinaire, et le marchand ne saurait pas pourquoi son lien n'a
// pas marché.
test('la note d’expiration ne s’affiche que sur ?login=expired', () => {
  assert.equal(estExpire('?login=expired'), true)
  assert.equal(estExpire(''), false)
  assert.equal(estExpire('?login=autre'), false)
})
