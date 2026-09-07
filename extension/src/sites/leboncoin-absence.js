globalThis.ADS = globalThis.ADS || {}

// La signature d'absence de leboncoin — un fichier à part, parce que c'est la
// seule lecture de page dont la conclusion s'écrive une fois pour toutes.
//
// Ce qui a été OBSERVÉ le 2026-09-07 dans Chrome, sur deux identifiants morts et
// six vivants : une fiche supprimée rend un 200, pas un 404 ni une redirection.
// L'adresse ne bouge pas, la route Next est bien celle de la fiche, et c'est la
// charge qui est vidée — `props.pageProps.ad` vaut explicitement `null`, la page
// s'intitule « Annonce introuvable » et son h1 dit « Cette annonce est
// désactivée ». Une catégorie inventée, elle, rend une tout autre page : 279
// caractères, h1 « 404 », et AUCUN `__NEXT_DATA__`.
//
// D'où quatre conditions, dont deux témoins indépendants :
//
// 1. la page se déclare être la bonne route (`page`), 2. et porter la bonne
// annonce (`query.id`) — les deux écartent le 404 générique, la page voisine, et
// le mur anti-bot, qui ne rend pas la coquille Next du site ;
// 3. `'ad' in pageProps` ET `ad === null` : une valeur posée par le site, pas un
// champ manquant. Jamais `!pageProps.ad` — le jour où une refonte retire la clé,
// la condition doit devenir fausse et non vraie, sinon toute la base est
// marquée disparue en une nuit ;
// 4. le libellé visible, second témoin : sans lui, un `null` transitoire du
// backend suffirait seul.
//
// `status` est la signature seconde. L'énumération vient du site lui-même
// (`seoIndexingData.rules.non_indexable_statuses`), mais aucune page n'a été vue
// la portant : elle se rapporte pour être journalisée, et n'écrit rien tant
// qu'on ne l'a pas observée. C'est l'API qui tient cette règle.
//
// Tout le reste est `unreadable`, et illisible n'est pas disparu : une
// extraction qui échoue est une extraction qui échoue.
ADS.leboncoin.absence = (() => {
  const ROUTE = '/ad/[cat]/[id]'
  const TERMINAL = ['sold', 'inactive', 'pending', 'deleted']
  const TITLE = 'Annonce introuvable'
  const HEADING = /annonce est désactivée/i

  const payload = (doc) => {
    const tag = doc.getElementById('__NEXT_DATA__')
    if (!tag) return null
    try {
      return JSON.parse(tag.textContent)
    } catch {
      return null
    }
  }

  // Le second témoin : ce que la page dit en toutes lettres.
  const says = (doc) => {
    const h1 = doc.querySelector('h1')
    return (doc.title || '').trim() === TITLE || HEADING.test((h1 && h1.textContent) || '')
  }

  return (doc, id) => {
    const json = payload(doc)
    if (!json || json.page !== ROUTE) return 'unreadable'
    if (String((json.query || {}).id) !== String(id)) return 'unreadable'
    const props = (json.props || {}).pageProps || {}
    if (!('ad' in props)) return 'unreadable'
    if (props.ad === null) return says(doc) ? 'absent' : 'unreadable'
    const status = (props.ad || {}).status
    return TERMINAL.includes(status) ? `status:${status}` : 'alive'
  }
})()

if (typeof module !== 'undefined') module.exports = ADS.leboncoin.absence
