import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Trouvé en capturant docs/picto-pastilles.png dans un vrai Chromium : le
// manifeste chargeait `panel-icons.js` APRÈS `listing.js`, qui appelle
// `ADS.icons.mark()` dès son premier rendu, synchrone, au chargement du
// script — « Cannot read properties of undefined (reading 'mark') ». Le banc
// de test (stage.mjs) ne le voyait pas : il charge tout le décor avant
// `listing.js`, quel que soit l'ordre écrit au manifeste. Rouge si
// panel-node.js/panel-icons.js repassent après un de leurs usagers.
test('le picto charge avant tout ce qui peut le demander dès son premier rendu', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
  const idle = manifest.content_scripts.filter((cs) => cs.run_at === 'document_idle')
  assert.equal(idle.length, 2, 'un jeu de scripts document_idle par site')
  for (const cs of idle) {
    const at = (f) => cs.js.indexOf(f)
    const node = at('src/panel-node.js'), icons = at('src/panel-icons.js')
    assert.ok(node >= 0 && icons >= 0, cs.matches[0])
    assert.ok(node < icons, `panel-node.js avant panel-icons.js — ${cs.matches[0]}`)
    for (const consumer of ['src/stale-notice.js', 'src/auth-notice.js', 'src/listing.js', 'src/panel.js', 'src/detail.js']) {
      assert.ok(icons < at(consumer), `panel-icons.js avant ${consumer} — ${cs.matches[0]}`)
    }
  }
})
