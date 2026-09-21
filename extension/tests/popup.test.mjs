import test from 'node:test'
import assert from 'node:assert/strict'
import { detail, open, signals } from './popup-dom.mjs'

// Rouge sur `window.open` dans le handler `el('open-app').onclick` de
// popup/account.js : sans lui, le bouton ne fait rien.
test('le bouton « Ouvrir adscope » ouvre l’app du site dans un nouvel onglet', async () => {
  const { nodes, opened } = await open({ status: detail(), apiBase: 'http://api' })
  nodes['open-app'].onclick()
  assert.deepEqual(opened, [{ url: 'http://api/app', target: '_blank' }])
})

// Rouge sur `isBase(apiBase)` du même handler : sans lui, une adresse mal
// formée ouvrirait quand même un onglet vers une URL invalide.
test('une adresse d’API mal formée ne déclenche aucune ouverture', async () => {
  const { nodes, opened } = await open({ status: detail(), apiBase: 'pas une adresse' })
  nodes['open-app'].onclick()
  assert.deepEqual(opened, [])
})

// Un humain ne voit plus jamais de clé : la popup lit `/v1/me` par le service
// worker, jamais une clé stockée — c'est `showAccount` dans popup/account.js.
test('popup déconnectée propose de se connecter, sans montrer de compte', async () => {
  const { nodes } = await open({ status: detail(), me: { ok: false } })
  assert.equal(nodes['open-app'].textContent, 'Se connecter')
  assert.equal(nodes.account.hidden, true)
})

test('popup connectée affiche l’email du compte, pas une clé', async () => {
  const { nodes } = await open({ status: detail(), me: { ok: true, email: 'garage@dupont.fr', label: 'Garage Dupont' } })
  assert.equal(nodes.account.hidden, false)
  assert.equal(nodes.account.textContent, 'garage@dupont.fr')
  assert.equal(nodes['open-app'].textContent, 'Ouvrir adscope')
})

// Une clé de machine n'a pas d'email : `/v1/me` répond `email: null`, et la
// popup doit rester sur « Se connecter » plutôt que de montrer un compte vide.
test('une clé de machine ne fait pas passer la popup pour un compte connecté', async () => {
  const { nodes } = await open({ status: detail(), me: { ok: true, email: null, label: 'crawl' } })
  assert.equal(nodes.account.hidden, true)
  assert.equal(nodes['open-app'].textContent, 'Se connecter')
})

// Le même picto que sur une pastille et dans le panneau, cette fois dans le
// nom de la fenêtre. Rouge sur `el('brand-mark').append(ADS.icons.mark())` en
// tête de popup/popup.js.
test('la fenêtre porte le picto de marque en tête de son nom', async () => {
  const { nodes } = await open({ status: detail() })
  assert.equal(nodes['brand-mark'].children[0].getAttribute('class'), 'ads-picto')
})

// Le lot de la refonte : la fenêtre ne répète plus ce que le panneau montre
// déjà dans la page. Rouge sur la liste de `<script>` de popup/popup.html et
// sur `showFiche` de popup/popup.js — y remettre la courbe, le relevé ou le
// vendeur ferait reparaître ce qu'on a retiré.
test('la fenêtre ne redit ni la courbe, ni le relevé, ni le vendeur', async () => {
  const { nodes, messages } = await open({ status: detail(), cached: signals() })
  for (const gone of ['plot', 'points', 'points-rows', 'seller', 'seller-box', 'claim', 'hatch', 'tracking']) {
    assert.equal(nodes[gone], undefined, gone)
  }
  // Et rien n'est demandé au vendeur : la section n'existe plus.
  assert.deepEqual(messages.filter((m) => m.type === 'seller'), [])
})

// Elle ne parle pas non plus d'une page de résultats : ses pastilles le disent
// déjà carte par carte. Rouge sur le `status.kind !== 'detail'` de popup.js.
test('hors d’une fiche, la fenêtre renvoie aux sites couverts', async () => {
  const { nodes } = await open({
    status: { kind: 'listing', site: 'lc', url: '/listing', payload: true, listings: 23, pro: 21, badges: 23, sent: 23, old: 9, alerts: 4 },
  })
  assert.equal(nodes.fiche.hidden, true)
  assert.equal(nodes.empty.hidden, false)
  assert.match(nodes.empty.text, /leboncoin/)
  assert.match(nodes.empty.text, /La Centrale/)
})

test('sans page analysée, la fenêtre nomme les sites pris en charge', async () => {
  const { nodes } = await open({ status: undefined })
  assert.equal(nodes.fiche.hidden, true)
  assert.equal(nodes.empty.hidden, false)
  assert.match(nodes.empty.text, /annonce voiture/)
})
