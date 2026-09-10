import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { El } from './popup-dom.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
globalThis.document = { createElementNS: (_ns, t) => new El(t) }
globalThis.ADS = undefined
for (const f of ['../src/format.js', '../src/curve.js', '../popup/labels.js', '../popup/chart.js']) {
  delete require.cache[require.resolve(join(here, f))]
  require(join(here, f))
}
const { curve, labels, chart } = globalThis.ADS

const DAY = 86400000
const NOW = new Date('2026-09-06T12:00:00Z')
const ago = (days) => new Date(NOW.getTime() - days * DAY)
const point = (days, price, confirmation = false) => ({ at: ago(days), price, confirmation })

// Ce que la suite ne savait pas voir : trois textes se disputant la même bande.
// Une assertion sur le contenu passe au vert pendant que le rendu est illisible
// — seule la boîte de chaque texte le dit. La chasse fixe la donne exactement.
const written = (svg) =>
  svg.children.filter((n) => n.tag === 'text' && n.getAttribute('class')).map((n) => ({
    text: n.textContent, cls: n.getAttribute('class'),
    x: Number(n.getAttribute('x')), y: Number(n.getAttribute('y')),
  }))

const readable = (model, why) => {
  const marks = written(chart.draw(model))
  for (const m of marks) {
    assert.ok(m.cls.split(' ')[0] in labels.SIZE, `${why} : corps inconnu pour « ${m.cls} »`)
    const b = labels.box(m)
    assert.ok(b.x1 >= 0 && b.x2 <= 312, `${why} : « ${m.text} » sort du cadre (${b.x1}–${b.x2})`)
  }
  for (let i = 0; i < marks.length; i++) {
    for (let j = i + 1; j < marks.length; j++) {
      const [a, b] = [labels.box(marks[i]), labels.box(marks[j])]
      assert.ok(!labels.clash(a, b), `${why} : « ${marks[i].text} » recouvre « ${marks[j].text} »`)
    }
  }
  return marks
}

// La géométrie du défaut : hachure longue à gauche, observations tassées à
// droite. C'est le cas le plus fréquent sur La Centrale, donc celui qui se
// verrait en permanence.
test('fiche plafonnée : rien ne se recouvre sous la hachure longue', () => {
  const model = curve.plot({
    publishedAt: ago(1810), now: NOW, claimDays: 60,
    history: [point(118, 24900), point(90, 24900, true), point(48, 22700), point(2, 22700, true)],
  })
  assert.ok(model.blind.w > 0.9, 'la hachure couvre bien presque tout l’axe')
  const marks = readable(model, 'fiche plafonnée')
  assert.equal(marks.length, 2)
})

// L'exigence nommée : la phrase datée ne se négocie pas. Elle a quitté le tracé
// pour sa ligne sous l'axe — donc aucun texte du tracé ne doit la porter.
test('le tracé ne porte aucune phrase, seulement des montants', () => {
  const model = curve.plot({ publishedAt: ago(1810), now: NOW, price: 22700 })
  for (const m of written(chart.draw(model))) {
    assert.doesNotMatch(m.text, /observation/, 'la phrase de la hachure reste hors du tracé')
    assert.equal(m.cls.split(' ')[0], 'amount')
  }
})

test("une seule observation ne pose qu'un montant, et il tient", () => {
  const model = curve.plot({ publishedAt: ago(1810), now: NOW, price: 22700 })
  assert.equal(readable(model, 'observation unique').length, 1)
})

test('plusieurs baisses rapprochées restent lisibles', () => {
  const model = curve.plot({
    publishedAt: ago(1810), now: NOW,
    history: [point(28, 15900), point(21, 15400), point(14, 14900), point(7, 14500), point(1, 14500, true)],
  })
  readable(model, 'baisses rapprochées')
})

test('un cas aéré montre les deux montants', () => {
  const model = curve.plot({
    publishedAt: ago(118), now: NOW,
    history: [point(118, 14900), point(90, 13900), point(48, 12900), point(2, 12900, true)],
  })
  assert.equal(readable(model, 'cas aéré').length, 2)
})

// Le balayage : toutes les formes de courbe que l'échantillonnage sait produire,
// sur des axes de un jour à cinq ans. C'est le verrou — une géométrie choisie à
// la main n'aurait pas trouvé le recouvrement, une revue non plus.
test('aucune géométrie de courbe ne fait se recouvrir deux textes', () => {
  const shapes = [
    [22900], [22900, 21500, 22700], [14000, 16000, 14300], [9900, 9900],
    [149900, 139900, 129900], [1200, 1150], [22900, 21500, 22800, 21900, 22850],
    [999999, 500000, 999999], [4990, 4990, 4990], [15900, 14000, 15500],
  ]
  for (const axis of [1, 7, 30, 118, 400, 1810]) {
    for (const gap of [0, 0.25, 0.9]) {
      for (const prices of shapes) {
        const seen = Math.max(1, Math.round(axis * (1 - gap)))
        const history = prices.map((price, i) => point(
          Math.max(0, Math.round(seen - (i * seen) / Math.max(1, prices.length - 1))), price, i > 0 && price === prices[i - 1],
        ))
        const model = curve.plot({ publishedAt: ago(axis), now: NOW, history })
        readable(model, `axe ${axis} j, vide ${gap}, prix ${prices.join('/')}`)
      }
    }
  }
})
