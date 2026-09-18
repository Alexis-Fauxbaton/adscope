import test from 'node:test'
import assert from 'node:assert/strict'
import { detail, open, signals, stats } from './popup-dom.mjs'

test('sur une fiche de marchand, la popup demande et montre ce qu’on a vu', async () => {
  const { nodes, asked } = await open({ status: detail(), cached: signals() })
  assert.equal(asked[0], 'http://api/v1/sellers/lbc/73911')
  assert.equal(nodes['seller-box'].hidden, false)
  assert.equal(nodes['seller-title'].textContent, 'Ce vendeur — ENTREPOT 222')
  assert.match(nodes.seller.text, /11 annonces de ce vendeur vues par adscope/)
  assert.match(nodes.seller.text, /Médiane d'ancienneté/)
})

// La portée n'est pas une note de bas de page : elle est lue avant les
// chiffres, sinon le lecteur prend l'échantillon pour le catalogue.
test('la fenêtre affiche la portée du relevé avec ses chiffres', async () => {
  const { nodes } = await open({ status: detail() })
  assert.match(nodes.seller.text, /30 derniers jours/)
  assert.match(nodes.seller.text, /catalogue réel nous est inconnu/)
})

test('un particulier ne déclenche aucune demande et aucun bloc', async () => {
  const { nodes, asked } = await open({
    status: detail({ sellerType: 'private', sellerId: null, sellerName: null }),
  })
  assert.equal(asked.length, 0)
  assert.equal(nodes['seller-box'].hidden, true)
})

test('une page de résultats ne parle pas de vendeur', async () => {
  const { nodes, asked } = await open({
    status: { kind: 'listing', site: 'lbc', url: '/voitures', payload: true, listings: 24, pro: 18, badges: 24, sent: 24, old: 6, alerts: 2 },
  })
  assert.equal(asked.length, 0)
  assert.equal(nodes['seller-box'].hidden, true)
})

// Un vendeur que la base ne connaît pas encore : la popup se tait plutôt que
// d'afficher un bloc vide.
test('un vendeur inconnu laisse la fenêtre inchangée', async () => {
  const { nodes } = await open({
    status: detail(), answer: async () => ({ ok: false, status: 404 }),
  })
  assert.equal(nodes['seller-box'].hidden, true)
})

test('la note du petit échantillon arrive jusqu’à la fenêtre', async () => {
  const { nodes } = await open({
    status: detail(),
    answer: async () => ({ ok: true, json: async () => stats({ listings: 3, aged: 3, over_a_month: 1, over_a_month_share: 0.333, median_age_days: 12 }) }),
  })
  assert.match(nodes.seller.text, /3 annonces/)
})

// Fait rougir le passage de `showSeller` par le relais du service worker
// (`ask({ type: 'seller', ... })`, dans popup/popup.js) plutôt qu'un `fetch`
// propre à la popup : sans licence configurée, la demande doit partir quand
// même — en cookie de session, comme `src/lookup.js` que `sw.js` appelle pour
// elle — et non plus se taire faute de clé.
test('sans clé de licence, la section « Ce vendeur » part quand même', async () => {
  const { asked, nodes } = await open({ status: detail(), licenseKey: '' })
  assert.equal(asked[0], 'http://api/v1/sellers/lbc/73911')
  assert.equal(nodes['seller-box'].hidden, false)
})

// Rouge sur `window.open` dans le handler `el('open-app').onclick` de
// popup/popup.js : sans lui, le bouton ne fait rien.
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
// worker, jamais une clé stockée — c'est `showAccount` dans popup.js.
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
