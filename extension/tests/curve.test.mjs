import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
globalThis.ADS = undefined
const curve = require(join(here, '../src/curve.js'))

const DAY = 86400000
const NOW = new Date('2026-09-06T12:00:00Z')
const ago = (days) => new Date(NOW.getTime() - days * DAY)
const point = (days, price, confirmation = false) => ({ at: ago(days), price, confirmation })

// L'axe est la vie de l'annonce, pas la fenêtre de suivi : c'est la durée qui
// est le sujet, le prix n'est que ce qu'on trace dessus.
test("l'axe couvre toute la vie de l'annonce, de la mise en ligne à aujourd'hui", () => {
  const p = curve.plot({ publishedAt: ago(118), now: NOW, price: 12900, history: [point(60, 14900)] })
  assert.equal(p.days, 118)
  assert.equal(p.from.getTime(), ago(118).getTime())
  assert.equal(p.to.getTime(), NOW.getTime())
  // La première observation tombe à mi-course, pas à l'origine : l'annonce
  // vivait cinquante-huit jours avant qu'on la voie.
  assert.ok(Math.abs(p.points[0].x - 58 / 118) < 0.01, String(p.points[0].x))
})

// L'exigence : une hachure sans date ne dit rien. « aucune observation » seul
// laisse croire à un trou quelconque ; la date dit lequel.
test('la période sans observation porte une date explicite', () => {
  const p = curve.plot({ publishedAt: ago(1810), now: NOW, price: 22700, history: [] })
  assert.ok(p.blind, 'une annonce vue pour la première fois aujourd’hui a un passé aveugle')
  assert.match(p.blind.text, /aucune observation avant le/)
  assert.match(p.blind.text, /6 septembre/)
  assert.equal(p.blind.until.getTime(), NOW.getTime())
})

test("la hachure s'arrête à la première observation, pas à aujourd'hui", () => {
  const p = curve.plot({ publishedAt: ago(118), now: NOW, history: [point(60, 14900), point(0, 12900)] })
  assert.ok(Math.abs(p.blind.w - 58 / 118) < 0.01)
  assert.match(p.blind.text, /8 juillet/)
})

// Une annonce croisée dès sa mise en ligne n'a pas de passé aveugle : hachurer
// un jour de rien serait un signe qui ne dit rien.
test("une annonce suivie depuis sa mise en ligne ne porte aucune hachure", () => {
  const p = curve.plot({ publishedAt: ago(30), now: NOW, history: [point(30, 9900), point(0, 9900, true)] })
  assert.equal(p.blind, null)
})

// Deux signes, deux sens : un gros point est un changement constaté, un petit
// une vérification qui n'a rien trouvé. L'échantillonnage hebdomadaire les
// distingue à la source, l'affichage ne doit pas les confondre.
test('un changement de prix et une vérification ne portent pas le même signe', () => {
  const p = curve.plot({
    publishedAt: ago(40), now: NOW,
    history: [point(40, 14900), point(33, 14900, true), point(26, 12900), point(19, 12900, true)],
  })
  assert.deepEqual(p.points.map((q) => q.change), [true, false, true, false])
})

test('les prix se placent entre le plus bas et le plus haut observés', () => {
  const p = curve.plot({ publishedAt: ago(40), now: NOW, history: [point(40, 14900), point(20, 12900)] })
  assert.equal(p.min, 12900)
  assert.equal(p.max, 14900)
  assert.equal(p.points[0].y, 1)
  assert.equal(p.points[1].y, 0)
})

// Un prix qui n'a jamais bougé n'est pas au ras du bord : il n'y a ni haut ni
// bas à montrer, la ligne se pose au milieu.
test("un prix unique se place au milieu plutôt qu'au bord", () => {
  const p = curve.plot({ publishedAt: ago(40), now: NOW, history: [point(40, 9900), point(10, 9900, true)] })
  assert.deepEqual(p.points.map((q) => q.y), [0.5, 0.5])
})

// La dégradation honnête : sans historique, la fenêtre montre la seule
// observation qu'elle a — celle de la page ouverte — au lieu d'une ligne plate
// qu'elle ne saurait pas justifier.
test("sans historique, la courbe ne montre que l'observation du jour", () => {
  const p = curve.plot({ publishedAt: ago(1810), now: NOW, price: 22700, history: [] })
  assert.equal(p.points.length, 1)
  assert.equal(p.points[0].price, 22700)
  assert.equal(p.points[0].x, 1)
  // Presque tout l'axe est hachuré : c'est ce que l'annonce nous a laissé voir.
  assert.ok(p.blind.w > 0.99)
})

// La bande rouge a un seul usage : ce que le site montre de son côté. Sur la
// fiche plafonnée, soixante jours sur mille huit cent dix.
test('la bande rouge occupe exactement ce que le site affiche', () => {
  const p = curve.plot({ publishedAt: ago(1810), now: NOW, price: 22700, claimDays: 60 })
  assert.ok(Math.abs(p.band.w - 60 / 1810) < 0.001)
  assert.ok(Math.abs(p.band.x - (1 - 60 / 1810)) < 0.001)
  assert.equal(p.band.days, 60)
})

test('sans contradiction affichée par le site, aucune bande rouge', () => {
  const p = curve.plot({ publishedAt: ago(23), now: NOW, price: 4990 })
  assert.equal(p.band, null)
})

// Le site ne peut pas montrer plus que la vie de l'annonce : une bande plus
// longue que l'axe déborderait du cadre.
test("la bande rouge ne dépasse jamais l'axe", () => {
  const p = curve.plot({ publishedAt: ago(10), now: NOW, price: 4990, claimDays: 60 })
  assert.equal(p.band.w, 1)
  assert.equal(p.band.x, 0)
})

test("une annonce mise en ligne aujourd'hui garde un axe traçable", () => {
  const p = curve.plot({ publishedAt: NOW, now: NOW, price: 4990 })
  assert.equal(p.days, 1)
  assert.equal(p.points.length, 1)
  assert.equal(p.blind, null)
})

test("l'axe se lit en clair à ses deux bouts", () => {
  const p = curve.plot({ publishedAt: new Date('2021-09-22T16:17:55Z'), now: NOW, price: 22700 })
  assert.match(p.axis.start, /2021/)
  assert.equal(p.axis.end, 'auj.')
})
