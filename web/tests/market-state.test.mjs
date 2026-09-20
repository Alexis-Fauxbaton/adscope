import test from 'node:test'
import assert from 'node:assert/strict'
import { EMPTY_FILTERS } from '../js/query.js'
import { applyPatch, createFacetRefresher, toggleInList } from '../js/market-state.js'

// Rouge sur le `if ('brand' in patch && patch.brand !== filters.brand)` de
// `applyPatch` dans js/market-state.js : « Peugeot 208 » puis marque
// « Renault » donnerait « Renault 208 » — zéro annonce, et le marchand
// chercherait longtemps pourquoi.
test('changer de marque vide le modèle', () => {
  const posé = { ...EMPTY_FILTERS, brand: 'peugeot', model: '208' }
  assert.equal(applyPatch(posé, { brand: 'renault' }).model, '')
  assert.equal(applyPatch(posé, { brand: '' }).model, '')
  // Reposer la même marque ne touche pas au modèle : c'est un non-changement.
  assert.equal(applyPatch(posé, { brand: 'peugeot' }).model, '208')
  // Et choisir un modèle sous la marque en place le garde.
  assert.equal(applyPatch(posé, { model: '2008' }).model, '2008')
})

// Rouge sur le `&& !('model' in patch)` d'`applyPatch` : un raccourci de
// famille pose marque *et* modèle d'un seul correctif. Sans l'exception, la
// cascade reprendrait aussitôt le modèle qu'il vient de poser, et cliquer
// « Renault Clio » ne donnerait que « Renault ».
test('un raccourci qui pose marque et modèle garde les deux', () => {
  const posé = { ...EMPTY_FILTERS, brand: 'peugeot', model: '208' }
  const après = applyPatch(posé, { brand: 'Renault', model: 'Clio' })
  assert.equal(après.brand, 'Renault')
  assert.equal(après.model, 'Clio')
})

// Rouge sur le `next[key] = integer(patch[key])` d'`applyPatch` : un champ
// nombre rend une chaîne. Sans conversion, l'état porterait « 5000 » et la
// comparaison de fourchette (`min > max`) se ferait sur du texte.
test('une borne saisie arrive dans l’état en entier, ou pas du tout', () => {
  assert.equal(applyPatch(EMPTY_FILTERS, { priceMin: '5000' }).priceMin, 5000)
  assert.equal(applyPatch(EMPTY_FILTERS, { priceMin: '' }).priceMin, null)
  assert.equal(applyPatch(EMPTY_FILTERS, { priceMin: 'douze' }).priceMin, null)
})

// Rouge sur le `new Set(…)` d'`applyPatch` : « essence » posé deux fois ferait
// deux pastilles identiques et deux fois le paramètre dans l'URL.
test('une liste ne porte jamais deux fois la même valeur', () => {
  assert.deepEqual(
    applyPatch(EMPTY_FILTERS, { fuel: ['essence', 'essence', '', 'diesel'] }).fuel,
    ['essence', 'diesel'],
  )
})

// Rouge sur le `current.includes(value) ? … : …` de `toggleInList` : sans le
// test d'appartenance, recliquer sur « diesel » l'ajouterait au lieu de
// l'enlever.
test('recliquer une valeur cochée la décoche', () => {
  const posé = { ...EMPTY_FILTERS, fuel: ['essence', 'diesel'] }
  assert.deepEqual(toggleInList(posé, 'fuel', 'diesel'), { fuel: ['essence'] })
  assert.deepEqual(toggleInList(posé, 'fuel', 'gpl'), { fuel: ['essence', 'diesel', 'gpl'] })
  assert.deepEqual(toggleInList(EMPTY_FILTERS, 'gearbox', 'automatique'), { gearbox: ['automatique'] })
})

// Une minuterie posée à la main : ce test ne connaît aucun vrai délai, et ne
// lit jamais l'horloge.
function minuterie() {
  const prévus = new Map()
  let dernier = 0
  return {
    timers: {
      setTimeout: (fn) => { dernier += 1; prévus.set(dernier, fn); return dernier },
      clearTimeout: (handle) => { prévus.delete(handle) },
    },
    écouler: () => { const fns = [...prévus.values()]; prévus.clear(); for (const fn of fns) fn() },
    nombre: () => prévus.size,
  }
}

// Rouge sur le `debounce(demander, wait, timers)` de `createFacetRefresher` :
// sans temporisation, chaque frappe demanderait les compteurs de toute la
// base — plus lourds que la page de résultats elle-même.
test('les compteurs se redemandent après la pause, une seule fois', async () => {
  const m = minuterie()
  const demandes = []
  const refresh = createFacetRefresher({
    fetchFacets: async (params) => { demandes.push(String(params)); return { total: 1 } },
    onFacets: () => {}, wait: 300, timers: m.timers,
  })
  refresh({ ...EMPTY_FILTERS, q: 'c' })
  refresh({ ...EMPTY_FILTERS, q: 'cl' })
  refresh({ ...EMPTY_FILTERS, q: 'clio' })
  assert.deepEqual(demandes, [])
  m.écouler()
  await Promise.resolve()
  assert.deepEqual(demandes, ['q=clio'])
})

// Rouge sur le `now = false` / `now ? demander(…)` : le premier affichage et
// « Tout effacer » ne sont pas des frappes — faire attendre 300 ms des
// compteurs déjà décidés ne sert personne.
test('un changement franc ne passe pas par la pause', async () => {
  const m = minuterie()
  let appels = 0
  const refresh = createFacetRefresher({
    fetchFacets: async () => { appels += 1; return { total: 1 } },
    onFacets: () => {}, timers: m.timers,
  })
  await refresh(EMPTY_FILTERS, { now: true })
  assert.equal(appels, 1)
  assert.equal(m.nombre(), 0)
})

// Rouge sur le `if (mien === jeton)` de `createFacetRefresher` : deux
// requêtes en vol, la première qui rentre en dernier — les compteurs de
// « Peu » écraseraient ceux de « Peugeot » déjà affichés.
test('une réponse en retard ne remplace jamais une plus récente', async () => {
  const résolveurs = []
  let reçues = null
  const refresh = createFacetRefresher({
    fetchFacets: () => new Promise((resolve) => résolveurs.push(resolve)),
    onFacets: (f) => { reçues = f },
  })
  refresh({ ...EMPTY_FILTERS, q: 'Peu' }, { now: true })
  refresh({ ...EMPTY_FILTERS, q: 'Peugeot' }, { now: true })
  résolveurs[1]({ total: 2 })
  await Promise.resolve()
  résolveurs[0]({ total: 999 })
  await Promise.resolve()
  assert.deepEqual(reçues, { total: 2 })
})

// Rouge sur le `catch` de `createFacetRefresher` : une panne de facettes ne
// doit pas vider les listes. Les anciens compteurs restent, rien ne saute.
test('une panne de compteurs ne touche pas aux compteurs affichés', async () => {
  let reçues = 'intactes'
  let vue = null
  const refresh = createFacetRefresher({
    fetchFacets: async () => { throw new Error('API muette') },
    onFacets: (f) => { reçues = f },
    onError: (err) => { vue = err.message },
  })
  await refresh(EMPTY_FILTERS, { now: true })
  assert.equal(reçues, 'intactes')
  assert.equal(vue, 'API muette')
})
