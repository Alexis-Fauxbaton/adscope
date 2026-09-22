// Mes recherches — une carte par recherche enregistrée : ses filtres en
// pastilles (les mêmes que Le marché, jamais un résumé en gris à part), le
// marché qu'elle couvre aujourd'hui, ses deux règles écrites en phrases,
// puis pause/suppression à part. `query` est déjà la forme canonique rendue
// par l'API ; ce fichier ne la réécrit pas, il la relit (`filtersFromQuery`)
// pour retrouver les mêmes pastilles que la page qui l'a produite.
//
// Cocher une règle ne redessine rien (`renderSwitch` gère son propre
// optimisme) ; mettre en pause ou supprimer change l'allure de la carte ou
// la liste, donc redessine, mais seulement cette section — jamais toute la
// page, jamais un second aller-retour réseau que l'écriture qui vient d'être
// faite.

import { activeChips } from './market-chips.js'
import { clear, el } from './dom.js'
import { filtersFromQuery } from './url-state.js'
import { renderSwitch } from './switch.js'
import { renderThresholds } from './alerts-search-thresholds.js'
import { NEW_SENTENCE, PAUSE_HINT, RESUME_HINT, countLabel, coverageSentence, payloadFor } from './alerts-search-rules.js'

const PANNE = "L'action n'a pas pu être faite. Réessayez."

function pastilles(search, facets) {
  const chips = activeChips(filtersFromQuery(search.query), facets)
  if (!chips.length) return el('p', { class: 'as-tout', text: 'Tout le marché, sans filtre.' })
  return el('div', { class: 'pastilles' }, chips.map((c) => el('span', { class: 'pastille pastille-lecture' }, [
    el('span', { text: c.label }),
  ])))
}

// Le titre est le seul contenu du libellé cliquable de l'interrupteur — une
// phrase avec ses menus (`renderThresholds`) juste dessous n'y entre pas :
// cliquer un menu ne doit jamais aussi cocher/décocher la règle.
function regle(search, field, titre, onPatch) {
  return renderSwitch({
    id: `as-${field}-${search.id}`,
    checked: search[field],
    onChange: (value) => onPatch(search.id, { [field]: value }),
    content: [el('span', { class: 'switch-titre', text: titre })],
  })
}

function actions(search, { onTogglePause, onDelete }) {
  let arme = false
  const supprimer = el('button', { class: 'as-discret', text: 'Supprimer' })
  supprimer.addEventListener('click', () => {
    if (!arme) { arme = true; supprimer.textContent = 'Confirmer'; supprimer.classList.add('as-arme'); return }
    onDelete(search.id)
  })
  const pause = el('button', { class: 'as-discret', text: search.paused ? 'Reprendre' : 'Mettre en pause',
    onclick: () => onTogglePause(search.id, !search.paused) })
  return el('div', { class: 'as-actions' }, [
    el('div', {}, [pause, el('span', { class: 'as-note', text: search.paused ? RESUME_HINT : PAUSE_HINT })]),
    supprimer,
  ])
}

// En pause, seul le corps s'atténue (`as-carte-corps`) : la carte reste
// blanche (registre), l'entête et les actions restent lisibles.
function carte(search, facetsById, callbacks) {
  const facets = facetsById[search.id]
  const corps = el('div', { class: 'as-carte-corps' }, [
    pastilles(search, facets),
    el('p', { class: 'as-compte' }, [
      el('span', { text: countLabel(facets && facets.total) }),
      el('a', { class: 'lien-sortant', href: `#/marche?${search.query}`, text: 'Voir les annonces' }),
    ]),
    el('p', { class: 'as-couverture', text: coverageSentence(search) }),
    el('div', { class: 'as-regles' }, [
      el('div', { class: 'as-regle' }, [
        regle(search, 'notify_drops', 'Baisses sur les annonces anciennes', callbacks.onPatch),
        renderThresholds(search, callbacks.onPatch),
      ]),
      el('div', { class: 'as-regle' }, [
        regle(search, 'notify_new', 'Nouvelles annonces', callbacks.onPatch),
        el('p', { class: 'switch-phrase as-seuils', text: NEW_SENTENCE }),
      ]),
    ]),
  ])
  return el('section', { class: `carte as-carte${search.paused ? ' as-carte-pause' : ''}` }, [
    el('div', { class: 'as-tete' }, [
      el('h3', { class: 'as-nom', text: search.name }),
      search.paused && el('span', { class: 'as-badge', text: 'En pause' }),
    ]),
    corps,
    actions(search, callbacks),
  ])
}

function liste(rows, facetsById, callbacks) {
  if (!rows.length) {
    return el('p', { class: 'as-tout', text: "Aucune recherche pour l'instant : "
      + 'cliquez « Nouvelle recherche » ci-dessus pour commencer.' })
  }
  return el('div', { class: 'pile' }, rows.map((s) => carte(s, facetsById, callbacks)))
}

// Le contrôleur de la section entière : il possède `rows` (mutée en place à
// chaque écriture réussie) et redessine seulement la liste, jamais l'entête
// ni le reste de la page.
export function renderSearchSection(root, initialRows, facetsById, api) {
  let rows = initialRows
  const corps = el('div')
  const erreur = el('p', { class: 'as-section-erreur', role: 'alert', hidden: true, text: PANNE })

  function dessiner() {
    clear(corps).append(liste(rows, facetsById, callbacks))
  }

  const callbacks = {
    // Une règle cochée n'a rien à redessiner ici : `renderSwitch` tient déjà
    // son propre optimisme et son propre message d'échec.
    onPatch: async (id, patch) => {
      const search = rows.find((r) => r.id === id)
      const updated = await api.updateSearch(id, payloadFor(search, patch))
      Object.assign(search, updated)
    },
    onTogglePause: async (id, next) => {
      const search = rows.find((r) => r.id === id)
      try {
        const updated = await api.updateSearch(id, payloadFor(search, { paused: next }))
        Object.assign(search, updated)
        erreur.hidden = true
        dessiner()
      } catch { erreur.hidden = false }
    },
    onDelete: async (id) => {
      try {
        await api.deleteSearch(id)
        rows = rows.filter((r) => r.id !== id)
        erreur.hidden = true
        dessiner()
      } catch { erreur.hidden = false }
    },
  }

  clear(root).append(
    el('div', { class: 'as-entete' }, [
      el('div', {}, [
        el('h2', { class: 'alerts-h', text: 'Mes recherches' }),
        el('p', { class: 'as-aide', text: 'Filtrez le marché, puis Enregistrez cette recherche.' }),
      ]),
      el('a', { class: 'bouton', href: '#/marche', text: 'Nouvelle recherche' }),
    ]),
    erreur,
    corps,
  )
  dessiner()
}
