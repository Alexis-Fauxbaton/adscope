globalThis.ADS = globalThis.ADS || {}

// Suivre une annonce : le seul geste que le panneau demande au serveur. Il part
// par le service worker, comme tout ce qui parle à l'API — émis du content
// script il porterait l'origine du site ouvert, et le navigateur le refuserait.
//
// Ce que la licence suit déjà arrive avec les signaux ; ce module ne retient
// que ce qui vient d'être demandé, le temps de la page. Une demande par
// annonce : la page rejoue son rendu sans fin, et un double clic avant la
// réponse ne doit pas devenir deux suivis.
ADS.follow = (() => {
  const asked = new Set()

  const add = ADS.context.guard((listing, then) => {
    const at = `${listing.site}·${listing.siteId}`
    if (asked.has(at)) return
    asked.add(at)
    chrome.runtime.sendMessage({ type: 'follow', site: listing.site, siteId: listing.siteId }, (res) => {
      // Lire lastError évite que Chrome le rapporte dans la console de la page.
      // Une demande perdue se relâche : le bouton doit pouvoir être repris.
      if (chrome.runtime.lastError || !res || !res.ok) return asked.delete(at)
      then()
    })
  })

  return { add }
})()

if (typeof module !== 'undefined') module.exports = ADS.follow
