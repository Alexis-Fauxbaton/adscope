globalThis.ADS = globalThis.ADS || {}

// Ce qui remplace la pastille et le panneau quand la session est tombée :
// « adscope — reconnectez-vous » plutôt qu'un signal périmé affiché comme
// s'il était à jour.
//
// Classe préfixée `ads-auth-`, jamais `adscope-` : le contrôle de santé du
// crawl (crawler/RUNBOOK.md) compte les `[class*="adscope-"]` pour juger la
// collecte vivante sur une page. Une mention de déconnexion qui porterait ce
// préfixe satisferait ce compte sans qu'une seule annonce ne soit vraiment
// suivie — le crawl tournerait à vide en se croyant sain.
ADS.authNotice = (() => {
  const TEXT = 'adscope — reconnectez-vous'
  const DEFAULT_BASE = 'http://localhost:8000'

  // Lu une fois par page, pas à chaque carte repeinte : la fenêtre ne relit
  // pas le stockage pour chaque annonce d'une page de résultats.
  let apiBase = DEFAULT_BASE
  chrome.storage.local.get(['apiBase']).then((s) => { if (s.apiBase) apiBase = s.apiBase })

  const mention = () => {
    const n = document.createElement('button')
    n.type = 'button'
    n.className = 'ads-auth-msg'
    n.textContent = TEXT
    n.addEventListener('click', () => window.open(`${apiBase}/app`, '_blank'))
    return n
  }

  return { mention }
})()

if (typeof module !== 'undefined') module.exports = ADS.authNotice
