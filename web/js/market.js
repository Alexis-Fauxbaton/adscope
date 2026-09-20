// Le marché — ce qu'adscope a vu, filtré comme le marchand le regarde.

import * as api from './api.js'
import { clear, el } from './dom.js'
import { EMPTY_FACETS, anyBadRange, panelCount } from './market-facets.js'
import { renderChips, renderFamilies, renderFilters, renderSort } from './market-filters.js'
import { createList } from './market-list.js'
import { renderPanel } from './market-panel.js'
import { PAUSE_MS, applyPatch, createFacetRefresher } from './market-state.js'
import { debounce } from './query.js'
import { hashOf } from './url-state.js'

const PERIMETRE = "Sur les annonces qu'adscope a vues — pas tout le marché."
const ROUTE = '#/marche'

export async function renderMarket(root, state) {
  // Une licence refusée en cours de route ramène à l'écran de connexion ; le
  // reste des pannes reste dans la page.
  const auth = (err) => { if (err instanceof api.AuthError) state.onAuthError() }

  // Le périmètre ne change pas d'un filtre à l'autre : il se demande une fois.
  if (!state.families) {
    state.families = await api.families().catch((err) => { auth(err); return [] })
  }
  if (!state.facets) state.facets = EMPTY_FACETS
  // Au premier affichage seulement : une adresse qui porte un filtre du
  // panneau arrive panneau ouvert. Sans ça, celui qui reçoit le lien lit une
  // liste réduite par un filtre qu'il ne voit nulle part. Ensuite c'est le
  // marchand qui décide, et le panneau ne se rouvre plus tout seul.
  if (state.panelOpen == null) state.panelOpen = panelCount(state.filters) > 0

  // Les trois zones vivent dans le même bloc : la rangée, puis les pastilles,
  // puis le panneau. Les pastilles *au-dessus* du panneau — ouvert, il ferait
  // sinon descendre hors de l'écran ce qui dit quels filtres agissent.
  const zoneRangee = el('div')
  const zonePastilles = el('div')
  const zonePanneau = el('div')
  const zoneFiltres = el('div', { class: 'zone-f' }, [zoneRangee, zonePastilles, zonePanneau])
  const etiquette = el('p', { class: 'compte' })
  const zone = el('div')
  const tri = el('div')

  const ui = {
    get filters() { return state.filters },
    get facets() { return state.facets },
    get families() { return state.families },
    get open() { return state.panelOpen },
    get total() { return state.total },
    get narrow() { return matchMedia('(max-width: 720px)').matches },
    patch, search: (texte) => chercher(texte), toggleOpen,
  }

  // `pushState` n'émet pas `hashchange` : l'écran ne se redessine pas sous nos
  // pieds. Le bouton retour, lui, l'émet — `app.js` relit alors les filtres
  // dans l'URL et refait la page. La frappe remplace l'entrée courante plutôt
  // que d'en empiler une par pause de saisie.
  function ecrireUrl(replace) {
    const url = hashOf(ROUTE, state.filters)
    if (location.hash === url) return
    history[replace ? 'replaceState' : 'pushState'](null, '', url)
  }

  function patch(correctif) {
    state.filters = applyPatch(state.filters, correctif)
    ecrireUrl(false)
    poser()
    rafraichirFacettes(state.filters, { now: true })
    charger(false)
  }

  const chercher = debounce((texte) => {
    state.filters = applyPatch(state.filters, { q: texte })
    ecrireUrl(true)
    dessinerPastilles()
    rafraichirFacettes(state.filters, { now: true })
    charger(false)
  }, PAUSE_MS)

  function toggleOpen() {
    state.panelOpen = !state.panelOpen
    poser()
  }

  const demanderFacettes = createFacetRefresher({
    fetchFacets: api.facets,
    // Les anciens compteurs restent en place tant que la réponse n'est pas
    // là ; une panne de facettes ne vide donc jamais les listes.
    onFacets: (facettes) => { state.facets = facettes; poser() },
    onError: auth,
  })

  // Même règle que la liste : rien ne part tant que la fourchette est à
  // l'envers, et les compteurs affichés restent ceux d'avant.
  const rafraichirFacettes = (filters, options) => (
    anyBadRange(filters) ? null : demanderFacettes(filters, options)
  )

  function dessinerPastilles() {
    clear(zonePastilles).append(...[renderFamilies(ui), renderChips(ui)].filter(Boolean))
  }

  // Redessiner la rangée sous un champ en cours de frappe ou une liste
  // ouverte couperait le marchand en plein mot ou refermerait sa liste. Dans
  // ce cas seules les pastilles bougent ; la rangée se remet à jour au
  // changement suivant.
  function poser() {
    const actif = document.activeElement
    const dedans = actif && zoneFiltres.contains(actif)
    if ((dedans && actif.id === 'q') || zoneFiltres.querySelector('.combo-pop:not([hidden])')) {
      dessinerPastilles()
      return
    }
    const id = dedans ? actif.id : null
    clear(zoneRangee).append(renderFilters(ui))
    dessinerPastilles()
    clear(zonePanneau).append(...[renderPanel(ui)].filter(Boolean))
    clear(tri).append(renderSort(ui))
    const rendu = id && zoneFiltres.querySelector(`#${CSS.escape(id)}`)
    if (rendu) rendu.focus()
  }

  const charger = createList({ state, zone, etiquette, auth, onClear: patch })

  clear(root).append(
    el('h1', { class: 'vue-t', text: 'Le marché' }),
    el('p', { class: 'vue-s', text: PERIMETRE }),
    zoneFiltres,
    el('div', { class: 'compte-ligne' }, [etiquette, tri]),
    zone,
  )
  poser()
  rafraichirFacettes(state.filters, { now: true })
  await charger(false)
}
