// /app/balayage.html — pilotée par la session cowork d'Alexis qui suit
// `crawler/RUNBOOK-balayage.md`. Même mécanique que revisites.html : la
// session vit dans le cookie du navigateur, cette page ne fait que demander
// `/v1/me` pour savoir si elle est là, puis `/v1/sweep` au clic. `GET`, rien
// n'est consommé : pas de file à garder en `sessionStorage` d'un rechargement
// à l'autre, contrairement à `revisits-page.js`.

import * as sweepApi from './api-sweep.js'
import * as api from './api.js'
import { clear, el } from './dom.js'
import { parsePages } from './balayage.js'

const racine = document.getElementById('racine')
const pages = parsePages(location.search)

// `data-pages`/`data-expected-total` sur l'`<a>` : les deux valeurs que la
// session cowork consigne au journal, lues sans reconstruire l'URL — même
// principe que `data-site-id` sur `revisits-page.js`.
function ligneRecherche(item) {
  return el('li', {}, el('a', {
    href: item.url, 'data-pages': String(item.pages),
    'data-expected-total': String(item.expected_total), text: item.url,
  }))
}

function vueFile(result) {
  return el('div', {}, [
    el('p', {}, el('output', { id: 'count', text: String(result.items.length) })),
    result.items.length
      ? el('ol', { id: 'queue' }, result.items.map(ligneRecherche))
      : el('p', { class: 'vue-s', text: 'File vide — tout est déjà couvert depuis moins de 24 h.' }),
  ])
}

async function demanderFile(bouton, erreur) {
  bouton.disabled = true
  erreur.hidden = true
  try {
    const result = await sweepApi.sweep(pages)
    peindre('queue', result)
  } catch (err) {
    // Une session refusée et une API muette ne se disent pas pareil : dans un
    // cas la session cowork se reconnecte, dans l'autre elle n'y peut rien.
    erreur.textContent = err instanceof api.AuthError
      ? 'Session refusée — reconnectez-vous sur /app'
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
    el('p', { class: 'vue-s', text: `Jusqu'à ${pages} pages de balayage.` }),
    bouton, erreur,
  ])
}

function peindre(state, result = null) {
  clear(racine)
  if (state === 'no-license') {
    racine.append(el('p', { class: 'vue-s', text: 'Connectez-vous d’abord sur /app.' }))
    return
  }
  racine.append(el('h1', { class: 'vue-t', text: 'File de balayage' }))
  racine.append(state === 'queue' ? vueFile(result) : vueBouton())
}

function demarrer() {
  // `?demo=1` ne consomme rien de réel : la file factice se rend tout de
  // suite, c'est ce qui permet la capture d'écran sans clic.
  if (api.isDemo()) {
    sweepApi.sweep(pages).then((result) => peindre('queue', result))
    return
  }
  api.me()
    .then(() => peindre('idle'))
    .catch(() => peindre('no-license'))
}

demarrer()
