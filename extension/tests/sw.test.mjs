import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { storage } from './storage.mjs'

const require = createRequire(import.meta.url)
const src = (f) => join(dirname(fileURLToPath(import.meta.url)), '../src/', f)

const NOW = 1757160000000
const HOUR = 3600000
const KEY = 'adsc_' + 'a'.repeat(32)
const key = (id) => `a:lbc:${id}`

const listing = (siteId, price = 9900) => ({ site: 'lbc', siteId, price })
const signalsOf = (id) => ({ site_id: id, tracked_days: 4, price: 9900 })

// Le service worker tel qu'il tourne : le cache et l'authentification lui
// sont fournis par `importScripts`, les messages arrivent par l'écouteur
// qu'il pose. `status` se change en cours de test avec `setStatus` — c'est
// ainsi qu'on rejoue un 401 qui tombe, puis un appel qui repasse.
const boot = ({ entries = {}, licenseKey = KEY, offline = false, status = 200 } = {}) => {
  const store = storage({ entries: { licenseKey, apiBase: 'http://api', ...entries } })
  const calls = []
  const auths = []
  const badge = []
  let currentStatus = status
  let listener = null
  Date.now = () => NOW
  globalThis.ADS = undefined
  globalThis.chrome = {
    storage: { local: store.local },
    runtime: { onMessage: { addListener: (fn) => (listener = fn) } },
    action: {
      setBadgeText: async (o) => badge.push(o),
      setBadgeBackgroundColor: async () => {},
    },
  }
  globalThis.importScripts = (...files) => {
    for (const f of files) {
      const at = src(f.replace('/src/', ''))
      delete require.cache[require.resolve(at)]
      require(at)
    }
  }
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : undefined })
    auths.push({ url, headers: init.headers, credentials: init.credentials })
    if (offline) throw new TypeError('Failed to fetch')
    const batch = url.endsWith('/batch')
    const absent = url.endsWith('/disappearances')
    return {
      ok: currentStatus < 400,
      status: currentStatus,
      json: async () =>
        batch ? JSON.parse(init.body).ids.map(signalsOf)
        : absent ? { verdict: 'first' }
        : { accepted: 1 },
    }
  }
  delete require.cache[require.resolve(src('sw.js'))]
  require(src('sw.js'))
  return {
    store, calls, auths, badge,
    setStatus: (s) => (currentStatus = s),
    ask: (msg) => new Promise((r) => listener(msg, null, r)),
  }
}

const seed = (id, at, sig = '9900||') => ({
  [key(id)]: { at, sig, signals: signalsOf(id) },
})

test("une annonce inconnue du cache est transmise puis interrogée", async () => {
  const { calls, ask, store } = boot()
  const res = await ask({ type: 'sync', site: 'lbc', listings: [listing('1')] })
  assert.deepEqual(calls.map((c) => c.url), ['http://api/v1/observations', 'http://api/v1/listings/batch'])
  assert.equal(res.sent, 1)
  assert.equal(res.signals['1'].tracked_days, 4)
  assert.equal(store.data[key('1')].at, NOW)
})

test("une annonce vue il y a moins de six heures ne repart pas", async () => {
  const { calls, ask } = boot({ entries: seed('1', NOW - 5 * HOUR) })
  const res = await ask({ type: 'sync', site: 'lbc', listings: [listing('1')] })
  assert.deepEqual(calls, [])
  assert.equal(res.ok, true)
  assert.equal(res.sent, 0)
  assert.equal(res.skipped, 1)
})

test('passé le seuil de fraîcheur, elle repart', async () => {
  const { calls, ask } = boot({ entries: seed('1', NOW - 7 * HOUR) })
  await ask({ type: 'sync', site: 'lbc', listings: [listing('1')] })
  assert.equal(calls.length, 2)
})

// Le seuil range les passages répétés, il ne doit pas retenir une nouvelle.
test('un prix différent de celui du cache passe outre le seuil', async () => {
  const { calls, ask } = boot({ entries: seed('1', NOW - HOUR) })
  await ask({ type: 'sync', site: 'lbc', listings: [listing('1', 9500)] })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].body.items[0].price, 9500)
})

test("seul ce qui manque ou a vieilli est envoyé à l'API", async () => {
  const entries = { ...seed('1', NOW - HOUR), ...seed('2', NOW - 9 * HOUR) }
  const { calls, ask } = boot({ entries })
  const res = await ask({
    type: 'sync', site: 'lbc',
    listings: [listing('1'), listing('2'), listing('3')],
  })
  assert.deepEqual(calls[0].body.items.map((i) => i.site_id), ['2', '3'])
  assert.deepEqual(calls[1].body.ids, ['2', '3'])
  assert.equal(res.skipped, 1)
})

