globalThis.ADS = globalThis.ADS || {}

// L'onglet périmé. L'extension a été rechargée ou mise à jour pendant que la
// page était ouverte : le script qui y tourne appartient à une version qui
// n'existe plus. src/context.js l'arrête en silence — ce qui est affiché reste,
// figé, et rien ne dit au lecteur que les pastilles sous ses yeux ne bougeront
// plus. Un rechargement suffit ; encore faut-il le lui dire.
//
// Ce script-là ne peut plus rien demander : ni au service worker, ni au
// stockage de l'extension. La mention se pose donc depuis la page seule, sans
// aucun message.
//
// Classe préfixée `ads-`, jamais `adscope-` : le contrôle de santé du crawl
// (crawler/RUNBOOK.md) compte les `[class*="adscope-"]` pour juger la collecte
// vivante sur une page. Une mention d'onglet périmé qui porterait ce préfixe
// satisferait ce compte alors que plus rien n'est suivi — le crawl tournerait
// à vide en se croyant sain.
ADS.staleNotice = (() => {
  const TEXT = 'adscope a été mis à jour — rechargez la page'
  // Les seuls emplacements que l'extension occupe déjà : la pastille des
  // cartes, le panneau de la fiche. Rien n'est ajouté ailleurs.
  const TAKEN = '[data-adscope], [data-adscope-detail]'
  // L'ancienneté écrite par listing.js : elle décrivait un suivi qui s'est
  // arrêté, elle ne doit pas survivre à la mention.
  const DAYS = 'data-adscope-days'

  const mention = () => {
    const n = document.createElement('span')
    n.className = 'ads-stale-msg'
    n.setAttribute('title', TEXT)
    const label = document.createElement('span')
    label.textContent = TEXT
    n.append(ADS.icons.mark(), label)
    return n
  }

  // Une seule fois : la garde de context.js peut être rappelée à chaque lot de
  // mutations, et une console qui répète la même ligne n'est plus lue.
  let posted = false

  const show = () => {
    if (posted) return false
    posted = true
    for (const node of document.querySelectorAll(TAKEN)) {
      node.className = ''
      node.removeAttribute(DAYS)
      node.replaceChildren(mention())
    }
    console.info(`adscope : ${TEXT}`)
    return true
  }

  return { show }
})()

if (typeof module !== 'undefined') module.exports = ADS.staleNotice
