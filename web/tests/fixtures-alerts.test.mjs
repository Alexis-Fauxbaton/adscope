import test from 'node:test'
import assert from 'node:assert/strict'
import * as fixtures from '../js/fixtures-alerts.js'

// `videDemande()` lit `location.search` : sans cette pose, l'import seul
// (avant toute capture d'écran réelle) ferait planter le fichier en Node.
globalThis.location = { search: '', href: 'http://localhost:8000/app/', origin: 'http://localhost:8000' }

const SEARCH_FIELDS = [
  'id', 'name', 'query', 'notify_drops', 'notify_new', 'min_age_days', 'min_drop_pct', 'paused', 'created_at',
]

// Rouge sur les champs listés dans chaque objet de `searchesStore` : une
// recherche démo qui en oublierait un romprait le contrat de `SearchOut`
// (`api/adscope_api/saved_searches.py`) sans qu'aucune route ne le signale.
test('une recherche démo porte tous les champs du contrat', () => {
  for (const s of fixtures.searches()) {
    for (const field of SEARCH_FIELDS) assert.ok(field in s, `champ manquant : ${field}`)
  }
})

// Rouge sur `searchesStore = [...searchesStore, row]` de `createSearch` :
// sans lui, la recherche créée n'apparaîtrait jamais dans la liste suivante.
test('une recherche créée en démo se retrouve dans la liste', () => {
  const avant = fixtures.searches().length
  const créée = fixtures.createSearch({ name: 'Test', query: 'brand=Peugeot', notify_drops: true, notify_new: false, min_age_days: 30, min_drop_pct: 3, paused: false })
  assert.equal(fixtures.searches().length, avant + 1)
  assert.ok(fixtures.searches().some((s) => s.id === créée.id && s.name === 'Test'))
})

// Rouge sur `searchesStore = searchesStore.filter((s) => s.id !== id)` de
// `deleteSearch` : sans lui, une recherche supprimée resterait affichée.
test('une recherche supprimée disparaît de la liste', () => {
  const [{ id }] = fixtures.searches()
  fixtures.deleteSearch(id)
  assert.ok(!fixtures.searches().some((s) => s.id === id))
})

// Rouge sur `DIGESTS.map(({ text, html, ...rest }) => rest)` de `digests` :
// c'est la même règle que la route réelle (`GET /v1/digests` ne porte pas
// les corps) — vingt emails HTML en démo alourdiraient la page pour rien.
test('la liste des envois démo ne porte pas les corps', () => {
  for (const d of fixtures.digests()) {
    assert.equal('text' in d, false)
    assert.equal('html' in d, false)
  }
})

// Rouge sur `DIGESTS.find((d) => d.id === id)` de `digest` : sans lui, ouvrir
// un envoi précis ne rendrait jamais son HTML dans l'iframe.
test('lire un envoi démo par identifiant rend le HTML', () => {
  const d = fixtures.digest(1)
  assert.ok(d.html.includes('<html>'))
  assert.ok(typeof d.text === 'string' && d.text.length > 0)
})

// Rouge sur `settingsStore = { ...settingsStore, ...payload }` de
// `putAlertSettings` : sans le repli sur le précédent, écrire un seul champ
// effacerait l'autre.
test('écrire un seul réglage ne touche pas l’autre', () => {
  fixtures.putAlertSettings({ digest_enabled: false, include_follows: true })
  fixtures.putAlertSettings({ include_follows: false, digest_enabled: false })
  assert.deepEqual(fixtures.alertSettings(), { digest_enabled: false, include_follows: false })
})

// Rouge sur `videDemande()` : `?demo=1&vide=1` sert le compte du premier
// jour pour la capture de l'état vide — sans lui, cette page ne se
// distinguerait jamais de la démo par défaut.
test('« vide=1 » rend des recherches et des envois vides', () => {
  globalThis.location.search = '?demo=1&vide=1'
  try {
    assert.deepEqual(fixtures.searches(), [])
    assert.deepEqual(fixtures.digests(), [])
  } finally {
    globalThis.location.search = ''
  }
})
