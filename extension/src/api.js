globalThis.ADS = globalThis.ADS || {}

// Le seul endroit d'où l'extension parle à l'API. Extrait de sw.js pour que
// l'état de santé se tienne au passage : chaque appel dit si le serveur a
// répondu (`ADS.reach`) et si la session tient encore (`ADS.auth`), et ces
// deux constats-là sont la moitié de ce que la fenêtre affiche.
ADS.api = (() => {
  const DEFAULTS = { apiBase: 'http://localhost:8000', licenseKey: '' }

  const config = async () => ({
    ...DEFAULTS,
    ...(await chrome.storage.local.get(Object.keys(DEFAULTS))),
  })

  // Clé configurée → Bearer, machines inchangées ; sinon cookie de session et
  // jeton CSRF. `method` vaut POST par défaut ; `me` seul lit, en GET.
  const call = async (path, body, cfg, method = 'POST') => {
    let res
    try {
      res = await fetch(cfg.apiBase + path, {
        method,
        headers: ADS.auth.headers(cfg, body ? { 'Content-Type': 'application/json' } : {}),
        credentials: ADS.auth.credentials(cfg),
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    } catch {
      // Personne au bout : l'erreur ne porte pas de code, et surtout pas de
      // consigne de reconnexion — la session n'y est pour rien.
      await ADS.reach.broke()
      const e = new Error('injoignable')
      e.unreachable = true
      throw e
    }
    await ADS.reach.answered(res.status)
    const authRequired = await ADS.auth.mark(cfg, res.status)
    if (!res.ok) {
      const e = new Error(`${res.status}`)
      e.authRequired = authRequired
      throw e
    }
    return res.json()
  }

  return { config, call }
})()

if (typeof module !== 'undefined') module.exports = ADS.api
