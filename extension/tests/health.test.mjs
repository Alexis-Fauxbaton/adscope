import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { storage } from './storage.mjs'

const require = createRequire(import.meta.url)
const src = (f) => join(dirname(fileURLToPath(import.meta.url)), '../src/', f)

// Aucune horloge réelle : le service worker lit `Date.now`, et le test la pose.
const NOW = 1757160000000
const KEY = 'adsc_' + 'a'.repeat(32)
const LBC = 'https://www.leboncoin.fr/*'
const LC = 'https://www.lacentrale.fr/*'
const API = 'http://localhost:8000/*'
const ALL = [API, LBC, LC]

const listing = (siteId) => ({ site: 'lbc', siteId, price: 9900 })

// Le service worker tel qu'il tourne, avec le navigateur qu'on lui donne :
// `granted` dit quelles origines sont encore accordées, `status` ce que l'API
// répond, `offline` si elle ne répond pas du tout. Les trois se changent en
// cours de test — c'est ainsi qu'on joue la panne puis le retour à la normale.
const boot = ({ granted = ALL, status = 200, offline = false, licenseKey = '' } = {}) => {
  const store = storage({ entries: { licenseKey, apiBase: 'http://api' } })
  const badge = []
  let listener = null
  let now = NOW
  Date.now = () => now
  globalThis.ADS = undefined
  globalThis.chrome = {
    storage: { local: store.local },
    runtime: {
      onMessage: { addListener: (fn) => (listener = fn) },
      getManifest: () => JSON.parse(readFileSync(src('../manifest.json'), 'utf8')),
    },
    action: {
      setBadgeText: async (o) => badge.push(o),
      setBadgeBackgroundColor: async () => {},
    },
    permissions: {
      contains: async ({ origins }) => origins.every((o) => granted.includes(o)),
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
  globalThis.fetch = async () => {
    if (offline) throw new TypeError('Failed to fetch')
    return { ok: status < 400, status, json: async () => [] }
  }
  delete require.cache[require.resolve(src('sw.js'))]
  require(src('sw.js'))
  return {
    badge,
    // Le badge de l'icône entière, le seul que l'état de santé pose.
    icon: () => (badge.length ? badge.at(-1).text : null),
    kinds: () => ADS.health.list().map((p) => p.kind),
    problems: () => ADS.health.list(),
    grant: (origins) => (granted = origins),
    respond: (s) => ((status = s), (offline = false)),
    cut: () => (offline = true),
    tick: (ms) => (now += ms),
    ask: async (msg) => (await ADS.access.ready(), new Promise((r) => listener(msg, null, r))),
    // Le badge par onglet : le service worker lit l'onglet sur l'expéditeur.
    tell: async (alerts) =>
      new Promise((r) => listener({ type: 'badge', alerts }, { tab: { id: 7 } }, r)),
  }
}

// Une synchronisation qui échoue n'est pas une panne du test : elle est le fait
// que le test observe. Le refus remonte par la réponse, jamais par un rejet.
const sync = (w, id = '1') => w.ask({ type: 'sync', site: 'lbc', listings: [listing(id)] })

// ── L'accès à un site, coupé dans Chrome ────────────────────────────────────

// Fait rougir `ADS.health.note({ kind: 'site_access', … }, !on)` de
// src/access.js : sans lui, un accès retiré ne laisse aucune trace — c'est
// exactement le silence de douze jours du 2026-09-19.
test("un accès de site retiré devient un problème nommé, et pose le « ! »", async () => {
  const w = boot({ granted: [API, LBC] })
  await w.ask({ type: 'health' })
  assert.deepEqual(w.kinds(), ['site_access'])
  assert.equal(w.problems()[0].origin, LC)
  assert.equal(w.problems()[0].name, 'La Centrale')
  assert.equal(w.icon(), '!')
})

// Fait rougir `if (!on) return problems.delete(key)` de src/health.js : sans le
// retrait, la fenêtre continuerait de réclamer un geste déjà fait.
test("l'accès rendu efface le problème et le « ! »", async () => {
  const w = boot({ granted: [API, LBC] })
  await w.ask({ type: 'health' })
  assert.equal(w.icon(), '!')
  w.grant(ALL)
  await w.ask({ type: 'health' })
  assert.deepEqual(w.kinds(), [])
  assert.equal(w.icon(), '')
})

// Fait rougir `keyOf` de src/health.js, qui range un problème d'accès par
// site : sans le site dans la clé, le second effacerait le premier.
test('deux sites coupés font deux problèmes, un par site', async () => {
  const w = boot({ granted: [API] })
  const { problems } = await w.ask({ type: 'health' })
  assert.equal(problems.length, 2)
  assert.deepEqual(problems.map((p) => p.origin).sort(), [LC, LBC].sort())
})

// ── Le serveur injoignable ──────────────────────────────────────────────────

// Fait rougir `count >= FAILS && now - since >= SPAN_MS` de src/reach.js : un
// 5xx passager, ou une seule coupure, ne doit pas faire clignoter d'alerte.
test('un seul échec ne dit rien', async () => {
  const w = boot({ offline: true })
  assert.equal((await sync(w)).ok, false)
  assert.deepEqual(w.kinds(), [])
  assert.equal(w.icon(), '')
})

test('deux échecs à trente secondes de distance disent le serveur injoignable', async () => {
  const w = boot({ offline: true })
  await sync(w, '1')
  w.tick(30000)
  await sync(w, '2')
  assert.deepEqual(w.kinds(), ['unreachable'])
  assert.equal(w.icon(), '!')
})

// La rafale existe : une page de résultats rappelle `send` à chaque lot de
// mutations. Deux échecs dans la même seconde ne sont pas un diagnostic.
test("deux échecs dans la même seconde ne disent rien", async () => {
  const w = boot({ offline: true })
  await sync(w, '1')
  w.tick(900)
  await sync(w, '2')
  assert.deepEqual(w.kinds(), [])
})

// Fait rougir `status >= 500` de src/reach.js : un serveur qui répond mal est
// une panne comme une autre, et doit finir par se dire.
test("des 5xx répétés finissent par dire le serveur injoignable", async () => {
  const w = boot({ status: 503 })
  await sync(w, '1')
  assert.deepEqual(w.kinds(), [])
  w.tick(30000)
  await sync(w, '2')
  assert.deepEqual(w.kinds(), ['unreachable'])
})

// Fait rougir la remise à zéro de `count`/`since` dans `answered` de
// src/reach.js : sans elle, une réussite laisserait l'alerte posée.
test('un appel réussi efface le serveur injoignable', async () => {
  const w = boot({ offline: true })
  await sync(w, '1')
  w.tick(30000)
  await sync(w, '2')
  assert.deepEqual(w.kinds(), ['unreachable'])
  w.respond(200)
  await sync(w, '3')
  assert.deepEqual(w.kinds(), [])
  assert.equal(w.icon(), '')
})

// Fait rougir `count = 0` / `since = 0` d'`answered` dans src/reach.js : sans
// la remise à zéro, la première coupure venue après une réussite rallumerait
// l'alerte d'un coup — le compteur vaudrait encore trois, et l'instant du
// premier échec remonterait à une demi-heure.
test("après une réussite, il faut de nouveau deux échecs espacés", async () => {
  const w = boot({ offline: true })
  await sync(w, '1')
  w.tick(30000)
  await sync(w, '2')
  w.respond(200)
  await sync(w, '3')
  w.tick(30000)
  w.cut()
  await sync(w, '4')
  assert.deepEqual(w.kinds(), [])
})

// La mauvaise consigne à ne jamais donner : un serveur arrêté n'a rien à voir
// avec une session tombée, et « reconnectez-vous » n'y ferait rien.
test("un serveur injoignable ne dit jamais de se reconnecter", async () => {
  const w = boot({ offline: true })
  await sync(w, '1')
  w.tick(30000)
  await sync(w, '2')
  const [problem] = w.problems()
  assert.equal(problem.kind, 'unreachable')
  assert.doesNotMatch(ADS.health.says(problem).text, /reconnect/i)
})

// Fait rougir `count = 0` de la branche non-5xx d'`answered` : un 401 est une
// réponse du serveur, donc la preuve qu'il est joignable. Confondus, les deux
// problèmes s'afficheraient ensemble et l'un des deux serait faux.
test("un 401 dit la session tombée, pas le serveur injoignable", async () => {
  const w = boot({ offline: true })
  await sync(w, '1')
  w.tick(30000)
  w.respond(401)
  await sync(w, '2')
  assert.deepEqual(w.kinds(), ['logged_out'])
})

// ── La session tombée, dans l'état commun ───────────────────────────────────

// Fait rougir `ADS.health.note({ kind: 'logged_out' }, authRequired)` de
// src/auth.js : la session tombée est un problème parmi les autres, listé
// comme eux — le badge seul ne suffisait pas à la fenêtre.
test('un 401 hors mode clé entre dans la liste des problèmes', async () => {
  const w = boot({ status: 401 })
  await sync(w)
  assert.deepEqual(w.kinds(), ['logged_out'])
  assert.equal(w.icon(), '!')
  w.respond(200)
  await sync(w, '2')
  assert.deepEqual(w.kinds(), [])
})

// Fait rougir `!cfg.licenseKey &&` de `mark` dans src/auth.js : une clé de
// machine mauvaise est son propre défaut, pas une session à rouvrir.
test("en mode clé, un 401 n'entre dans aucune liste", async () => {
  const w = boot({ status: 401, licenseKey: KEY })
  await sync(w)
  assert.deepEqual(w.kinds(), [])
  assert.equal(w.icon(), '')
})

// ── Plusieurs à la fois, et ce que l'icône en fait ──────────────────────────

// Fait rougir le tri par `ORDER` de src/health.js : l'accès d'abord — c'est le
// seul qui se répare sans quitter la fenêtre. L'ordre d'apparition est ici
// l'inverse de celui d'affichage, sans quoi le tri ne prouverait rien : la
// session tombe d'abord, l'accès est coupé ensuite.
test('trois problèmes à la fois tiennent ensemble, dans un ordre fixe', async () => {
  const w = boot({ status: 401 })
  await sync(w, '1')
  w.cut()
  w.tick(30000)
  await sync(w, '2')
  w.tick(30000)
  await sync(w, '3')
  w.grant([API])
  const { problems } = await w.ask({ type: 'health' })
  assert.deepEqual(problems.map((p) => p.kind), ['site_access', 'site_access', 'logged_out', 'unreachable'])
})

// Fait rougir `ADS.health.text() || alerts <= 0 ? null : String(alerts)` de
// src/sw.js : un texte posé sur l'onglet, fût-il vide, recouvre le badge
// global — c'est ainsi que le « ! » restait invisible là où on regardait.
test("un problème en cours laisse passer le « ! » sur l'onglet", async () => {
  const w = boot({ granted: [API] })
  await w.ask({ type: 'health' })
  const res = await w.tell(4)
  assert.equal(res.text, null)
  // `null`, pas `''` : c'est ce qui retire la surcharge de l'onglet et laisse
  // reparaître le badge global. Une chaîne vide la poserait, et masquerait tout.
  assert.deepEqual(w.badge.filter((b) => 'tabId' in b), [{ tabId: 7, text: null }])
})

// Fait rougir `show()` de src/health.js : sans le garde-fou de `painted`,
// chaque appel réussi repeindrait l'icône.
test("l'icône ne se repeint qu'au changement d'état", async () => {
  const w = boot()
  await sync(w, '1')
  await sync(w, '2')
  assert.deepEqual(w.badge, [{ text: '' }])
})
