import { ad, block, world } from './world.mjs'
import { at } from './stage.mjs'

const DAY = 86400000

// Le jour du relevé, tenu fixe : les comptes de jours sont calculés à la main
// dessus, et une horloge qui avance les ferait dériver d'un cran par jour.
export const RELEVE = '2026-09-06T12:00:00Z'
export const ID = '4000000001'
export const back = (days) => new Date(Date.parse(RELEVE) - days * DAY)

// Un horodatage de leboncoin, écrit en heure locale comme ceux de sa charge.
export const stamp = (days) => {
  const t = back(days)
  const p = (n) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`
}

export const PRO = { type: 'pro', store_id: 5551, name: 'Borgese Auto' }
export const SELF = { type: 'private' }

// L'annonce de la maquette : en ligne depuis 1 810 jours, remontée il y a 60 —
// c'est cette remontée que la page affiche à la place de la mise en ligne.
export const listing = ({ owner = PRO, ...over } = {}) => ({
  ...ad('3254194817'),
  list_id: Number(ID),
  owner,
  price: [22700],
  first_publication_date: stamp(1810),
  index_date: stamp(60),
  ...over,
})

export const point = (days, price, confirmation = false) =>
  ({ at: back(days).toISOString(), price, confirmation })

// Trois prix sur 118 jours de relevé, deux baisses : la première tombe avant la
// fenêtre des 60 jours que le site montre, la seconde dedans.
export const SIGNALS = {
  first_seen: back(118).toISOString(),
  tracked_days: 118,
  observations: 16,
  price: 22700,
  stable_days: 48,
  price_history: [point(118, 24900), point(90, 24900, true), point(84, 23900), point(48, 22700)],
}

// L'annonce que le pool découvre à l'instant : un seul relevé, du jour même.
// C'est l'état « pas encore suivie » du contrat, et rien d'autre ne le produit.
export const FIRST = {
  first_seen: back(0).toISOString(),
  tracked_days: 0,
  observations: 1,
  price: 22700,
  price_history: [point(0, 22700)],
  followed: false,
}

export const SELLER = {
  site: 'lbc', seller_id: '5551', seller_name: 'Borgese Auto', listings: 29, window_days: 30,
  aged: 29, over_a_month: 18, over_a_month_share: 0.62, median_age_days: 47,
  price_changed_listings: 12, price_drop_listings: 9, price_drop_rate: -0.032, price_drop_after_days: 42,
}

// La fiche telle que le navigateur la montre, horloge arrêtée au jour du relevé.
export const fiche = (fn, over) =>
  at(RELEVE, () => {
    const w = world('0', { path: `/ad/voitures/${ID}`, data: block(listing(over)) })
    w.load('detail.js')
    return fn(w)
  })

export const text = (w) => w.panel().textContent
export const tiles = (w) => w.panel().querySelectorAll('.adscope-tile')
export const openTile = (w, name) => tiles(w).find((t) => t.textContent.includes(name)).click()
export const buttons = (w) => w.panel().querySelectorAll('.adscope-follow')
