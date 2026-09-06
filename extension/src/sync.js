globalThis.ADS = globalThis.ADS || {}

// Le suivi mutualisé, jamais bloquant : le rendu local a déjà eu lieu quand la
// réponse arrive, elle ne fait que l'enrichir. Deux réponses plutôt qu'une —
// le cache, tout de suite, puis le réseau. Un envoi par charge d'annonces
// reçue — la page 2 en est une —, mais jamais deux fois la même annonce :
// l'API dédoublonne les prix, lui faire retraiter le même lot à chaque lot de
// mutations serait du gaspillage des deux côtés.
ADS.sync = (() => {
  const listeners = []
  const queued = new Set()
  const origin = {}
  let signals = null
  let acked = 0

  // Le réseau fait autorité : les deux réponses courent en parallèle, et celle
  // du cache, si elle traîne, ne doit pas recouvrir ce qui vient d'arriver.
  const merge = (incoming, from) => {
    let changed = false
    for (const [siteId, s] of Object.entries(incoming || {})) {
      if (from === 'cache' && origin[siteId] === 'network') continue
      signals = { ...signals, [siteId]: s }
      origin[siteId] = from
      changed = true
    }
    return changed
  }

  const notify = () => {
    for (const fn of listeners) fn(signals)
  }

  const ask = (msg, fn) =>
    chrome.runtime.sendMessage(msg, (res) => {
      // Lire lastError évite que Chrome le rapporte dans la console de la page.
      if (chrome.runtime.lastError || !res || !res.ok) return
      fn(res)
    })

  const send = ADS.context.guard((listings) => {
    const fresh = listings.filter((l) => !queued.has(l.siteId))
    if (!fresh.length) return
    // Marquées avant la réponse : un envoi qui échoue n'est pas rejoué, sans quoi
    // une API injoignable serait resollicitée à chaque lot de mutations.
    for (const l of fresh) queued.add(l.siteId)
    // Le cache d'abord : ce qu'on savait s'affiche sans attendre le réseau, et
    // hors ligne c'est la seule réponse qui viendra.
    ask({ type: 'cached', site: 'lbc', ids: fresh.map((l) => l.siteId) }, (res) => {
      if (merge(res.signals, 'cache')) notify()
    })
    ask({ type: 'sync', site: 'lbc', listings: fresh }, (res) => {
      acked += res.sent || 0
      merge(res.signals, 'network')
      // Même sans signal nouveau, l'accusé de réception change ce que le
      // diagnostic doit dire : le rendu est rejoué.
      signals = signals || {}
      notify()
    })
  })

  const onSignals = (fn) => {
    listeners.push(fn)
    if (signals) fn(signals)
  }

  // Ce que la popup doit pouvoir distinguer : l'encart affiche-t-il ce qu'on
  // savait ou ce que l'API vient de dire.
  const counts = () => {
    const out = { cache: 0, network: 0 }
    for (const from of Object.values(origin)) out[from]++
    return out
  }

  // Ce que l'API a accusé, pas ce qu'on lui a tendu : le diagnostic ne doit
  // annoncer transmis que ce qui est entré en base.
  return {
    send,
    onSignals,
    counts,
    sent: () => acked,
    of: (siteId) => (signals && signals[siteId]) || null,
    originOf: (siteId) => origin[siteId] || null,
  }
})()

if (typeof module !== 'undefined') module.exports = ADS.sync
