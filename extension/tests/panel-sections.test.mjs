import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { ID, SELF, SELLER, SIGNALS, fiche, openTile, point, text } from './panel-page.mjs'

// La liste que la V1 marchand ajoute sous la courbe : un prix qui a bougé, la
// date, et ce que le prix a cédé depuis la première observation. Rouge sur le
// `total: history[i].price - history[0].price` de src/panel-sections.js —
// calculé depuis le point précédent, le cumul répéterait le montant de la
// ligne et le prix paraîtrait n'avoir jamais baissé que d'un cran.
test('chaque changement de prix porte sa date et le cumul depuis la première observation', () => {
  fiche((w) => {
    w.arrive({ [ID]: SIGNALS })
    const said = text(w)
    assert.match(said, /−1\u202f200\u00a0€ le 20 juil\. · −2\u202f200\u00a0€ cumulés/)
    // Le premier changement se tait sur le cumul : il y répéterait son montant.
    assert.match(said, /−1\u202f000\u00a0€ le 14 juin(?! ·)/)
    // Et refermée, la section tient dans son sous-titre.
    openTile(w, 'Cette voiture')
    assert.match(text(w), /2 baisses · −2\u202f200\u00a0€ cumulés/)
  })
})

// L'orangé n'existe que pour ce que le site cache : une hausse se lit à son
// signe. Rouge sur le `n < 0 ? '−' : '+'` de src/panel-sections.js, qui
// afficherait une remontée de prix comme une baisse.
test('une hausse se lit au signe, et le cumul en tient compte', () => {
  fiche((w) => {
    w.arrive({
      [ID]: { ...SIGNALS, price_history: [point(40, 22000), point(30, 20000), point(10, 21000)] },
    })
    assert.match(text(w), /\+1\u202f000\u00a0€ le 27 août · −1\u202f000\u00a0€ cumulés/)
    assert.match(text(w), /−2\u202f000\u00a0€ le 7 août/)
  })
})

// Une annonce suivie sans qu'aucun prix ne bouge : la section existe et le dit,
// plutôt que de laisser croire qu'on n'a pas regardé.
test("sans changement de prix, la section le constate et date le premier relevé", () => {
  fiche((w) => {
    w.arrive({ [ID]: { ...SIGNALS, price_history: [point(118, 22700), point(40, 22700, true)] } })
    assert.match(text(w), /Aucun changement de prix depuis la première observation, le 11 mai 2026\./)
  })
})

// La remontée sans baisse est ce que la date fraîche de la page recouvre :
// c'est elle que le marchand doit voir nommée. Rouge sur le `Math.abs(...) <=
// BUMP_MIN_DAYS * DAY` de src/panel-sections.js — sans la fenêtre, la baisse
// d'il y a deux mois serait mise au compte de la réactualisation d'hier.
test('une réactualisation sans baisse de prix est dite telle', () => {
  fiche((w) => {
    w.arrive({ [ID]: { ...SIGNALS, republished: true, bumped_at: SIGNALS.price_history[0].at } })
    openTile(w, 'Cette voiture')
    assert.match(text(w), /Réactualisée le 11 mai sans baisse de prix\./)
  })
})

// Rouge sur le `fell ? ... : ' sans baisse de prix'` de src/panel-sections.js :
// une remontée accompagnée d'une baisse n'est pas la même annonce qu'une
// remontée au même prix, et les confondre efface le seul fait qui compte.
test('une réactualisation accompagnée d’une baisse dit de combien', () => {
  fiche((w) => {
    w.arrive({ [ID]: { ...SIGNALS, republished: true, bumped_at: SIGNALS.price_history[3].at } })
    openTile(w, 'Cette voiture')
    assert.match(text(w), /Réactualisée le 20 juil\., prix baissé de 1\u202f200\u00a0€\./)
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
    assert.deepEqual(w.relayed().map((m) => m.type), [])
    w.answer('seller', { stats: SELLER })
    assert.doesNotMatch(text(w), /Ce vendeur/)
  }, { owner: SELF })
})

// Le compte d'annonces actives est la ligne que la V1 marchand ajoute : rouge
// sur le `fact(\`${s.listings} annonces actives.\`)` de src/panel-sections.js.
// Il vaut aujourd'hui le nombre d'annonces vues — rien ne disparaît encore en
// base —, et c'est lui qui maigrira le jour où les disparues seront écartées.
test('au delà de trois annonces vues, le marchand a sa section et sa réserve', () => {
  fiche((w) => {
    w.answer('seller', { stats: SELLER })
    assert.match(text(w), /Borgese Auto · 29 annonces vues · 62 % de plus d'un mois/)
    openTile(w, 'Ce vendeur')
    assert.match(text(w), /29 annonces actives\./)
    assert.match(text(w), /29 de ses annonces vues par adscope\./)
    assert.match(text(w), /62 % en ligne depuis plus d'un mois \(18 sur 29\)\./)
    assert.match(text(w), /Ancienneté médiane : 47 jours\./)
    assert.match(text(w), /9 de ses annonces ont baissé après 42 jours en ligne\./)
    assert.match(text(w), /son catalogue réel nous est inconnu/)
  })
})

// Le défaut constaté en vrai : le service worker MV3 endormi au chargement de
// la fiche ferme le port avant de répondre, et sans reprise la section
// n'apparaissait plus jamais pour toute la vie de l'onglet. Rouge sur le
// `setTimeout(() => attempt(l, tries + 1), ...)` de src/market.js : sans lui,
// le second `w.answer('seller', ...)` ci-dessous ne trouve plus de demande à
// répondre, `relayed()` étant resté vide après l'échec.
test('un port fermé au premier essai n’efface pas la section : elle arrive à la reprise', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    fiche((w) => {
      w.fail('seller')
      assert.doesNotMatch(text(w), /Ce vendeur/)
      mock.timers.tick(5000)
      w.answer('seller', { stats: SELLER })
      assert.match(text(w), /Ce vendeur/)
      assert.match(text(w), /Borgese Auto · 29 annonces vues/)
    })
  } finally {
    mock.timers.reset()
  }
})
