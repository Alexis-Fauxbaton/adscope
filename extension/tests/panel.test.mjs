import test from 'node:test'
import assert from 'node:assert/strict'
import { ID, SELLER, SIGNALS, fiche, text, tiles } from './panel-page.mjs'

// La maquette pose une chose par carte : le chiffre, puis la courbe. L'âge
// s'épelle — rouge sur le `spell` de src/format.js, qui rendrait « 4 ans » là
// où « 4 ans 11 mois » et « 4 ans » ne décrivent pas le même stock.
test("la carte chiffre épelle l'âge, le compte en jours et le date", () => {
  fiche((w) => {
    assert.match(text(w), /En ligne depuis/)
    assert.match(text(w), /4 ans 11 mois/)
    assert.match(text(w), /1\u202f810 jours · mise en ligne le 22 sept\. 2021/)
  })
})

// Le panneau se pose où le site le déclare. Rouge sur le `mount` de
// src/sites/leboncoin.js : sans lui, il retombe sur le titre de la page, à
// deux écrans du prix que le lecteur est en train de regarder.
test('le panneau se pose sous le bloc que le site nomme', () => {
  fiche((w) => {
    const kin = w.panel().parentElement.children
    assert.match(kin[kin.indexOf(w.panel()) - 1].textContent, /il y a 3 jours/)
  })
})

// Une seule section ouverte à la fois, et c'est la rangée qu'on clique qui
// permute. Rouge sur le `all.find((s) => s.key === chosen)` de src/panel.js :
// figé sur un défaut, le clic n'ouvrirait plus rien.
test('cliquer une rangée repliée permute la section ouverte', () => {
  fiche((w) => {
    w.arrive({ [ID]: SIGNALS })
    assert.match(text(w), /−1\u202f200\u00a0€ le 20 juil\./)
    tiles(w).find((t) => t.textContent.includes('Cette voiture')).click()
    assert.match(text(w), /Suivie par adscope/)
    assert.doesNotMatch(text(w), /−1\u202f200\u00a0€ le 20 juil\./)
    assert.ok(tiles(w).some((t) => t.textContent.includes('Prix')))
  })
})

// Rouge sur le `deck(ctx, root.getAttribute(OPEN), toggle)` de src/panel.js :
// le choix du lecteur vit sur le nœud posé, pas dans une variable du module —
// c'est ce qui le fait survivre aux rendus que la page déclenche sans fin.
test('le panneau rejoué garde la section que le lecteur a ouverte', () => {
  fiche((w) => {
    w.arrive({ [ID]: SIGNALS })
    tiles(w).find((t) => t.textContent.includes('Cette voiture')).click()
    assert.match(text(w), /Suivie par adscope/)
    w.mutate(5)
    assert.match(text(w), /Suivie par adscope/)
    assert.equal(w.panel().querySelectorAll('.adscope-card').length, 4)
  })
})

// Les trois règles intangibles du produit, vérifiées sur tout ce que le panneau
// sait écrire, sections ouvertes une à une.
test("le panneau ne prononce jamais un mot qui lui est interdit", () => {
  fiche((w) => {
    w.arrive({ [ID]: SIGNALS })
    w.answer('seller', { stats: SELLER })
    const seen = [text(w)]
    for (let i = 0; i < 2; i++) {
      tiles(w)[0].click()
      seen.push(text(w))
    }
    for (const said of seen) {
      assert.doesNotMatch(said, /vendue/i)
      assert.doesNotMatch(said, /prix cible|prix juste|bonne affaire/i)
      assert.doesNotMatch(said, /score|note sur|\/10/i)
    }
  })
})

// Rouge sur le `if (asked.has(l.siteId)) return` de src/market.js : le panneau
// est rendu à nouveau chaque fois que le suivi répond, et sans ce garde chaque
// rendu redemanderait à l'API ce qu'elle vient de dire.
test("le vendeur d'une annonce ne se demande qu'une fois", () => {
  fiche((w) => {
    w.mutate(20)
    w.arrive({ [ID]: SIGNALS })
    assert.deepEqual(w.relayed().map((m) => m.type), ['seller'])
    assert.deepEqual(w.relayed()[0], { type: 'seller', site: 'lbc', sellerId: '5551' })
  })
})

// Rouge sur le `ADS.market.stamp(siteId)` du `stampOf` de src/detail.js : sans
// cette marque, le panneau posé avant la réponse porterait la même origine
// après elle, et la section resterait absente jusqu'à la fiche suivante.
test("la réponse du marché fait reparaître le panneau avec sa section", () => {
  fiche((w) => {
    assert.doesNotMatch(text(w), /Ce vendeur/)
    w.answer('seller', { stats: SELLER })
    assert.match(text(w), /Ce vendeur/)
  })
})

// Les deux sections sorties de la V1 marchand. Rouge sur le `all` de
// src/panel-sections.js : y remettre `Ce prix` ou `Avant d'y aller` les ferait
// reparaître dans le panneau, avec la comparaison et l'éditorial qu'on a sortis.
test("ni « Ce prix » ni « Avant d'y aller » ne subsistent dans le panneau", () => {
  fiche((w) => {
    w.arrive({ [ID]: SIGNALS })
    w.answer('seller', { stats: SELLER })
    const seen = [text(w)]
    for (let i = 0; i < 2; i++) {
      tiles(w)[0].click()
      seen.push(text(w))
    }
    for (const said of seen) {
      assert.doesNotMatch(said, /Ce prix|Avant d'y aller|HistoVec|comparables?/i)
    }
    assert.equal(w.panel().querySelector('.adscope-bar'), null)
  })
})
