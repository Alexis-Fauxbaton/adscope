import test from 'node:test'
import assert from 'node:assert/strict'
import { detail, open } from './popup-dom.mjs'

const LC = 'https://www.lacentrale.fr/*'
const LBC = 'https://www.leboncoin.fr/*'

const cut = (site, name, origin) => ({ kind: 'site_access', site, name, origin })
const OUT = { kind: 'logged_out' }
const DOWN = { kind: 'unreachable' }

const box = (w) => w.nodes.alerts
const lines = (w) => box(w).children
const said = (line) => line.children[0].textContent
const act = (line) => line.children[1]

// Fait rougir `box.hidden = !nodes.length` de `fill` dans popup/dom.js, tel que
// popup/alerts.js s'en sert : une section vide laissée visible ferait croire à
// une panne là où tout va bien.
test("rien en tête de la fenêtre quand tout va bien", async () => {
  const w = await open({ status: detail() })
  assert.equal(box(w).hidden, true)
  assert.equal(lines(w).length, 0)
})

// Fait rougir `ADS.alerts.show()` dans popup/popup.js : sans cet appel, la
// fenêtre s'ouvrirait sur le diagnostic d'une page qu'elle ne peut plus lire.
test("un accès de site coupé s'annonce, avec le nom du site et son bouton", async () => {
  const w = await open({ status: detail(), problems: [cut('lc', 'La Centrale', LC)] })
  assert.equal(box(w).hidden, false)
  assert.equal(lines(w).length, 1)
  assert.equal(said(lines(w)[0]), 'La Centrale : accès désactivé')
  assert.equal(act(lines(w)[0]).textContent, 'Réactiver')
})

// Fait rougir `chrome.permissions.request({ origins: [p.origin] })` de
// popup/alerts.js : c'est le seul geste qui rende l'accès, et il ne vaut que
// pour l'origine du site coupé — jamais une autre, jamais toutes.
test('le bouton Réactiver demande au navigateur la bonne origine', async () => {
  const w = await open({ status: detail(), problems: [cut('lc', 'La Centrale', LC)] })
  await act(lines(w)[0]).click()
  assert.deepEqual(w.requested, [{ origins: [LC] }])
})

// Un problème, un bouton : la fenêtre ne propose jamais deux gestes pour une
// même panne, et chaque site coupé a le sien.
test('deux sites coupés font deux phrases et deux boutons, un par site', async () => {
  const w = await open({
    status: detail(),
    problems: [cut('lbc', 'leboncoin', LBC), cut('lc', 'La Centrale', LC)],
  })
  assert.equal(lines(w).length, 2)
  assert.deepEqual(lines(w).map((l) => l.children.filter((c) => c.tag === 'button').length), [1, 1])
  await act(lines(w)[1]).click()
  assert.deepEqual(w.requested, [{ origins: [LC] }])
})

// Fait rougir l'entrée `unreachable` de `SAYS` dans src/health.js : dire
// « reconnectez-vous » devant un serveur arrêté envoie le lecteur refaire un
// geste qui n'y changera rien.
test("un serveur injoignable ne propose pas de se reconnecter", async () => {
  const w = await open({ status: detail(), problems: [DOWN] })
  assert.equal(said(lines(w)[0]), 'adscope est injoignable.')
  assert.equal(act(lines(w)[0]).textContent, 'Réessayer')
  assert.doesNotMatch(said(lines(w)[0]), /reconnect/i)
})

// Fait rougir `unreachable: () => ask({ type: 'me' })` de popup/alerts.js : le
// bouton doit refaire un vrai appel — c'est sa réussite, pas le clic, qui
// efface le problème. Et il ne demande aucune permission : il n'en manque pas.
test('le bouton Réessayer refait un appel, et ne demande rien au navigateur', async () => {
  const w = await open({ status: detail(), problems: [DOWN] })
  const before = w.messages.filter((m) => m.type === 'me').length
  await act(lines(w)[0]).click()
  assert.equal(w.messages.filter((m) => m.type === 'me').length, before + 1)
  assert.deepEqual(w.requested, [])
})

// Fait rougir `logged_out: () => ADS.account.openApp()` de popup/alerts.js :
// la session se rouvre sur le site, pas dans la fenêtre.
test("une session tombée renvoie à l'application, sur l'adresse configurée", async () => {
  const w = await open({ status: detail(), problems: [OUT], apiBase: 'http://api' })
  assert.equal(said(lines(w)[0]), 'Session adscope expirée : reconnectez-vous.')
  await act(lines(w)[0]).click()
  assert.deepEqual(w.opened, [{ url: 'http://api/app', target: '_blank' }])
})

// Trois pannes à la fois, chacune avec son geste : la fenêtre ne choisit pas
// pour le lecteur, elle les pose toutes, dans l'ordre que l'état de santé tient.
test('trois problèmes à la fois font trois phrases et trois boutons', async () => {
  const w = await open({ status: detail(), problems: [cut('lc', 'La Centrale', LC), OUT, DOWN] })
  assert.equal(lines(w).length, 3)
  assert.deepEqual(lines(w).map((l) => act(l).textContent), ['Réactiver', 'Se reconnecter', 'Réessayer'])
})

// Le mode clé, pour les machines : ce qu'elles font n'a pas changé, et la
// fenêtre qu'aucune n'ouvre ne leur réclame rien.
test("la fenêtre n'invente aucun problème quand le service worker n'en rapporte pas", async () => {
  const w = await open({ status: detail(), licenseKey: 'adsc_' + 'b'.repeat(32) })
  assert.deepEqual(w.messages.filter((m) => m.type === 'health').length, 1)
  assert.equal(lines(w).length, 0)
  assert.deepEqual(w.requested, [])
})
