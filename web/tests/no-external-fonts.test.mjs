import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const webDir = fileURLToPath(new URL('..', import.meta.url))

const htmlFiles = readdirSync(webDir).filter((f) => f.endsWith('.html'))
const cssFiles = readdirSync(new URL('../css/', import.meta.url)).filter((f) => f.endsWith('.css'))

// D10 : plus aucune police (ni rien d'autre) ne se charge chez un tiers —
// `web/index.html` etc. chargeaient `fonts.googleapis.com`/`fonts.gstatic.com`
// avant ce correctif.
test('aucun .html du site ne charge une police (ou autre ressource) externe', () => {
  for (const f of htmlFiles) {
    const source = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
    assert.ok(!/https?:\/\/fonts\.(googleapis|gstatic)\.com/.test(source), `${f} charge une police externe`)
  }
})

test('aucun .css du site n’importe ou n’adresse une police externe', () => {
  for (const f of cssFiles) {
    const source = readFileSync(new URL(`../css/${f}`, import.meta.url), 'utf8')
    assert.ok(!/https?:\/\/fonts\.(googleapis|gstatic)\.com/.test(source), `${f} référence une police externe`)
  }
})
