globalThis.ADS = globalThis.ADS || {}

// Le suivi mutualisé, jamais bloquant : le rendu local a déjà eu lieu quand la
// réponse arrive, elle ne fait que l'enrichir. Un envoi par charge d'annonces
// reçue — la page 2 en est une —, mais jamais deux fois la même annonce : l'API
// dédoublonne les prix, lui faire retraiter le même lot à chaque lot de
// mutations serait du gaspillage des deux côtés.
ADS.sync = (() => {
  const listeners = []
  const queued = new Set()
  let signals = null
  let acked = 0

  const send = ADS.context.guard((listings) => {
    const fresh = listings.filter((l) => !queued.has(l.siteId))
    if (!fresh.length) return
    // Marquées avant la réponse : un envoi qui échoue n'est pas rejoué, sans quoi
    // une API injoignable serait resollicitée à chaque lot de mutations.
    for (const l of fresh) queued.add(l.siteId)
    chrome.runtime.sendMessage({ type: 'sync', site: 'lbc', listings: fresh }, (res) => {
      // Lire lastError évite que Chrome le rapporte dans la console de la page.
      if (chrome.runtime.lastError || !res || !res.ok) return
      acked += res.sent || 0
      signals = { ...signals, ...res.signals }
      for (const fn of listeners) fn(signals)
    })
  })

  const onSignals = (fn) => {
    listeners.push(fn)
    if (signals) fn(signals)
  }

  // Ce que l'API a accusé, pas ce qu'on lui a tendu : le diagnostic ne doit
  // annoncer transmis que ce qui est entré en base.
  return { send, onSignals, sent: () => acked, of: (siteId) => (signals && signals[siteId]) || null }
})()

if (typeof module !== 'undefined') module.exports = ADS.sync