test('les signaux reçus rejoignent le cache pour la prochaine visite', async () => {
  const { store, ask } = boot()
  await ask({ type: 'sync', site: 'lbc', listings: [listing('1'), listing('2')] })
  assert.deepEqual(Object.keys(store.data).filter((k) => k.startsWith('a:')).sort(), [key('1'), key('2')])
  assert.equal(store.data[key('2')].signals.tracked_days, 4)
})

test('hors ligne, le cache répond seul et sans réseau', async () => {
  const { calls, ask } = boot({ offline: true, entries: seed('1', NOW - 40 * HOUR) })
  const res = await ask({ type: 'cached', site: 'lbc', ids: ['1', '2'] })
  assert.deepEqual(calls, [])
  assert.equal(res.signals['1'].tracked_days, 4)
  assert.equal(res.signals['2'], undefined)
})

test("hors ligne, la synchronisation échoue sans vider le cache", async () => {
  const { store, ask } = boot({ offline: true, entries: seed('1', NOW - 40 * HOUR) })
  const res = await ask({ type: 'sync', site: 'lbc', listings: [listing('1')] })
  assert.equal(res.ok, false)
  assert.equal(store.data[key('1')].signals.tracked_days, 4)
})

// Le handler `cached` ne consulte jamais la licence — hors ligne comme en
// mode session, c'est la seule réponse qui vient sans réseau.
test('sans licence, le cache répond quand même', async () => {
  const { ask } = boot({ licenseKey: '', entries: seed('1', NOW) })
  assert.equal((await ask({ type: 'cached', site: 'lbc', ids: ['1'] })).signals['1'].tracked_days, 4)
})

// Fait rougir `ADS.auth.credentials`/`headers` dans src/auth.js : sans clé,
// l'appel doit porter le cookie et le jeton CSRF plutôt que rien.
test('sans licence, la synchronisation part quand même — en cookie de session', async () => {
  const { auths, ask } = boot({ licenseKey: '' })
  const res = await ask({ type: 'sync', site: 'lbc', listings: [listing('9')] })
  assert.equal(res.ok, true)
  assert.equal(auths[0].headers.Authorization, undefined)
  assert.equal(auths[0].headers['X-Adscope'], '1')
  assert.equal(auths[0].credentials, 'include')
})

// Fait rougir la branche `cfg.licenseKey ?` de `ADS.auth.headers`/`credentials` :
// une clé configurée doit continuer à partir en Bearer, sans cookie.
test('avec licence, la synchronisation part en Bearer, sans cookie ni jeton CSRF', async () => {
  const { auths, ask } = boot()
  await ask({ type: 'sync', site: 'lbc', listings: [listing('9')] })
  assert.equal(auths[0].headers.Authorization, `Bearer ${KEY}`)
  assert.equal(auths[0].headers['X-Adscope'], undefined)
  assert.equal(auths[0].credentials, undefined)
})

// Fait rougir `ADS.auth.mark` : un 401 hors mode clé doit poser le badge, et
// un appel réussi qui suit doit l'effacer — jamais silencieux, jamais permanent.
test("un 401 hors mode clé pose le badge « ! » ; un appel réussi l'efface", async () => {
  const { badge, ask, setStatus } = boot({ licenseKey: '', status: 401 })
  const down = await ask({ type: 'sync', site: 'lbc', listings: [listing('1')] })
  assert.equal(down.reason, '401')
  assert.equal(down.authRequired, true)
  assert.deepEqual(badge.at(-1), { text: '!' })

  setStatus(200)
  await ask({ type: 'sync', site: 'lbc', listings: [listing('2')] })
  assert.deepEqual(badge.at(-1), { text: '' })
})

// Fait rougir `if (cfg.licenseKey) return false` dans `ADS.auth.mark` : une
// mauvaise clé de machine est son propre défaut, pas une session à rouvrir.
test('en mode clé, un 401 ne pose aucun badge', async () => {
  const { badge, ask } = boot({ status: 401 })
  const res = await ask({ type: 'sync', site: 'lbc', listings: [listing('1')] })
  assert.equal(res.authRequired, false)
  assert.deepEqual(badge, [])
})

// Fait rougir `if (cfg.licenseKey) return false` dans `ADS.auth.mark` : sorti
// avant toute mise à jour de `down`, le badge posé en mode session restait
// affiché pour toujours une fois une clé configurée, même l'appel réussi.
test("le badge « ! » s'efface en passant en mode clé", async () => {
  const { badge, ask, setStatus, store } = boot({ licenseKey: '', status: 401 })
  await ask({ type: 'sync', site: 'lbc', listings: [listing('1')] })
  assert.deepEqual(badge.at(-1), { text: '!' })

  await store.local.set({ licenseKey: KEY })
  setStatus(200)
  await ask({ type: 'sync', site: 'lbc', listings: [listing('2')] })
  assert.deepEqual(badge.at(-1), { text: '' })
})

