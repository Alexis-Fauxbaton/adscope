// « Emails envoyés » — la boîte d'envoi : jour, sujet, visites en clair. Un
// email sélectionné se rend dans un `<iframe>` bac à sable : `sandbox=""`
// est la restriction maximale (ni scripts, ni même origine, ni formulaires).
// La ligne ouverte porte `ao-ligne-ouverte` (fond à l'accent + chevron
// tourné) — sans ça, l'aperçu apparaît sans dire de quelle ligne il vient.
//
// Piège nommé au plan (§10) : `dom.el` écarte `null` et `false`, jamais la
// chaîne vide — `sandbox: ''` pose bien l'attribut, `sandbox: false` le
// supprimerait en silence.

import { clear, el } from './dom.js'
import { shortDate } from './format.js'

const VIDE = "Le premier email partira le matin où une de vos recherches aura bougé. "
  + "Seul ce qui se passe après l'enregistrement d'une recherche compte."

// « — » ne dit pas si personne n'a ouvert ou si la page ne sait pas
// compter : un chiffre dit en toutes lettres ne laisse pas ce doute.
export function visitsLabel(visits) {
  if (!visits) return 'Pas encore ouvert'
  return `${visits} visite${visits > 1 ? 's' : ''}`
}

// Visites + chevron groupés dans `ao-meta` : en colonne étroite (mobile), ce
// bloc passe entier sous jour/sujet plutôt que de forcer le sujet à
// rétrécir mot par mot jusqu'à déborder sur « Pas encore ouvert ».
function ligne(row, ouverte, onOpen) {
  return el('button', {
    class: `ao-ligne${ouverte ? ' ao-ligne-ouverte' : ''}`,
    'aria-expanded': String(ouverte),
    onclick: () => onOpen(row.id),
  }, [
    el('span', { class: 'ao-jour', text: shortDate(row.day) }),
    el('span', { class: 'ao-sujet', text: row.subject }),
    el('span', { class: 'ao-meta' }, [
      el('span', { class: 'ao-visites', text: visitsLabel(row.visits) }),
      el('span', { class: 'ao-chev', text: '›', 'aria-hidden': 'true' }),
    ]),
  ])
}

export function renderOutbox(rows, fetchDigest) {
  const liste = el('div', { class: 'ao-liste' })
  const apercu = el('div', { class: 'ao-apercu' })
  let ouverteId = null

  function dessinerListe() {
    clear(liste).append(...rows.map((r) => ligne(r, r.id === ouverteId, ouvrir)))
  }

  async function ouvrir(id) {
    ouverteId = id
    dessinerListe()
    clear(apercu).append(el('p', { class: 'vue-s', text: 'Chargement…' }))
    try {
      const d = await fetchDigest(id)
      clear(apercu).append(
        el('p', { class: 'ao-apercu-titre', text: `Aperçu de l'email du ${shortDate(d.day)}` }),
        el('iframe', { class: 'ao-iframe', sandbox: '', srcdoc: d.html, title: `Email du ${d.day}` }),
      )
    } catch {
      clear(apercu).append(el('p', { class: 'vue-s', text: "L'email n'a pas pu être ouvert." }))
    }
  }

  if (rows.length) dessinerListe()

  return el('section', { class: 'carte alerts-carte' }, [
    el('h2', { class: 'alerts-h', text: 'Emails envoyés' }),
    rows.length ? liste : el('p', { class: 'vide', text: VIDE }),
    apercu,
  ])
}
