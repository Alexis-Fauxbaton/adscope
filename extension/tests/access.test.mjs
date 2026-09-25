import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { storage } from './storage.mjs'

const require = createRequire(import.meta.url)
const src = (f) => join(dirname(fileURLToPath(import.meta.url)), '../src/', f)

const LC = 'https://www.lacentrale.fr/*'

// Même décor que badge.test.mjs, réduit à ce qui distingue ce test : `contains`
// lève sur une origine au lieu de répondre `true`/`false`.
const boot = () => {
  globalThis.ADS = undefined
  globalThis.chrome = {
    storage: { local: storage({ entries: {} }).local },
    runtime: {
      onMessage: { addListener: () => {} },
      getManifest: () => JSON.parse(readFileSync(src('../manifest.json'), 'utf8')),
    },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    permissions: {
      // Illisible sur La Centrale seulement : leboncoin répond normalement,
      // pour prouver que seule l'origine en cause est concernée.
      contains: async ({ origins }) => {
        if (origins.includes(LC)) throw new Error('permissions.contains illisible')
        return true
      },
      onAdded: { addListener: () => {} },
      onRemoved: { addListener: () => {} },
    },
  }
  globalThis.importScripts = (...files) => {
    for (const f of files) {
      const at = src(f.replace('/src/', ''))
      delete require.cache[require.resolve(at)]
      require(at)
    }
  }
  delete require.cache[require.resolve(src('sw.js'))]
  require(src('sw.js'))
}

// Fait rougir `.catch(() => true)` de src/access.js:granted — le fail-open
// documenté en commentaire (« une permission illisible n'est pas une
// permission refusée »). Sans lui, une erreur de `chrome.permissions.contains`
// (mesurée en réel, voir le commentaire de tête d'access.js) ferait remonter
// un problème « site_access » sur une origine pourtant accordée.
test('une permission illisible ne devient jamais un problème « site_access »', async () => {
  boot()
  await ADS.access.ready()
  assert.deepEqual(ADS.health.list().filter((p) => p.kind === 'site_access'), [])
})
