// Mes suivis — ce qu'un marchand ouvre le matin. Une carte par annonce qui a
// bougé, ce qui a bougé d'abord ; le reste replié dessous.

import * as api from './api.js'
import { clear, el, outLink } from './dom.js'
import { factsOf, isGone } from './facts.js'
import { DEFAULT_SORT, SORTS, sortFeed } from './follows-sort.js'
import { kilometres, money, spellAge, vehicleShortLabel } from './format.js'

const FENETRES = [[1, '24 heures'], [7, '7 jours']]

function segmentTri(root, state) {
  const actif = state.followSort || DEFAULT_SORT
  return el('div', { class: 'seg tri-suivis', role: 'tablist' },
    SORTS.map(([cle, label]) => el('button', {
      class: `seg-b${actif === cle ? ' on' : ''}`,
      role: 'tab', 'aria-selected': actif === cle, text: label,
      onclick: () => { state.followSort = cle; renderFollows(root, state) },
    })))
}

// « Peugeot 208 · 2020 · 3 574 km » : le nom du véhicule (marque + modèle, ou
// `label` quand l'API le sert) ne se sépare pas par le point médian qui
// sépare les faits.
function ligneVehicule(item) {
  return [vehicleShortLabel(item), item.year,
    item.mileage != null && kilometres(item.mileage)].filter(Boolean).join(' · ')
}

function carteSuivi(item) {
  const [principal, ...secondaires] = factsOf(item)
  return el('article', { class: 'carte carte-suivi' }, [
    el('div', {}, [
      el('h2', { class: 'suivi-h', text: ligneVehicule(item) }),
      el('p', { class: 'suivi-prix', text: money(item.price) }),
    ]),
    el('div', {}, [
      el('p', { class: `fait fait-${principal.kind}`, text: principal.text }),
      secondaires.length && el('p', {
        class: 'fait-2', text: secondaires.map((f) => f.text).join(' · '),
      }),
    ]),
    el('div', { class: 'suivi-pied' }, [
      // Une fiche disparue n'a plus de page à montrer : le lien mènerait à
      // une fiche morte.
      !isGone(item) && outLink(item.url, "Voir l'annonce"),
      item.seller_name && el('span', { class: 'suivi-vendeur', text: item.seller_name }),
    ]),
  ])
}

function ligneCalme(item) {
  return el('div', { class: 'calme' }, [
    el('span', { class: 'calme-h', text: ligneVehicule(item) }),
    el('span', { text: money(item.price) }),
    el('span', { class: 'calme-age', text: `${spellAge(item.age_days)} en ligne` }),
  ])
}

function repli(items) {
  const mot = items.length > 1 ? 'suivis inchangés' : 'suivi inchangé'
  return el('details', { class: 'repli' }, [
    el('summary', { class: 'repli-b' }, [
      el('span', { class: 'chev', text: '›' }),
      el('span', { text: `${items.length} ${mot}` }),
    ]),
    el('div', { class: 'carte repli-corps' }, items.map(ligneCalme)),
  ])
}

const VIDE = 'Aucune annonce suivie — le bouton Suivre est sur chaque fiche, ' +
  "dans l'extension."

function corps(items) {
  if (!items.length) return el('div', { class: 'carte vide', text: VIDE })
  const bouges = items.filter((item) => factsOf(item).length)
  const calmes = items.filter((item) => !factsOf(item).length)
  return el('div', {}, [
    bouges.length
      ? el('div', { class: 'pile' }, bouges.map(carteSuivi))
      : el('div', {
        class: 'carte vide',
        text: 'Rien n’a bougé sur cette fenêtre.',
      }),
    calmes.length && repli(calmes),
  ])
}

export async function renderFollows(root, state) {
  const zone = el('div')
  const bascule = el('div', { class: 'seg bascule', role: 'tablist' },
    FENETRES.map(([jours, label]) => el('button', {
      class: `seg-b${state.sinceDays === jours ? ' on' : ''}`,
      role: 'tab', 'aria-selected': state.sinceDays === jours,
      text: label,
      onclick: () => { state.sinceDays = jours; renderFollows(root, state) },
    })))

  clear(root).append(
    el('h1', { class: 'vue-t', text: 'Mes suivis' }),
    el('div', { class: 'suivis-entete' }, [bascule, segmentTri(root, state)]),
    zone,
  )
  zone.append(el('p', { class: 'vue-s', text: 'Chargement…' }))
  try {
    const { items } = await api.feed(state.sinceDays)
    clear(zone).append(corps(sortFeed(items, state.followSort)))
  } catch (err) {
    // Une licence refusée ramène à l'écran de connexion ; le reste des pannes
    // reste dans la page.
    if (err instanceof api.AuthError) { state.onAuthError(); return }
    clear(zone).append(el('div', {
      class: 'carte vide', text: "L'API n'a pas répondu. Réessayez dans un instant.",
    }))
  }
}
