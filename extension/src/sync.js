globalThis.ADS = globalThis.ADS || {}

// Le suivi mutualisé, jamais bloquant : le rendu local a déjà eu lieu quand la
// réponse arrive, elle ne fait que l'enrichir. Deux réponses plutôt qu'une —
// le cache, tout de suite, puis le réseau. Un envoi par charge d'annonces
// reçue — la page 2 en est une —, mais jamais deux fois la même annonce :
// l'API dédoublonne les prix, lui faire retraiter le même lot à chaque lot de
// mutations serait du gaspillage des deux côtés.
ADS.sync = (() => {
  // Même seuil que `observation.js` — dupliqué, pas importé : ce module vit
  // dans le content script, `observation.js` dans le service worker, deux
  // royaumes JS qui ne partagent pas `ADS`.
  const FRESH_MS = 6 * 3600 * 1000
  const listeners = []
  const queued = new Set()
  const origin = {}
  let signals = null
  let acked = 0
  // La session tombée, hors mode clé : un 401 sur l'appel réseau, jamais sur
  // celui du cache — le cache ne parle pas à l'API et ne peut rien en dire.
  let authDown = false

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
      if (chrome.runtime.lastError || !res || !res.ok) return fail && fail(res)
      fn(res)
    })

  // Ne notifie que si l'état change : la fenêtre ne doit pas rejouer son rendu
  // à chaque appel réseau qui confirme ce qu'on savait déjà.
  const setAuth = (down) => {
    if (down === authDown) return
    authDown = down
    notify()
  }

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
    // Le site vient des annonces, jamais du code : c'est la page ouverte qui le
    // dit, et l'API le range tel quel. Un lot ne porte jamais deux sites.
    const site = fresh[0].site
    // Le cache d'abord : ce qu'on savait s'affiche sans attendre le réseau, et
    // hors ligne c'est la seule réponse qui viendra.
    ask({ type: 'cached', site, ids: fresh.map((l) => l.siteId) }, (res) => {
      if (merge(res.signals, 'cache')) notify()
    })
    ask({ type: 'sync', site, listings: fresh }, (res) => {
      acked += res.sent || 0
      merge(res.signals, 'network')
      // Même sans signal nouveau, l'accusé de réception change ce que le
      // diagnostic doit dire : le rendu est rejoué.
      signals = signals || {}
      setAuth(false)
      notify()
      // Un envoi réussi n'exclut pas l'annonce pour toujours : passé FRESH_MS,
      // elle redevient éligible à un nouvel envoi — sans quoi une annonce
      // restant affichée des heures sur un onglet SPA ne serait plus jamais
      // resynchronisée après son premier envoi. `unref` (absent des content
      // scripts, présent sous Node) : ce minuteur ne doit jamais retenir un
      // process de test vivant six heures.
      for (const l of fresh) {
        const timer = setTimeout(() => queued.delete(l.siteId), FRESH_MS)
        if (timer.unref) timer.unref()
      }
    }, (res) => {
      for (const l of fresh) queued.delete(l.siteId)
      pausedUntil = Date.now() + RETRY_PAUSE_MS
      setAuth(!!(res && res.authRequired))
    })
  })

  // La constatation d'absence ne passe pas par le lot d'observations : une
  // annonce qui n'est plus là n'a rien à apprendre à la base, sinon qu'elle
  // n'est plus là. Aucun verdict n'est attendu en retour — rien n'en est
  // affiché, et c'est l'API seule qui décide ce qu'il écrit.
  const absent = ADS.context.guard((site, siteId, evidence) =>
    ask({ type: 'absent', site, siteId, evidence }, () => {}),
  )

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
    absent,
    onSignals,
    counts,
    sent: () => acked,
    of: (siteId) => (signals && signals[siteId]) || null,
    originOf: (siteId) => origin[siteId] || null,
    authDown: () => authDown,
  }
})()

if (typeof module !== 'undefined') module.exports = ADS.sync