test('la purge opportuniste a lieu au chargement, une fois par jour', async () => {
  const old = { ...seed('vieille', NOW - 31 * 24 * HOUR) }
  const { store, ask } = boot({ entries: old })
  await ask({ type: 'sync', site: 'lbc', listings: [listing('1')] })
  assert.equal(key('vieille') in store.data, false)
  assert.equal(store.data._meta.purged, NOW)
})

test('la popup obtient le relevé du cache et peut le vider', async () => {
  const { store, ask } = boot({ entries: seed('1', NOW) })
  assert.equal((await ask({ type: 'cache-stats' })).entries, 1)
  assert.equal((await ask({ type: 'cache-clear' })).cleared, 1)
  assert.equal(key('1') in store.data, false)
})

test("un message qui ne le concerne pas n'est pas capté", () => {
  const { ask } = boot()
  let answered = false
  ask({ type: 'autre-chose' }).then(() => (answered = true))
  assert.equal(answered, false)
})

// Le contrat d'observation porte le vendeur professionnel — c'est ce qui permet
// à l'API d'agréger ses annonces. Un particulier n'a pas d'identifiant à
// transmettre : le champ part vide plutôt qu'absent, l'API tranche de même.
test("le vendeur professionnel voyage avec l'observation", async () => {
  const { calls, ask } = boot()
  await ask({
    type: 'sync', site: 'lbc',
    listings: [
      { ...listing('1'), sellerType: 'pro', sellerId: '76697703', sellerName: 'CVD AUTOMOBILES' },
      { ...listing('2'), sellerType: 'private', sellerId: null, sellerName: null },
    ],
  })
  const [pro, individual] = calls[0].body.items
  assert.equal(pro.seller_id, '76697703')
  assert.equal(pro.seller_name, 'CVD AUTOMOBILES')
  assert.equal(individual.seller_id, null)
  assert.equal(individual.seller_name, null)
})


// Fait rougir `absent` dans `sw.js` : la constatation part sur sa propre route,
// avec la preuve que la page a donnée, et sans rien mettre en cache — un
// verdict n'est pas un signal à afficher.
test("la constatation d'absence part sur sa propre route", async () => {
  const { calls, ask, store } = boot()
  const res = await ask({ type: 'absent', site: 'lbc', siteId: '1', evidence: 'absent' })
  assert.deepEqual(calls, [{
    url: 'http://api/v1/disappearances',
    body: { site: 'lbc', site_id: '1', evidence: 'absent' },
  }])
  assert.equal(res.verdict, 'first')
  assert.deepEqual(Object.keys(store.data).filter((k) => k.startsWith('a:')), [])
})


// Fait rougir `follow` dans `sw.js` : le suivi s'écrit par licence, sur sa
// propre route, et le corps porte l'annonce telle que le contrat la nomme —
// `site_id`, pas le `siteId` du message. Rien n'entre en cache : la liste des
// suivis est au serveur, le cache ne range que des signaux de page.
test("suivre une annonce part sur sa propre route", async () => {
  const { calls, ask, store } = boot()
  const res = await ask({ type: 'follow', site: 'lbc', siteId: '1' })
  assert.deepEqual(calls, [{ url: 'http://api/v1/follows', body: { site: 'lbc', site_id: '1' } }])
  assert.equal(res.ok, true)
  assert.deepEqual(Object.keys(store.data).filter((k) => k.startsWith('a:')), [])
})

test("sans licence, le suivi part quand même — en cookie de session", async () => {
  const { calls, auths, ask } = boot({ licenseKey: '' })
  const res = await ask({ type: 'follow', site: 'lbc', siteId: '1' })
  assert.deepEqual(calls, [{ url: 'http://api/v1/follows', body: { site: 'lbc', site_id: '1' } }])
  assert.equal(auths[0].credentials, 'include')
  assert.equal(res.ok, true)
})


test("sans licence, la constatation d'absence part quand même — en cookie de session", async () => {
  const { calls, auths, ask } = boot({ licenseKey: '' })
  const res = await ask({ type: 'absent', site: 'lbc', siteId: '1', evidence: 'absent' })
  assert.deepEqual(calls, [{
    url: 'http://api/v1/disappearances',
    body: { site: 'lbc', site_id: '1', evidence: 'absent' },
  }])
  assert.equal(auths[0].credentials, 'include')
  assert.equal(res.verdict, 'first')
})

// Fait rougir le handler `me` : la popup lit qui est connecté par cette route,
// jamais en lisant une clé — la licence l'authentifie comme toute autre route.
test('/v1/me part sur sa propre route, en GET, avec la licence', async () => {
  const { calls, auths, ask } = boot()
  const res = await ask({ type: 'me' })
  assert.equal(calls[0].url, 'http://api/v1/me')
  assert.equal(calls[0].body, undefined)
  assert.equal(auths[0].headers.Authorization, `Bearer ${KEY}`)
  assert.equal(res.ok, true)
})
