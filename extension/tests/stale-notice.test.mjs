import test from 'node:test'
import assert from 'node:assert/strict'
import { ad, block, world } from './world.mjs'
import { CARDS, page, results } from './lc-page.mjs'
import { at } from './stage.mjs'

const ID = '3254194817'
const TEXT = /adscope a été mis à jour — rechargez la page/

// Le jour du relevé de la page La Centrale sauvegardée.
const RELEVE = '2026-09-06T18:00:00Z'
// `W103496285` porte une bannière `boostVo` et reparaît plus bas dans les
// résultats : une annonce, deux cartes, deux pastilles à remplacer.
const TWICE = 'W103496285'

// L'onglet resté ouvert à travers une mise à jour de l'extension : les scripts
// de l'ancienne version y tournent encore, et le premier appel `chrome.*` lève.
// C'est l'observateur de la page qui les rappelle — d'où le lot de mutations.
const replaced = (w) => {
  w.invalidate()
  w.mutate(1)
}

// Fait rougir `if (globalThis.ADS && ADS.staleNotice) ADS.staleNotice.show()`
// dans `stop` de src/context.js : sans cet appel, la page reste figée sans le
// dire — c'est le silence que src/context.js entretenait depuis le début.
test("un onglet périmé remplace la pastille par sa mention", () => {
  const w = world(ID, { path: '/voitures/occasions', data: block(ad(ID)) })
  w.load('listing.js')
  assert.ok(w.badge().className.includes('adscope-badge'), 'la pastille est bien posée avant')
  replaced(w)
  const badge = w.badge()
  assert.equal(badge.className, '')
  assert.equal(badge.children.length, 1)
  assert.equal(badge.children[0].className, 'ads-stale-msg')
  assert.match(badge.children[0].textContent, TEXT)
})

// Fait rougir `n.className = ''` et le préfixe `ads-` de src/stale-notice.js :
// le contrôle de santé du crawl (crawler/RUNBOOK.md) compte les
// `[class*="adscope-"]` et doit échouer quand l'extension ne travaille plus.
// Une mention qui porterait ce préfixe ferait tourner le crawl à vide.
// Même règle que la mention de reconnexion : le picto est aria-hidden, le
// title sur la mention porte la marque à sa place. Rouge sur
// `n.setAttribute('title', TEXT)` et `n.append(ADS.icons.mark(), label)` dans
// `mention` de src/stale-notice.js.
test('la mention de mise à jour porte le picto et son title', () => {
  const w = world(ID, { path: '/voitures/occasions', data: block(ad(ID)) })
  w.load('listing.js')
  replaced(w)
  const mention = w.badge().children[0]
  assert.match(mention.getAttribute('title'), TEXT)
  assert.equal(mention.children[0].getAttribute('class'), 'ads-picto')
})

test('la mention ne satisfait pas [class*="adscope-"]', () => {
  const w = world(ID, { path: '/voitures/occasions', data: block(ad(ID)) })
  w.load('listing.js')
  assert.ok(w.doc.querySelectorAll('[class*="adscope-"]').length, 'il y en avait avant')
  replaced(w)
  assert.equal(w.doc.querySelectorAll('[class*="adscope-"]').length, 0)
})

// Fait rougir `node.removeAttribute(DAYS)` de src/stale-notice.js : l'ancienneté
// écrite sur la pastille décrivait un suivi arrêté, elle ne doit pas lui survivre.
test("l'ancienneté écrite sur la pastille ne survit pas à la mention", () => {
  const w = world(ID, { path: '/voitures/occasions', data: block(ad(ID)) })
  w.load('listing.js')
  assert.ok(w.badge().getAttribute('data-adscope-days'), 'elle y était')
  replaced(w)
  assert.equal(w.badge().getAttribute('data-adscope-days'), null)
})

test('le panneau de la fiche se remplace lui aussi', () => {
  const w = world(ID, { path: `/ad/voitures/${ID}`, data: block(ad(ID)) })
  w.load('detail.js')
  assert.equal(w.panel().className, 'adscope-panel')
  replaced(w)
  assert.equal(w.panel().className, '')
  assert.match(w.panel().textContent, TEXT)
})

// Fait rougir `if (posted) return false` de src/stale-notice.js. La garde de
// src/context.js n'est pas rappelée que par l'observateur : tout ce que la page
// déclenche encore passe par elle — un envoi au suivi, une écriture de
// diagnostic —, et chacun rappelle `stop`. Une console qui répète la même ligne
// à chaque fois n'est plus lue.
test("la console ne le dit qu'une fois, quoi que la page déclenche encore", () => {
  const w = world(ID, { path: '/voitures/occasions', data: block(ad(ID)) })
  w.load('listing.js')
  replaced(w)
  assert.equal(w.said().filter((l) => TEXT.test(l)).length, 1)
  ADS.sync.send([{ site: 'lbc', siteId: ID }])
  ADS.diag.listing([], 0, 0, 'page', { old: 0, alerts: 0 })
  w.mutate(20)
  assert.equal(w.said().filter((l) => TEXT.test(l)).length, 1)
})

// L'onglet périmé ne peut plus parler au service worker : sa mention se pose
// depuis la page seule. Fait rougir la mention elle-même si elle passait par un
// message — l'envoi lèverait, et rien ne serait posé.
test("la mention se pose sans envoyer le moindre message", () => {
  const w = world(ID, { path: '/voitures/occasions', data: block(ad(ID)) })
  w.load('listing.js')
  const before = w.messages().length
  assert.doesNotThrow(() => replaced(w))
  assert.equal(w.messages().length, before)
  assert.equal(w.badge().children[0].className, 'ads-stale-msg')
})

// Le pendant sur l'autre site, et sur une annonce que la page montre deux fois :
// toutes ses cartes portent la mention, pas seulement la première.
test('sur une page de résultats La Centrale, chaque carte reçoit la mention', () => {
  const w = at(RELEVE, () => {
    const w = page({
      path: '/listing',
      scripts: results(CARDS),
      cards: CARDS.map((c) => c.reference),
      boost: TWICE,
    })
    w.load('listing.js')
    return w
  })
  const badges = w.badgesOf(TWICE)
  assert.equal(badges.length, 2, 'une annonce, deux cartes')
  replaced(w)
  for (const badge of w.badgesOf(TWICE)) {
    assert.equal(badge.className, '')
    assert.match(badge.textContent, TEXT)
  }
  assert.equal(w.doc.querySelectorAll('[class*="adscope-"]').length, 0)
})
