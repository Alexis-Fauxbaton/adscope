import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { El, stage } from './stage.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const read = (f) => JSON.parse(readFileSync(join(here, 'fixtures', f), 'utf8'))

export const FICHES = read('lacentrale-fiches.json')
export const CARDS = read('lacentrale-resultats.json')
export const ORIGIN = 'https://www.lacentrale.fr'
export const href = (ref) => `${ORIGIN}/auto-occasion-annonce-${ref.charCodeAt(0)}${ref.slice(1)}.html`

// Les squelettes reproduisent les deux pages sauvegardées le 2026-09-06 : La
// Centrale pose ses charges dans des scripts en ligne — `var
// CLASSIFIED_MORE_INFOS` sur une fiche, `window.__PRELOADED_STATE_LISTING__`
// sur des résultats — et le JSON-LD `Car` dans un script à part.
export const fiche = (f, { sellerName = null, lastname = null } = {}) => [
  `var CLASSIFIED_MORE_INFOS=  ${JSON.stringify({
    config: { source: 'LC', vertical: 'auto' },
    data: {
      classified: { year: String(new Date(f.firstCirculationDate).getUTCFullYear()) },
      vehicle: { make: f.brand.toUpperCase(), model: f.model, label: '1.2 VTI 82 ACTIVE 5P' },
      financing: {
        combined: {
          price: f.price,
          mileage: f.mileage,
          classifiedReference: f.reference,
          customerType: f.customerType,
          firstCirculationDate: f.firstCirculationDate,
          customerReference: 'C045122',
          creationDate: f.creationDate,
          energy: 'ESSENCE',
        },
      },
    },
  })}`,
  `var SellerInformationData= ${JSON.stringify({
    customerType: f.customerType,
    refrence: f.reference,
    classified: { contacts: lastname ? { lastname } : { phone1: { note: 'SERVICE COMMERCIAL' } } },
    ...(sellerName ? { account: { publishedName: sellerName, address: { zipCode: '92120' } } } : {}),
  })}`,
  JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Car',
    name: f.name,
    brand: f.brand,
    model: f.model,
    dateVehicleFirstRegistered: String(new Date(f.firstCirculationDate).getUTCFullYear()),
    mileageFromOdometer: { '@type': 'QuantitativeValue', value: String(f.mileage), unitText: 'km' },
    offers: { '@type': 'Offer', price: String(f.price), priceCurrency: 'EUR' },
  }),
]

const item = (c) => ({
  reference: c.reference,
  customerType: c.customerType,
  price: c.price,
  lastUpdate: c.lastUpdate,
  firstOnlineDate: c.firstOnlineDate,
  customerReference: 'C000077',
  contacts: { ville: 'PARIS', nomPublie: c.sellerName, siret: '34051417300012' },
  vehicle: { make: 'PEUGEOT', model: '208', version: '1.2 PURETECH 110 5P', year: 2018, mileage: 52626 },
})

// La réserve que la page précharge sans la rendre : relevé le 2026-09-06, six
// annonces sous `boostVo.similarHits` là où l'écran en montre vingt-trois. Elles
// portent une référence, un prix et une mise en ligne — ni `vehicle`, ni
// `contacts`, ni `lastUpdate` — et aucun lien de la page ne les nomme.
const reserve = (ref) => ({
  reference: ref,
  customerType: 'PRO',
  price: 9900,
  firstOnlineDate: '2026-06-01T09:00:00.000Z',
})

export const results = (cards, similar = []) => [
  `window.__PRELOADED_STATE_LISTING__ = ${JSON.stringify({
    boostVo: { similarHits: similar.map(reserve) },
    search: { hits: cards.map((c) => ({ item: item(c) })) },
  })};if( window.tc_vars ) {window.tc_vars['listing_nb_resultat'] = 9541;}`,
]

// La page telle que le navigateur la montre : le libellé plafonné sous le prix,
// les cartes de résultats dans le bloc qui porte leurs métadonnées de suivi, et
// les charges dans des scripts en ligne.
export const page = ({ path, scripts, label = null, cards = [], cache = {} }) => {
  const body = new El('body')
  body.append(new El('h1'))
  if (label) {
    const p = new El('p')
    p.textContent = label
    body.append(p)
  }
  const holders = new Map()
  for (const ref of cards) {
    const holder = new El('div')
    holder.setAttribute('data-tracking-meta', `{"classified_ref":"${ref}"}`)
    const link = new El('a')
    link.setAttribute('href', href(ref))
    holder.append(link)
    body.append(holder)
    holders.set(ref, holder)
  }
  // Retenus : c'est en réécrivant l'un d'eux qu'un test fait changer la page de
  // charge, comme le ferait le site.
  const inline = scripts.map((text) => {
    const s = new El('script')
    s.textContent = text
    body.append(s)
    return s
  })
  const staged = stage(body, { origin: ORIGIN, path, cache, site: 'sites/lacentrale.js' })
  return {
    ...staged,
    body,
    scripts: inline,
    badge: (ref) => holders.get(ref).querySelector('[data-adscope]'),
    panel: () => body.querySelector('[data-adscope-detail]'),
  }
}
