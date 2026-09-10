import test from 'node:test'
import assert from 'node:assert/strict'
import { COMPARABLES, SELF, SELLER, fiche, openTile, text } from './panel-page.mjs'

// La distribution ne paraît que si le segment tient : c'est le contrat qui le
// décide, jamais l'extension. Rouge sur le `c.comparable ? [bar(...)]` de
// src/panel-price.js, qui tracerait cinq bornes sur un segment illisible.
test('un segment qui tient rend la barre, ses bornes et le repère de l’annonce', () => {
  fiche((w) => {
    w.answer('comparables', { comparables: COMPARABLES })
    const bar = w.panel().querySelector('.adscope-bar')
    assert.ok(bar)
    assert.deepEqual(bar.querySelectorAll('.adscope-bound-name').map((n) => n.textContent),
      ['min', 'Q1', 'médiane', 'Q3', 'max'])
    assert.match(bar.textContent, /Cette annonce · 22 700 €/)
    assert.match(text(w), /71 % des 37 comparables sont à ce prix ou en dessous\./)
    assert.match(text(w), /Segment retenu : Peugeot 208 2020/)
    // Et refermée, la section se résume au rang et à la dispersion.
    openTile(w, 'Cette voiture')
    assert.match(text(w), /71ᵉ centile de 37 comparables · dispersion 14 %/)
  })
})

test('un segment trop dispersé se refuse à comparer, et dit pourquoi', () => {
  fiche((w) => {
    w.answer('comparables', {
      comparables: { ...COMPARABLES, dispersion: 0.48, percentile: null, comparable: false, reason: 'too_dispersed' },
    })
    assert.equal(w.panel().querySelector('.adscope-bar'), null)
    assert.match(text(w), /37 comparables, segment trop dispersé pour comparer \(dispersion 48 %\)\./)
  })
})

test('sous quinze comparables, le compte est dit et la barre se tait', () => {
  fiche((w) => {
    w.answer('comparables', {
      comparables: { ...COMPARABLES, count: 8, percentile: null, comparable: false, reason: 'too_few' },
    })
    assert.equal(w.panel().querySelector('.adscope-bar'), null)
    assert.match(text(w), /8 comparables suivis : moins de 15, trop peu pour situer ce prix\./)
  })
})

// Le repli du segment est un fait sur la comparaison, pas un détail : la
// version manque à deux annonces sur trois, et taire son abandon laisserait
// croire que l'annonce a été comparée à sa version.
test("la version mise de côté par le segment est dite", () => {
  fiche((w) => {
    w.answer('comparables', { comparables: COMPARABLES })
    assert.match(text(w), /version mise de côté faute d'assez de comparables/)
  })
})

// Rouge sur le `s.listings < MIN_LISTINGS` de src/panel-sections.js : sous
// trois annonces vues, une médiane n'est pas une médiane et une part n'est
// qu'un rang — la section n'existe pas.
test('un marchand dont on a vu deux annonces n’a pas de section', () => {
  fiche((w) => {
    w.answer('seller', { stats: { ...SELLER, listings: 2 } })
    assert.doesNotMatch(text(w), /Ce vendeur/)
  })
})

// Rouge sur le `l.sellerType === 'pro' && l.sellerId` de src/market.js :
// agréger les annonces d'une entreprise est de la donnée d'entreprise, celles
// d'un particulier seraient personnelles — la demande ne part pas.
test('un particulier n’est jamais agrégé, et rien ne le demande', () => {
  fiche((w) => {
    assert.deepEqual(w.relayed().map((m) => m.type), ['comparables'])
    w.answer('seller', { stats: SELLER })
    assert.doesNotMatch(text(w), /Ce vendeur/)
  }, { owner: SELF })
})

test('au delà de trois annonces vues, le marchand a sa section et sa réserve', () => {
  fiche((w) => {
    w.answer('seller', { stats: SELLER })
    assert.match(text(w), /Borgese Auto · 29 annonces vues · 62 % de plus d'un mois/)
    openTile(w, 'Ce vendeur')
    assert.match(text(w), /29 de ses annonces vues par adscope\./)
    assert.match(text(w), /62 % en ligne depuis plus d'un mois \(18 sur 29\)\./)
    assert.match(text(w), /Ancienneté médiane : 47 jours\./)
    assert.match(text(w), /9 de ses annonces ont baissé après 42 jours en ligne\./)
    assert.match(text(w), /son catalogue réel nous est inconnu/)
  })
})

// Ce qui se vérifie ailleurs, et que le panneau ne prétend pas savoir. Une des
// trois questions reprend l'âge réel avec ses chiffres : c'est celle que le
// vendeur n'attend pas.
test("« Avant d'y aller » renvoie à l'État, au contrôle technique et à trois questions", () => {
  fiche((w) => {
    openTile(w, "Avant d'y aller")
    const link = w.panel().querySelector('.adscope-link')
    assert.equal(link.getAttribute('href'), 'https://histovec.interieur.gouv.fr')
    assert.equal(link.getAttribute('rel'), 'noreferrer noopener')
    assert.match(text(w), /contrôle technique : son relevé de compteur date le kilométrage/)
    assert.match(text(w), /À demander : en ligne depuis 1\u202f810 jours, pourquoi n'est-elle pas partie \?/)
    assert.equal(text(w).match(/À demander/g).length, 3)
  })
})
