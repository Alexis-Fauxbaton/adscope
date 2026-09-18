// Une annonce du marché : le véhicule, le prix, l'âge en grand — c'est la
// mesure qu'adscope apporte et que le site ne donne pas.

import { el, outLink } from './dom.js'
import { longDate, money, signedMoney, spellAge, vehicleLine, vehicleTitle } from './format.js'

function prix(item) {
  const baisse = item.price_delta_since_first < 0 && el('span', {
    class: 'baisse', text: signedMoney(item.price_delta_since_first),
  })
  return el('p', { class: 'annonce-p' }, [
    document.createTextNode(money(item.price)),
    baisse,
  ])
}

export function carteAnnonce(item) {
  return el('article', { class: 'carte' }, el('div', { class: 'annonce' }, [
    el('div', {}, [
      el('h2', { class: 'annonce-h', text: vehicleTitle(item) }),
      el('p', { class: 'annonce-s', text: vehicleLine(item) }),
      prix(item),
      // L'identité d'un vendeur n'est servie que s'il est professionnel.
      item.seller_name && el('p', { class: 'annonce-v', text: item.seller_name }),
    ]),
    el('div', { class: 'annonce-age' }, [
      el('div', {}, [
        el('p', { class: 'age-hero', text: spellAge(item.age_days) }),
        el('p', {
          class: 'age-s',
          text: item.published_at
            ? `en ligne depuis le ${longDate(item.published_at)}`
            : 'en ligne',
        }),
      ]),
      outLink(item.url, "Voir l'annonce"),
    ]),
  ]))
}
