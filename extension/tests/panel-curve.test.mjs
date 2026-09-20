import test from 'node:test'
import assert from 'node:assert/strict'
import { ID, SIGNALS, fiche, point, stamp, text } from './panel-page.mjs'

// Rouge sur `if (history.length < 2 && !moved) return null` de
// src/panel-curve.js : sans ce garde, une annonce vue une fois se verrait
// tracer une courbe d'un seul point, et la carte pâle ne paraîtrait jamais.
test('sous deux relevés la carte pâle remplace la courbe', () => {
  fiche((w) => {
    w.arrive({ [ID]: { ...SIGNALS, tracked_days: 1, observations: 1, price_history: [point(1, 22700)] } })
    assert.match(text(w), /1 relevé en 1 jour — la courbe apparaîtra d'elle-même\./)
    assert.equal(w.panel().querySelector('.adscope-plot'), null)
  })
})

test('deux relevés suffisent à tracer la courbe et à la dater', () => {
  fiche((w) => {
    w.arrive({ [ID]: SIGNALS })
    assert.match(text(w), /Prix relevé · 118 jours/)
    assert.ok(w.panel().querySelector('.adscope-plot'))
    assert.equal(w.panel().querySelector('.adscope-card--soft'), null)
    // Trois prix, trois montants — aux espaces fines insécables du français.
    assert.deepEqual(w.panel().querySelectorAll('.adscope-amount').map((n) => n.textContent),
      ['24\u202f900', '23\u202f900', '22\u202f700'])
    assert.match(text(w), /11 mai 2026/)
    assert.match(text(w), /auj\./)
  })
})

// La phrase se compose des points relevés : deux baisses, une seule dans les
// soixante jours affichés. Rouge sur le `if (seen >= all.length) return null`
// de src/panel-note.js, qui l'écrirait même quand le site ne cache rien.
test('la phrase de la fenêtre se compte sur les baisses observées', () => {
  fiche((w) => {
    w.arrive({ [ID]: SIGNALS })
    assert.match(text(w), /Dans les 60 jours affichés, une seule des deux baisses est visible\./)
  })
})

test('une fenêtre qui ne cache aucune baisse ne fait écrire aucune phrase', () => {
  fiche((w) => {
    // Une seule baisse, tombée quatre-vingt-dix jours avant le relevé : les
    // soixante jours affichés ne la montrent pas du tout.
    w.arrive({ [ID]: { ...SIGNALS, price_history: [point(118, 24900), point(90, 23900)] } })
    assert.match(text(w), /La seule baisse observée tombe hors des 60 jours affichés\./)
  }, { index_date: stamp(60) })
})

// Rouge sur le `if (seen >= all.length) return null` de src/panel-note.js :
// sans lui, une fenêtre qui montre tout se verrait reprocher ce qu'elle ne
// cache pas — et la phrase perdrait tout son poids là où elle compte.
test('une fenêtre qui montre toutes les baisses ne se fait rien dire', () => {
  fiche((w) => {
    w.arrive({ [ID]: SIGNALS })
    assert.ok(w.panel().querySelector('.adscope-window'))
    assert.doesNotMatch(text(w), /jours affichés/)
  }, { index_date: stamp(100) })
})

test("sans fenêtre affichée par le site, la courbe ne commente rien", () => {
  fiche((w) => {
    w.arrive({ [ID]: SIGNALS })
    assert.doesNotMatch(text(w), /jours affichés/)
  }, { index_date: stamp(1810) })
})

// Une seule ligne grise sous la courbe, jamais deux : ce que la maquette ne
// montre pas doit se limiter au garde-fou d'honnêteté, pas s'étaler en carte
// « Suivie depuis » / « Prix » séparée. Rouge sur le `card.append(...legend(ctx.remote))`
// de src/panel-cards.js : le retirer fait disparaître la ligne, en ajouter une
// deuxième la ferait apparaître deux fois.
test('sous la courbe, une seule ligne grise porte le suivi et sa cadence', () => {
  fiche((w) => {
    w.arrive({ [ID]: { ...SIGNALS, price_gap_days: 1, price_checks: 40 } })
    const fine = w.panel().querySelectorAll('.adscope-fine')
    assert.equal(fine.length, 1)
    assert.equal(fine[0].textContent, 'Suivie depuis 3 mois · vérifiée chaque jour')
  })
})

// La cadence hebdomadaire, elle, se lit sur un `price_gap_days` différent —
// rouge sur le seuil `CHECKED_MAX_DAYS` de src/view.js.
test('un relevé moins fréquent redit « chaque semaine » sous la courbe', () => {
  fiche((w) => {
    w.arrive({ [ID]: { ...SIGNALS, price_gap_days: 6, price_checks: 12 } })
    assert.equal(w.panel().querySelector('.adscope-fine').textContent, 'Suivie depuis 3 mois · vérifiée chaque semaine')
  })
})

const plot = (w) => w.panel().querySelector('.adscope-plot')
const box = (w) => w.panel().querySelector('.adscope-plot-box')
const at = (w, width) => {
  box(w).clientWidth = width
  ADS.plot.fit(w.panel())
  return plot(w)
}

// Le texte d'un SVG rétrécit avec son `viewBox` : dans une colonne de 300 px,
// « 3 990 » et les dates de l'axe devenaient microscopiques. Le tracé se
// dessine donc dans un repère en pixels d'écran — `viewBox` et `width` portent
// la même largeur, l'échelle vaut 1, et un corps de 12,5 px reste 12,5 px.
// Rouge sur le `frame(width)` de src/panel-curve.js : un cadre figé à 572
// rendrait un rapport `viewBox`/`width` différent de 1 à chaque autre largeur.
test("le tracé se dessine à l'échelle 1, quelle que soit la colonne", () => {
  fiche((w) => {
    w.arrive({ [ID]: SIGNALS })
    for (const width of [300, 400, 620]) {
      const svg = at(w, width)
      assert.equal(svg.getAttribute('width'), String(width), `${width} px`)
      assert.equal(svg.getAttribute('viewBox'), `0 0 ${width} 210`, `${width} px`)
    }
  })
})

// Avant toute mesure — la carte n'est pas encore dans la page —, le tracé est
// dessiné à la largeur de la maquette, et jamais sous le plancher. Rouge sur le
// `draw(m, width = WIDE)` de src/panel-curve.js, et sur le `Math.max(NARROW, …)`
// de son `frame` : l'un tient le défaut, l'autre le plancher.
test('sans largeur mesurée, le tracé prend celle de la maquette', () => {
  fiche((w) => {
    w.arrive({ [ID]: SIGNALS })
    assert.equal(plot(w).getAttribute('width'), '572')
    // Et une colonne absurde ne rétrécit pas au-delà du plancher.
    assert.equal(at(w, 80).getAttribute('width'), '180')
  })
})

// À l'étroit, ce sont les libellés qui cèdent, jamais leur corps : les deux
// bornes de l'axe restent écrites — elles disent ce que la courbe couvre —, et
// les dates de changement s'effacent quand il n'y a plus la place. Rouge sur le
// `fits` de src/panel-labels.js tel que `write` l'emploie : l'encombrement se
// calcule sur le repère réel, donc il ne rend pas le même verdict à 300 px
// qu'à 620.
test("à l'étroit, un libellé cède sa place plutôt que sa taille", () => {
  fiche((w) => {
    w.arrive({ [ID]: SIGNALS })
    const axis = (width) =>
      at(w, width).children.filter((n) => n.getAttribute('class') === 'adscope-axis').map((n) => n.textContent)
    const wide = axis(620)
    const narrow = axis(300)
    assert.deepEqual(wide, ['11 mai 2026', 'auj.', '14 juin', '20 juil.'])
    assert.ok(narrow.includes('11 mai 2026') && narrow.includes('auj.'), narrow.join(' · '))
    assert.ok(narrow.length < wide.length, `${narrow.join(' · ')} contre ${wide.join(' · ')}`)
  })
})
