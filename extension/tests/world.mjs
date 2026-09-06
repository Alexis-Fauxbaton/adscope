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
export const world = (targetId, { path = '/ad/voitures/3254194817', data = block(), cache = {} } = {}) => {
  const body = new El('body')
  const date = new El('p')
  date.textContent = 'il y a 3 jours à 15:36'
  const link = new El('a')
  link.setAttribute('href', `/ad/voitures/${targetId}`)
  const card = new El('article')
  card.append(link)
  const nextData = new El('script')
  nextData.textContent = data
  body.append(new El('h1'), date, card)

  const staged = stage(body, {
    origin: 'https://www.leboncoin.fr',
    site: 'sites/leboncoin.js',
    path,
    cache,
    byId: (id) => (id === '__NEXT_DATA__' ? nextData : null),
  })

  return {
    ...staged,
    card,
    // Une navigation monopage : l'URL et la charge JSON changent, le DOM survit.
    visit: (a) => {
      staged.goto(`/ad/voitures/${a.list_id}`)
      nextData.textContent = JSON.stringify({ props: { ad: a } })
    },
    // Une navigation monopage telle qu'elle se produit : l'URL change, le
    // navigateur reçoit la fiche suivante, et `__NEXT_DATA__` n'est pas réécrit.
    goto: (id) => staged.goto(`/ad/voitures/${id}`),
    status: staged.status,
    panel: () => body.querySelector('[data-adscope-detail]'),
    badge: () => card.querySelector('[data-adscope]'),
  }
}
