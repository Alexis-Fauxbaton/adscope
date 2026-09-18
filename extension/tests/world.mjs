import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { El, stage } from './stage.mjs'

const here = dirname(fileURLToPath(import.meta.url))

export const FIXTURE = JSON.parse(readFileSync(join(here, 'fixtures/leboncoin-ads.json'), 'utf8'))
export const ad = (id) => FIXTURE.find((a) => String(a.list_id) === id)
export const block = (...ads) => JSON.stringify({ ads: ads.length ? ads : FIXTURE })

// `link` ne porte l'adresse que de la carte demandée, comme le ferait la page.
// `path` et `data` décrivent la page ouverte : quelle fiche l'URL désigne, et
// quelles annonces le bloc `__NEXT_DATA__` porte. `receive` joue ce que le
// script de monde MAIN publie quand le navigateur reçoit une nouvelle page.
export const world = (targetId, { path = '/ad/voitures/3254194817', data = block(), cache = {}, also = [] } = {}) => {
  const body = new El('body')
  const date = new El('p')
  date.textContent = 'il y a 3 jours à 15:36'
  // Le conteneur des résultats : sur ce site, le registre le déduit des cartes —
  // le parent commun des `article`. Les cartes y sont toutes, la première étant
  // celle que le test désigne.
  const list = new El('div')
  const named = new Map()
  const add = (id) => {
    const a = new El('a')
    a.setAttribute('href', `/ad/voitures/${id}`)
    const node = new El('article')
    node.append(a)
    list.append(node)
    named.set(node, id)
    return { node, link: a }
  }
  const { node: card, link } = add(targetId)
  for (const id of also) add(id)
  const nextData = new El('script')
  nextData.textContent = data
  // Le bloc est dans la page, comme sur le site : c'est lui que la signature des
  // scripts lit pour savoir si la charge a changé.
  body.append(new El('h1'), date, list, nextData)

  const staged = stage(body, {
    origin: 'https://www.leboncoin.fr',
    site: 'sites/leboncoin.js',
    path,
    cache,
    byId: (id) => (id === '__NEXT_DATA__' ? nextData : null),
  })

  return {
    ...staged,
    body,
    card,
    // Ce que le conteneur montre, de haut en bas : un identifiant par carte.
    order: () => list.children.map((n) => named.get(n)),
    badgeOf: (id) => [...named].find(([, v]) => v === id)[0].querySelector('[data-adscope]'),
    // Une navigation monopage : l'URL et la charge JSON changent, le DOM survit.
    visit: (a) => {
      staged.goto(`/ad/voitures/${a.list_id}`)
      nextData.textContent = JSON.stringify({ props: { ad: a } })
    },
    // Le nœud de carte qu'une application monopage réattribue à une autre
    // annonce — pagination, filtre, liste virtualisée : même élément du DOM,
    // lien changé. C'est ainsi que la carte retrouvée est la bonne alors
    // qu'elle porte encore la pastille de l'annonce précédente.
    recycle: (id) => link.setAttribute('href', `/ad/voitures/${id}`),
    // Une navigation monopage telle qu'elle se produit : l'URL change, le
    // navigateur reçoit la fiche suivante, et `__NEXT_DATA__` n'est pas réécrit.
    goto: (id) => staged.goto(`/ad/voitures/${id}`),
    status: staged.status,
    panel: () => body.querySelector('[data-adscope-detail]'),
    badge: () => card.querySelector('[data-adscope]'),
  }
}
