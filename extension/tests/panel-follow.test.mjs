import test from 'node:test'
import assert from 'node:assert/strict'
import { FIRST, ID, SELLER, SIGNALS, buttons, fiche, text } from './panel-page.mjs'

const asked = (w) => w.relayed().filter((m) => m.type === 'follow')

// L'état nommé par le contrat : `first_seen` aujourd'hui et un seul relevé — la
// visite en cours est la première jamais faite. Rouge sur le `unseen` de
// src/panel-cards.js : sans lui, la carte d'attente promettrait une courbe à
// une annonce que personne n'a demandé à revoir, et ne proposerait rien.
test("la première fois qu'adscope voit une annonce, il le dit et propose de la suivre", () => {
  fiche((w) => {
    w.arrive({ [ID]: FIRST })
    assert.match(text(w), /Première fois qu'adscope voit cette annonce — pas encore suivie\./)
    assert.doesNotMatch(text(w), /la courbe apparaîtra/)
    assert.equal(w.panel().querySelector('.adscope-plot'), null)
    assert.deepEqual(buttons(w).map((b) => b.textContent), ['Suivre', 'Suivre'])
  })
})

// Rouge sur le `chrome.runtime.sendMessage({ type: 'follow', ... })` de
// src/follow.js : le suivi s'écrit par licence, côté serveur, et le content
// script ne peut pas l'appeler lui-même — il porte l'origine du site ouvert.
test('le bouton Suivre demande le suivi au service worker', () => {
  fiche((w) => {
    w.arrive({ [ID]: FIRST })
    buttons(w)[1].click()
    assert.deepEqual(asked(w), [{ type: 'follow', site: 'lbc', siteId: ID }])
  })
})

// Rouge sur le `root.setAttribute(FOLLOWED, ctx.listing.siteId)` de
// src/panel.js : l'état vit sur le nœud posé, et la fiche rejoue son rendu à
// chaque réponse — sans cette marque, le bouton redemanderait à être cliqué.
test('une fois le suivi accepté, la carte et le bouton le disent', () => {
  fiche((w) => {
    w.arrive({ [ID]: FIRST })
    buttons(w)[1].click()
    w.answer('follow', { followed_at: '2026-09-06T12:00:00Z' })
    assert.match(text(w), /Suivie depuis aujourd'hui\./)
    assert.doesNotMatch(text(w), /pas encore suivie/)
    // Et le rendu suivant, celui que déclenche la réponse du vendeur, le garde.
    w.answer('seller', { stats: SELLER })
    assert.deepEqual(buttons(w).map((b) => b.textContent), ['Suivie'])
  })
})

// Rouge sur le `if (asked.has(at)) return` de src/follow.js : le panneau est
// rendu à nouveau sans fin, et la réponse du serveur n'est pas immédiate — deux
// clics avant elle ne font pas deux suivis.
test('deux clics avant la réponse ne demandent le suivi qu’une fois', () => {
  fiche((w) => {
    w.arrive({ [ID]: FIRST })
    buttons(w)[1].click()
    buttons(w)[1].click()
    assert.equal(asked(w).length, 1)
  })
})

// Rouge sur le `ctx.remote.followed ||` de src/panel.js : ce que la licence suit
// déjà arrive avec les signaux, et le panneau n'a rien à redemander pour le
// savoir — le bouton de l'en-tête le porte sur toute fiche, courbe comprise.
// Rouge sur le `return asked.delete(at)` de src/follow.js : sans lui, un clic
// qui échoue verrouille le bouton pour le reste de la vie de l'onglet — un
// clic de l'utilisateur perdu en silence, sans recours. Aucune reprise
// automatique ici : c'est un geste, pas une lecture, et c'est à l'utilisateur
// de redemander.
test('un suivi qui échoue laisse le bouton recliquable, et le second clic renvoie la demande', () => {
  fiche((w) => {
    w.arrive({ [ID]: FIRST })
    buttons(w)[1].click()
    w.fail('follow')
    assert.equal(asked(w).length, 0)
    assert.deepEqual(buttons(w).map((b) => b.textContent), ['Suivre', 'Suivre'])
    buttons(w)[1].click()
    assert.equal(asked(w).length, 1)
    w.answer('follow', { followed_at: '2026-09-06T12:00:00Z' })
    assert.match(text(w), /Suivie depuis aujourd'hui\./)
  })
})

// Rouge sur le `if (e && e.isTrusted)` de src/panel-cards.js : le bouton vit
// dans la page, et n'importe quel script qui y tourne peut le cliquer lui-même
// sans geste du lecteur (audit offensif, angle extension, T1) — un suivi
// n'est demandé que sur un clic réel.
test('un clic forgé par la page ne demande pas le suivi', () => {
  fiche((w) => {
    w.arrive({ [ID]: FIRST })
    buttons(w)[1].click(false)
    assert.deepEqual(asked(w), [])
    assert.deepEqual(buttons(w).map((b) => b.textContent), ['Suivre', 'Suivre'])
  })
})

test('une annonce déjà suivie par la licence est dite suivie, sans rien demander', () => {
  fiche((w) => {
    w.arrive({ [ID]: { ...SIGNALS, followed: true } })
    assert.ok(w.panel().querySelector('.adscope-plot'))
    const [head] = buttons(w)
    assert.equal(head.textContent, 'Suivie')
    head.click()
    assert.deepEqual(asked(w), [])
  })
})
