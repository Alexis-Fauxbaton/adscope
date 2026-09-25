// /app/ecarts.html — pilotée par le compte opérateur d'Alexis (`require_operator`
// côté API). Il vient une fois par semaine ou après une alerte étrange, et
// veut répondre en trente secondes à « quelqu'un pourrit-il la base ? » —
// d'où la phrase du haut, puis une carte par clé, la plus fautive en premier
// (docs/roadmap.md § Lot Corpus, point 4). Même mécanique que revisites.html
// et balayage.html : la session vit dans le cookie, cette page ne fait que
// la demander.

import * as ecartsApi from './api-ecarts.js'
import * as api from './api.js'
import { clear, el, outLink } from './dom.js'
import {
  deltaLabel, delayLabel, fieldLabel, parseDays, sortLicenses, summarize, valueLabel,
} from './ecarts.js'
import { shortDate } from './format.js'
import { renderSuspendControl } from './suspension.js'

const racine = document.getElementById('racine')
const days = parseDays(location.search)
let lastPayload = null

// Le clic d'un bouton de suspension repeint la page depuis `lastPayload` : la
// clé a déjà été basculée en place (`suspension.js`), pas besoin de relire
// l'API.
function repeindre() {
  peindre('data', lastPayload)
}

function ligneEcart(item) {
  const pct = deltaLabel(item.delta_pct)
  return el('li', { class: 'ecart-ligne' }, [
    el('div', { class: 'ecart-l1' }, [
      el('span', { class: 'ecart-champ', text: fieldLabel(item.field) }),
      el('span', {
        class: 'ecart-valeurs',
        text: `${valueLabel(item.field, item.merchant_value)} → ${valueLabel(item.field, item.robot_value)}`,
      }),
      pct ? el('span', { class: 'ecart-pct', text: pct }) : null,
    ]),
    el('div', { class: 'ecart-l2' }, [
      outLink(item.source_url, item.label),
      outLink(item.adscope_url, 'Historique adscope'),
      el('span', { class: 'ecart-delai', text: delayLabel(item.delay_seconds) }),
      el('span', { text: shortDate(item.verified_at) }),
    ]),
  ])
}

function carteCle(lic) {
  return el('div', { class: 'carte' }, [
    el('div', { class: 'ecart-tete' }, [
      el('div', {}, [
        el('div', { class: 'suivi-h', text: lic.label }),
        el('div', { class: 'fait-2', text: lic.email || 'clé sans compte' }),
      ]),
      lic.active ? null : el('span', { class: 'pastille-suspendue', text: 'clé suspendue' }),
      el('div', { class: 'ecart-compte' }, [
        el('div', { class: 'fait', text: `${lic.count} écart${lic.count > 1 ? 's' : ''}` }),
        el('div', { class: 'fait-2', text: `le plus rapide : ${delayLabel(lic.min_delay_seconds)}` }),
      ]),
    ]),
    renderSuspendControl(lic, repeindre),
    el('ol', { class: 'ecart-liste' }, lic.items.map(ligneEcart)),
  ])
}

function vueVide(pending) {
  return el('div', { class: 'carte vide' }, [
    el('p', { class: 'ecart-resume', text: `Aucun écart sur ${days} jour${days > 1 ? 's' : ''}.` }),
    el('p', {
      class: 'fait-2',
      text: pending > 0
        ? `${pending} annonce${pending > 1 ? 's' : ''} attend${pending > 1 ? 'ent' : ''} le passage du robot.`
        : 'Aucune annonce en attente du robot.',
    }),
  ])
}

function peindre(state, payload = null) {
  if (payload) lastPayload = payload
  clear(racine)
  if (state === 'no-license') {
    racine.append(el('p', { class: 'vue-s', text: 'Connectez-vous d’abord sur /app.' }))
    return
  }
  racine.append(el('h1', { class: 'vue-t', text: 'Écarts marchand ↔ robot' }))
  if (state === 'loading') {
    racine.append(el('p', { class: 'vue-s', text: 'Chargement…' }))
    return
  }
  if (state === 'error') {
    racine.append(el('div', {
      class: 'carte vide', text: "L'API n'a pas répondu. Réessayez dans un instant.",
    }))
    return
  }
  const licenses = sortLicenses(payload.licenses)
  racine.append(el('p', { class: 'ecart-resume', text: summarize(payload, days) }))
  racine.append(licenses.length
    ? el('div', { class: 'pile' }, licenses.map(carteCle))
    : vueVide(payload.pending))
}

function demarrer() {
  // `?demo=1` ne consomme rien de réel : le journal factice se rend tout de
  // suite, c'est ce qui permet la capture d'écran sans session.
  if (api.isDemo()) {
    ecartsApi.divergences(days).then((payload) => peindre('data', payload))
    return
  }
  peindre('loading')
  api.me()
    .then(() => ecartsApi.divergences(days))
    .then((payload) => peindre('data', payload))
    .catch((err) => peindre(err instanceof api.AuthError ? 'no-license' : 'error'))
}

demarrer()
