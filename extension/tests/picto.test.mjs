import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { El } from './stage.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const src = (f) => join(here, '../src/', f)

globalThis.document = { createElement: (t) => new El(t), createElementNS: (_ns, t) => new El(t) }
globalThis.ADS = undefined
require(src('panel-node.js'))
require(src('panel-icons.js'))

// Le picto est repris du favicon du site (web/index.html) telle quelle : carré
// indigo arrondi, anneau blanc. Rouge sur le corps de `ADS.icons.mark` dans
// src/panel-icons.js — une autre forme, et ce n'est plus la marque.
test('ADS.icons.mark reprend le favicon : carré indigo, anneau blanc', () => {
  const mark = ADS.icons.mark()
  assert.equal(mark.getAttribute('viewBox'), '0 0 32 32')
  assert.equal(mark.getAttribute('aria-hidden'), 'true')
  const [rect, circle] = mark.children
  assert.equal(rect.tag, 'rect')
  assert.equal(rect.getAttribute('fill'), '#4F46E5')
  assert.equal(rect.getAttribute('rx'), '9')
  assert.equal(circle.tag, 'circle')
  assert.equal(circle.getAttribute('fill'), 'none')
  assert.equal(circle.getAttribute('stroke'), 'white')
})

// Rouge sur `class: 'ads-picto'` de src/panel-icons.js : le contrôle de santé
// du crawl (crawler/RUNBOOK.md) compte les `[class*="adscope-"]`, et le picto
// se pose sur chaque pastille déjà comptée par ce sélecteur — lui donner ce
// préfixe doublerait le compte sans qu'une annonce de plus ne soit suivie.
test('le picto ne satisfait jamais [class*="adscope-"]', () => {
  assert.equal(ADS.icons.mark().matches('[class*="adscope-"]'), false)
})

// La taille est le seul réglage laissé au point d'appel — 12 px sur une
// pastille, un peu plus dans un en-tête. Rouge sur le défaut `size = 12` de
// src/panel-icons.js.
test('le picto tient la taille demandée, 12 px par défaut', () => {
  assert.equal(ADS.icons.mark().getAttribute('width'), '12')
  assert.equal(ADS.icons.mark(16).getAttribute('width'), '16')
})
