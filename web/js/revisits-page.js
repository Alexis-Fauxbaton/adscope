// /app/revisites.html — pilotée par un marchand ou par la session cowork qui
// suit `crawler/RUNBOOK-revisites.md`. Le navigateur détient la licence,
// cette page ne fait que la porter jusqu'à l'API ; elle ne l'affiche jamais.

import * as api from './api.js'
import { clear, el } from './dom.js'
import {
  DEFAULT_LIMIT, SITE, forgetQueue, initialView, parseLimit, readQueue, writeQueue,
} from './revisits.js'

const racine = document.getElementById('racine')
const limit = parseLimit(location.search)

function ligneFiche(item) {
  return el('li', {}, el('a', { href: item.url, 'data-site-id': item.site_id, text: item.url }))
}

function vueFile(items) {
  return el('div', {}, [
    el('p', {}, el('output', { id: 'count', text: String(items.length) })),
    items.length
      ? el('ol', { id: 'queue' }, items.map(ligneFiche))
      : el('p', {
        class: 'vue-s', text: 'File vide — rien n’a atteint trois jours de silence.',
      }),
    el('button', {
      class: 'bouton', text: 'Oublier cette file',
      onclick: () => { forgetQueue(sessionStorage); peindre('idle') },
    }),
  ])
}

async function demanderFile(bouton, erreur) {
  bouton.disabled = true
  erreur.hidden = true
  try {
    const items = await api.revisits({ site: SITE, limit })
    writeQueue(sessionStorage, items)
    peindre('queue', items)
  } catch (err) {
    // Une licence refusée et une API muette ne se disent pas pareil : dans un
    // cas le marchand se reconnecte, dans l'autre il n'y peut rien.
    erreur.textContent = err instanceof api.AuthError
      ? 'Licence refusée — reconnectez-vous sur /app'
      : "L'API n'a pas répondu. Réessayez dans un instant."
    erreur.hidden = false
    bouton.disabled = false
  }
}

function vueBouton() {
  const erreur = el('p', { class: 'erreur', hidden: true })
  const bouton = el('button', {
    class: 'bouton', text: 'Demander la file',
    onclick: () => demanderFile(bouton, erreur),
  })
  return el('div', {}, [
    el('p', {
      class: 'vue-s',
      text: `Consomme jusqu'à ${limit} fiche${limit > 1 ? 's' : ''} pour sept jours.`,
    }),
    bouton, erreur,
  ])
}

function peindre(state, items = []) {
  clear(racine)
  if (state === 'no-license') {
    racine.append(el('p', { class: 'vue-s', text: 'Connectez-vous d’abord sur /app.' }))
    return
  }
  racine.append(el('h1', { class: 'vue-t', text: 'File de revisite' }))
  racine.append(state === 'queue' ? vueFile(items) : vueBouton())
}

function demarrer() {
  // `?demo=1` ne consomme rien de réel : la file factice se rend tout de
  // suite, c'est ce qui permet la capture d'écran sans clic.
  if (api.isDemo()) {
    api.revisits({ site: SITE, limit: limit || DEFAULT_LIMIT }).then((items) => {
      peindre('queue', items)
    })
    return
  }
  const cached = readQueue(sessionStorage)
  peindre(initialView(Boolean(api.licenseKey()), cached), cached || [])
}

demarrer()
