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

// Le bloc vendeur part au chargement, sans geste de l'utilisateur, et sa
// demande porte la clé de licence : c'est le seul appel qui l'envoyait sans
// avoir validé sa destination, contrairement au test et à l'enregistrement.
test("une adresse d'API mal formée ne reçoit pas la clé", async () => {
  const { asked } = await open({ status: detail(), apiBase: 'pas une adresse' })
  assert.equal(asked.length, 0)
})

test("une adresse dont l'accès n'est pas accordé ne reçoit pas la clé", async () => {
  const { asked, nodes } = await open({ status: detail(), granted: false })
  assert.equal(asked.length, 0)
  assert.equal(nodes['seller-box'].hidden, true)
})

test('sans clé de licence, aucune demande ne part', async () => {
  const { asked } = await open({ status: detail(), licenseKey: '' })
  assert.equal(asked.length, 0)
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
