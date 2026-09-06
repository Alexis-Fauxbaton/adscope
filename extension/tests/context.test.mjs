import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ad, block, world } from './world.mjs'

const require = createRequire(import.meta.url)
const src = (f) => join(dirname(fileURLToPath(import.meta.url)), '../src/', f)
const load = (f) => (delete require.cache[require.resolve(src(f))], require(src(f)))

// Le contexte d'un content script se lit sur `chrome.runtime.id` : il disparaît
// avec l'extension que le Store vient de remplacer.
const fresh = (id) => {
  globalThis.ADS = undefined
  globalThis.chrome = { runtime: { id } }
  return load('context.js')
}

const INVALIDATED = () => {
  throw new Error('Extension context invalidated.')
}

test('une erreur ordinaire traverse la garde', () => {
  const context = fresh('adscope')
  assert.throws(
    context.guard(() => {
      throw new TypeError('un vrai défaut')
    }),
    TypeError,
  )
})

test('un contexte disparu arrête le travail avant que le premier appel lève', () => {
  const context = fresh(undefined)
  let called = false
  assert.equal(context.guard(() => (called = true))(), undefined)
  assert.equal(called, false)
})

test("l'erreur du contexte invalidé est absorbée, même si l'identifiant tient encore", () => {
  // L'appel peut lever avant que `chrome.runtime.id` ait disparu : c'est la
  // même panne, vue de l'autre bout.
  const context = fresh('adscope')
  assert.doesNotThrow(context.guard(INVALIDATED))
})

test('un `chrome` démonté ne fait pas lever la garde elle-même', () => {
  const context = fresh('adscope')
  globalThis.chrome = undefined
  assert.doesNotThrow(context.guard(() => chrome.storage.local.set({})))
})

test('les observateurs sont arrêtés dès que le contexte est perdu', () => {
  const context = fresh('adscope')
  const stopped = []
  globalThis.document = { body: {} }
  globalThis.MutationObserver = class {
    constructor(fn) {
      this.fn = fn
    }
    observe() {}
    disconnect() {
      stopped.push(this)
    }
  }
  context.observe(context.guard(INVALIDATED))
  const [observer] = stopped.splice(0)
  assert.equal(observer, undefined, "rien ne s'arrête tant que rien ne s'est produit")

  const run = context.guard(INVALIDATED)
  context.observe(run)
  run()
  assert.equal(stopped.length, 2, 'tous les observateurs, pas seulement celui qui a levé')
})

// Le cas réel : une mise à jour du Store pendant que des onglets leboncoin sont
// ouverts. Les scripts de l'ancienne version y tournent encore.
const PRO = '3254194817'

test("les deux content scripts cessent d'observer quand l'extension est remplacée", () => {
  const w = world(PRO)
  w.load('listing.js')
  w.load('detail.js')
  assert.equal(w.observing(), 2)
  const [badge, panel] = [w.badge(), w.panel()]

  w.invalidate()
  w.mutate(1)
  assert.equal(w.observing(), 0)
  // Ce qui est affiché reste : le script s'arrête, il n'efface rien.
  assert.equal(w.badge(), badge)
  assert.equal(w.panel(), panel)
  w.mutate(20)
})

test("le diagnostic n'écrit plus dans un stockage disparu", () => {
  const w = world(PRO, { path: '/voitures/occasions' })
  w.load('listing.js')
  w.invalidate()
  assert.doesNotThrow(() => ADS.diag.listing([], 0, 'page'))
})

test("l'envoi au suivi ne remonte pas dans la page", () => {
  const w = world(PRO)
  w.load('listing.js')
  w.invalidate()
  assert.doesNotThrow(() => ADS.sync.send([{ site: 'lbc', siteId: '4000000001' }]))
})

test("une charge reçue après le remplacement ne fait plus travailler la page", () => {
  // Le monde MAIN, lui, n'est pas orphelin : il continue de publier ce que le
  // navigateur reçoit, et personne ne doit plus l'écouter.
  const w = world('3263931610', { path: '/voitures/occasions', data: block(ad(PRO)) })
  w.load('listing.js')
  w.invalidate()
  w.receive({ ads: [ad('3263931610')] })
  assert.equal(w.badge(), null)
})
