globalThis.ADS = globalThis.ADS || {}

// Un seul aller-retour par page, et jamais bloquant : le rendu local a déjà
// eu lieu quand la réponse arrive, elle ne fait que l'enrichir.
ADS.sync = (() => {
  const listeners = []
  let signals = null
  let sent = false

  const send = (listings) => {
    if (sent || !listings.length) return
    sent = true
    try {
      chrome.runtime.sendMessage({ type: 'sync', site: 'lbc', listings }, (res) => {
        // Lire lastError évite que Chrome le rapporte dans la console de la page.
        if (chrome.runtime.lastError || !res || !res.ok) return
        signals = res.signals || {}
        for (const fn of listeners) fn(signals)
      })
    } catch {
      // Contexte d'extension invalidé pendant la navigation : sans suite.
    }
  }

  const onSignals = (fn) => {
    listeners.push(fn)
    if (signals) fn(signals)
  }

  return { send, onSignals, of: (siteId) => (signals && signals[siteId]) || null }
})()

if (typeof module !== 'undefined') module.exports = ADS.sync
