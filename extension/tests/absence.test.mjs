import { test } from 'node:test'
import assert from 'node:assert/strict'

import { El, stage } from './stage.mjs'

const ID = '3263259495'

// La page telle que le navigateur la rend après une navigation pleine page :
// un bloc `__NEXT_DATA__`, un h1, un titre. `data` est ce que le rendu serveur
// a écrit dans le bloc — c'est tout ce qui sépare une fiche morte d'une vivante.
const page = ({ data, title = '', heading = '', path = `/ad/voitures/${ID}` } = {}) => {
  const body = new El('body')
  const h1 = new El('h1')
  h1.textContent = heading
  const block = new El('script')
  if (data !== undefined) block.textContent = JSON.stringify(data)
  body.append(h1, block)

  const staged = stage(body, {
    origin: 'https://www.leboncoin.fr',
    site: 'sites/leboncoin.js',
    path,
    byId: (id) => (id === '__NEXT_DATA__' && data !== undefined ? block : null),
  })
  staged.doc.title = title
  staged.load('sites/leboncoin-absence.js')
  return staged
}

const shell = (pageProps, { route = '/ad/[cat]/[id]', id = ID } = {}) => ({
  page: route,
  query: { cat: 'voitures', id },
  props: { pageProps },
})

const dead = { data: shell({ ad: null, seoIndexingData: null }), title: 'Annonce introuvable' }
const alive = { data: shell({ ad: { list_id: Number(ID), status: 'active' } }) }

const verdict = (options) => {
  const staged = page(options)
  return ADS.leboncoin.absence(staged.doc, ID)
}

const reported = (options) => {
  const staged = page(options)
  staged.load('absence.js')
  return staged.messages().filter((m) => m.type === 'absent')
}

// Fait rougir la branche `props.ad === null` : c'est la seule qui conclue à
// l'absence, et sans elle rien ne rendrait jamais une disparition constatable.
test('la fiche désactivée est reconnue par la charge vidée et le libellé', () => {
  assert.equal(verdict(dead), 'absent')
  assert.equal(verdict({ ...dead, title: '', heading: 'Cette annonce est désactivée' }), 'absent')
})

// Fait rougir `says(doc)` : deux témoins, pas un. Un `null` transitoire du
// backend rendrait la charge vide sans que la page dise quoi que ce soit.
test('une charge vidée sans le libellé ne conclut rien', () => {
  assert.equal(verdict({ data: shell({ ad: null }) }), 'unreadable')
})

// Fait rougir `!('ad' in props)` — le piège central. Écrit `!props.ad`, ce test
// passerait au vert en marquant disparue toute page d'un gabarit refondu, et
// c'est la base entière en une nuit.
test('un gabarit qui ne porte plus la clé ad ne conclut rien', () => {
  assert.equal(verdict({ ...dead, data: shell({ seoIndexingData: null }) }), 'unreadable')
})

// Fait rougir `if (!json || json.page !== ROUTE)` : le 404 générique du site et
// le mur anti-bot rendent des pages sans la coquille Next de la fiche.
test('une page sans le bloc du rendu serveur ne conclut rien', () => {
  assert.equal(verdict({ title: 'Annonce introuvable' }), 'unreadable')
  assert.equal(verdict({ ...dead, data: shell({ ad: null }, { route: '/' }) }), 'unreadable')
})

// Fait rougir la comparaison de `query.id` : sur une application monopage, le
// bloc reste celui de la page précédente. Lire une charge périmée ferait dire à
// une page morte qu'elle est vivante, et à une vivante qu'elle est morte.
test('une charge qui décrit une autre annonce ne conclut rien', () => {
  assert.equal(verdict({ ...dead, data: shell({ ad: null }, { id: '9999999999' }) }), 'unreadable')
})

test('la fiche vivante est vivante', () => {
  assert.equal(verdict(alive), 'alive')
})

// Fait rougir `TERMINAL.includes(status)` : l'énumération vient du site, mais
// aucune page n'a été vue la portant. Elle se rapporte pour être journalisée —
// l'API ne l'écrit pas.
test("un état terminal est rapporté sous son nom, jamais confondu avec l'absence", () => {
  const sold = { data: shell({ ad: { list_id: Number(ID), status: 'sold' } }) }
  assert.equal(verdict(sold), 'status:sold')
  assert.deepEqual(reported(sold), [
    { type: 'absent', site: 'lbc', siteId: ID, evidence: 'status:sold' },
  ])
})

// Fait rougir `if (verdict !== 'alive')` dans `absence.js` : une fiche vivante
// n'a rien à rapporter, `detail.js` la transmet comme n'importe quelle
// observation.
test('rien ne part depuis une fiche vivante', () => {
  assert.deepEqual(reported(alive), [])
})

test("la constatation part avec le site, l'annonce et la preuve", () => {
  assert.deepEqual(reported(dead), [
    { type: 'absent', site: 'lbc', siteId: ID, evidence: 'absent' },
  ])
})

// Fait rougir `if (!id) return` : hors d'une fiche, aucune annonce n'est
// désignée, et l'illisible d'une page de résultats ne concerne personne.
test('rien ne part depuis une page de résultats', () => {
  assert.deepEqual(reported({ path: '/recherche?category=2' }), [])
})
