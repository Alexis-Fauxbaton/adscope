globalThis.ADS = globalThis.ADS || {}

// Deux façons d'authentifier un appel à l'API : la clé, pour les machines
// (crawl, revisites) — inchangée ; le cookie de session sinon, celui que
// l'humain porte depuis le lien magique et ne voit jamais. `X-Adscope` sert
// de jeton CSRF aux requêtes par cookie : une page tierce ne peut pas poser
// un en-tête personnalisé sans prévol CORS, et l'API n'en ouvre aucun — seule
// une extension avec permission d'hôte le peut, à l'exclusion des pages tierces.
ADS.auth = (() => {
  // Sobre : ce badge dit « reconnectez-vous », pas « alerte » — le rouge de
  // l'alerte reste celui du compte d'annonces posé par ailleurs (sw.js).
  const BADGE_COLOR = '#6b7180'
  let down = false

  const headers = (cfg, extra = {}) =>
    cfg.licenseKey ? { ...extra, Authorization: `Bearer ${cfg.licenseKey}` } : { ...extra, 'X-Adscope': '1' }

  const credentials = (cfg) => (cfg.licenseKey ? undefined : 'include')

  // Une clé de machine ne pose jamais ce badge : une clé mauvaise est son
  // propre défaut, pas une session à rouvrir dans un navigateur — les
  // machines n'en ouvrent pas. Le badge est global, pas par onglet : une
  // session tombée l'est partout. Il ne bouge qu'au changement d'état, pour
  // ne pas repeindre l'icône à chaque appel réussi.
  //
  // Un « ! » posé en mode session ne s'efface pas tout seul en changeant de
  // mode : passer à une clé sort désormais par cette branche à chaque appel,
  // et rien n'y redescendait `down`. Le badge restait posé pour toujours,
  // même une fois la clé configurée et l'appel réussi.
  const mark = async (cfg, status) => {
    if (cfg.licenseKey) {
      if (down) {
        down = false
        await chrome.action.setBadgeText({ text: '' })
      }
      return false
    }
    const authRequired = status === 401
    if (authRequired === down) return authRequired
    down = authRequired
    if (down) await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR })
    await chrome.action.setBadgeText({ text: down ? '!' : '' })
    return authRequired
  }

  return { headers, credentials, mark }
})()

if (typeof module !== 'undefined') module.exports = ADS.auth
