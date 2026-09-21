import test from 'node:test'
import assert from 'node:assert/strict'
import { ID, SIGNALS, fiche, stamp } from './panel-page.mjs'

// La fenêtre orangée — ce que le site montre de son côté — quand elle est trop
// mince pour son libellé. Constaté le 2026-09-21 sur une fiche leboncoin
// remontée le jour même : « Affiché par le site » sortait du tracé, coupé en
// « Affi ».

const at = (w, width) => {
  w.panel().querySelector('.adscope-plot-box').clientWidth = width
  ADS.plot.fit(w.panel())
  return w.panel().querySelector('.adscope-plot')
}
const band = (svg) => svg.querySelector('.adscope-window')
const claim = (svg) => svg.querySelector('.adscope-window-label')

// Rouge sur le `w < 8` de `window_`, dans src/panel-curve.js : sans lui, une
// remontée du jour dessinerait un aplat sans largeur et son libellé hors cadre.
test("une annonce remontée aujourd'hui ne dessine ni fenêtre ni libellé", () => {
  fiche((w) => {
    w.arrive({ [ID]: SIGNALS })
    const svg = at(w, 620)
    assert.equal(band(svg), null)
    assert.equal(claim(svg), null)
  }, { index_date: stamp(0) })
})

// Rouge sur le `if (at.x2 + 9 > g.px(1)) return` de `window_` : dix jours sur
// 118 font un aplat d'une cinquantaine de pixels, le libellé en demande 135.
test("une fenêtre plus mince que son libellé se dessine sans lui", () => {
  fiche((w) => {
    w.arrive({ [ID]: SIGNALS })
    const svg = at(w, 620)
    assert.ok(band(svg))
    assert.equal(claim(svg), null)
  }, { index_date: stamp(10) })
})

// Et la fenêtre de la maquette — soixante jours sur 118 — garde le sien : le
// garde ne doit pas mordre sur le cas courant.
test('une fenêtre large garde son libellé', () => {
  fiche((w) => {
    w.arrive({ [ID]: SIGNALS })
    assert.equal(claim(at(w, 620)).textContent, 'Affiché par le site')
  })
})
