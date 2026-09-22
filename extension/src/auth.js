globalThis.ADS = globalThis.ADS || {}

// Deux façons d'authentifier un appel à l'API : la clé, pour les machines
// (crawl, revisites) — inchangée ; le cookie de session sinon, celui que
// l'humain porte depuis sa connexion par mot de passe et ne voit jamais.
// `X-Adscope` sert de jeton CSRF aux requêtes par cookie : une page tierce ne peut pas poser
// un en-tête personnalisé sans prévol CORS, et l'API n'en ouvre aucun — seule
// une extension avec permission d'hôte le peut, à l'exclusion des pages tierces.
ADS.auth = (() => {
  const headers = (cfg, extra = {}) =>
    cfg.licenseKey ? { ...extra, Authorization: `Bearer ${cfg.licenseKey}` } : { ...extra, 'X-Adscope': '1' }

  const credentials = (cfg) => (cfg.licenseKey ? undefined : 'include')

  // Une clé de machine ne signale jamais de session tombée : une clé mauvaise
  // est son propre défaut, pas une session à rouvrir dans un navigateur — les
  // machines n'en ouvrent pas. Passer à une clé efface donc le problème posé
  // en mode session, au lieu de le laisser pour toujours.
  //
  // Le badge n'est plus peint ici : une session tombée est un problème parmi
  // d'autres, et c'est `ADS.health` qui tient la liste et l'icône. Il est
  // global, pas par onglet — une session tombée l'est partout.
  const mark = async (cfg, status) => {
    const authRequired = !cfg.licenseKey && status === 401
    ADS.health.note({ kind: 'logged_out' }, authRequired)
    await ADS.health.show()
    return authRequired
  }

  return { headers, credentials, mark }
})()

if (typeof module !== 'undefined') module.exports = ADS.auth
