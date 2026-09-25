import test from 'node:test'
import assert from 'node:assert/strict'

// Même piège de rechargement de module que `api.test.mjs` : `js/api.js` (dont
// `js/api-auth.js` importe `buildRequest`/`isDemo`) lit `location`/
// `localStorage` à l'import, donc on les pose avant, et chaque import se fait
// avec une requête différente pour forcer une ré-exécution.
let compteur = 0

function storage() {
  const map = new Map()
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) }
}

async function loadApiAuth({ search = '' } = {}) {
  globalThis.location = { search, origin: 'http://localhost:8000', href: `http://localhost:8000/app/${search}` }
  Object.defineProperty(globalThis, 'localStorage', { value: storage(), configurable: true })
  compteur += 1
  return import(`../js/api-auth.js?t=${compteur}`)
}

function fakeFetch(calls, { status = 204, body } = {}) {
  return async (url, init) => {
    calls.push({ url, init })
    return { status, ok: status >= 200 && status < 300, json: async () => body }
  }
}

// Rouge sur `buildRequest(path, { method: 'POST', body })` dans `call` de
// js/api-auth.js : sans lui, une route d'auth ne poserait pas `X-Adscope`, ou
// enverrait le mot de passe ailleurs que dans le corps.
test('chaque appel poste sur le bon chemin, avec X-Adscope, jamais de mot de passe en query', async () => {
  const { signup, verify, resend, login, forgot, resetPassword, changePassword } = await loadApiAuth()
  const calls = []
  globalThis.fetch = fakeFetch(calls)
  await signup('karim@garage.fr', 'un-mot-de-passe')
  await verify('tok1')
  await resend('karim@garage.fr')
  await login('karim@garage.fr', 'un-mot-de-passe')
  await forgot('karim@garage.fr')
  await resetPassword('tok2', 'un-mot-de-passe')
  await changePassword('ancien', 'nouveau')
  const chemins = ['/v1/auth/signup', '/v1/auth/verify', '/v1/auth/resend', '/v1/auth/login',
    '/v1/auth/forgot', '/v1/auth/password/reset', '/v1/auth/password']
  calls.forEach((c, i) => {
    assert.equal(c.url, chemins[i])
    assert.equal(c.init.method, 'POST')
    assert.equal(c.init.headers['X-Adscope'], '1')
    assert.ok(!/un-mot-de-passe|ancien|nouveau/.test(c.url), `mot de passe dans l'URL de ${c.url}`)
  })
  assert.equal(JSON.parse(calls[0].init.body).password, 'un-mot-de-passe')
})

// Rouge sur le `try { detail = (await res.json()).detail || detail }` de
// `call` : sans lui, une erreur de l'API perdrait son message exact et
// afficherait un texte générique à Karim au lieu de « Email ou mot de passe
// incorrect. ».
test('une erreur porte le message exact rendu par l’API', async () => {
  const { login, ApiError } = await loadApiAuth()
  globalThis.fetch = fakeFetch([], { status: 401, body: { detail: 'Email ou mot de passe incorrect.' } })
  await assert.rejects(
    () => login('karim@garage.fr', 'faux'),
    (err) => err instanceof ApiError && err.status === 401 && err.message === 'Email ou mot de passe incorrect.',
  )
})

// Rouge sur `if (typeof body === 'string') detail = body` de `call` : sans
// lui, une 422 de validation Pydantic native (detail en liste d'objets, pas en
// chaîne) stringifierait en « [object Object] » au lieu du repli générique.
test('un detail non textuel (422 de validation) retombe sur le message générique', async () => {
  const { signup, ApiError } = await loadApiAuth()
  globalThis.fetch = fakeFetch([], {
    status: 422,
    body: { detail: [{ loc: ['body', 'email'], msg: 'value is not a valid email address', type: 'value_error' }] },
  })
  await assert.rejects(
    () => signup('pas-un-email', 'un-mot-de-passe'),
    (err) => err instanceof ApiError && err.status === 422 && err.message === '/v1/auth/signup a répondu 422',
  )
})

// Rouge sur `isDemo() ? demo() : call(...)` de chaque export : sans lui, une
// capture d'écran en `?demo=1` appellerait `fetch`, qui n'existe pas à ce
// moment-là (la vraie API sert d'autres routes en parallèle).
test('le mode démo ne fait aucun appel réseau', async () => {
  const { signup, login, forgot } = await loadApiAuth({ search: '?demo=1' })
  const appelé = () => { throw new Error('fetch ne devrait jamais être appelé en mode démo') }
  globalThis.fetch = appelé
  await signup('karim@garage.fr', 'un-mot-de-passe')
  await login('karim@garage.fr', 'un-mot-de-passe')
  await forgot('karim@garage.fr')
})
