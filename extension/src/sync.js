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

  const ask = (msg, fn, fail) =>
    chrome.runtime.sendMessage(msg, (res) => {
      // Lire lastError évite que Chrome le rapporte dans la console de la page.
      if (chrome.runtime.lastError || !res || !res.ok) return fail && fail()
      fn(res)
    })

  // Ce que l'API n'a pas pris doit repartir : un lot refusé — serveur éteint,
  // 500, lot mal formé — emportait sinon toute la page, sans trace. Les
  // identifiants sont relâchés et la charge suivante les remporte.
  //
  // Mais la page produit ses lots de mutations en rafale, et chacun rappelle
  // `send` : sans délai, une API éteinte serait resollicitée dix fois par
  // seconde. La pause laisse passer la rafale, pas la page suivante.
  const RETRY_PAUSE_MS = 30000
  let pausedUntil = 0

  const send = ADS.context.guard((listings) => {
    if (Date.now() < pausedUntil) return
    const fresh = listings.filter((l) => !queued.has(l.siteId))
    if (!fresh.length) return
    // Marquées avant la réponse, relâchées si elle est mauvaise : deux envois
    // simultanés ne portent jamais la même annonce, et rien ne se perd.
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
    }, () => {
      for (const l of fresh) queued.delete(l.siteId)
      pausedUntil = Date.now() + RETRY_PAUSE_MS
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
