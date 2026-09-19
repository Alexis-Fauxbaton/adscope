globalThis.ADS = globalThis.ADS || {}

// L'accès de l'extension aux sites qu'elle couvre. C'est un réglage de Chrome
// (« Accès aux sites »), que le lecteur peut couper sans le savoir : le
// content script cesse alors de se charger, plus une pastille ne se pose, et
// rien — jusqu'ici — ne le disait.
//
// Le registre dit quelles origines sont en jeu ; `chrome.permissions` dit si
// elles sont accordées. Vérifié au démarrage du service worker, à chaque
// changement de permission, et à l'ouverture de la fenêtre.
//
// **Établi par l'exécution le 2026-09-19**, dans un Chromium 151 réel chargé
// avec cette extension (`--load-extension`, contexte persistant Playwright) :
// `permissions.contains` rend `false` sur une origine **alors même que
// l'accès est accordé**, tant qu'elle n'est déclarée que dans
// `content_scripts.matches`. Chrome range ces origines-là dans les
// « scriptable hosts », et `contains` ne compare que les « explicit hosts ».
// La même mesure, manifeste inchangé sauf `host_permissions` portant les
// origines du registre, rend `true`. D'où leur présence au manifeste : sans
// elle, ce module crierait au loup sur une extension en parfait état.
// (Mesures et procédure : .superpowers/alertes-utilisateur.md)
ADS.access = (() => {
  // Le registre parle en origines, `chrome.permissions` en motifs.
  const pattern = (origin) => `${origin}/*`

  // Une permission illisible n'est pas une permission refusée : on se tait.
  const granted = (origin) =>
    chrome.permissions.contains({ origins: [pattern(origin)] }).catch(() => true)

  const check = async () => {
    for (const site of ADS.sites.all()) {
      for (const origin of site.origins) {
        const on = await granted(origin)
        ADS.health.note({ kind: 'site_access', site: site.id, name: site.name, origin: pattern(origin) }, !on)
      }
    }
    await ADS.health.show()
    return ADS.health.list()
  }

  // Le geste de réparation exige un geste de l'utilisateur : il est donc fait
  // depuis la fenêtre (popup/alerts.js), pas ici. Ici on ne fait qu'écouter le
  // résultat — accordé comme retiré.
  //
  // La première vérification est retenue : le service worker s'endort et
  // renaît sans cesse, et rien ne doit dépendre du moment où elle s'achève.
  let ready = null
  const watch = () => {
    chrome.permissions.onAdded.addListener(() => check())
    chrome.permissions.onRemoved.addListener(() => check())
    ready = check()
    return ready
  }

  return { pattern, check, watch, ready: () => ready }
})()

if (typeof module !== 'undefined') module.exports = ADS.access
