globalThis.ADS = globalThis.ADS || {}

// Une mise à jour poussée par le Store remplace l'extension sans toucher aux
// onglets ouverts : les content scripts de l'ancienne version continuent d'y
// tourner, mais l'extension à laquelle ils appartiennent n'existe plus. Leur
// observateur les rappelle, et le premier appel `chrome.*` lève — « Extension
// context invalidated », dans la console de chaque onglet ouvert de chaque
// utilisateur. Un script orphelin doit s'arrêter en silence : ce qui est déjà
// affiché reste, il cesse d'observer et n'appelle plus rien.
ADS.context = (() => {
  // La seule marque lisible du contexte perdu, et la lire ne coûte rien. La
  // lecture elle-même peut lever, `chrome` étant démonté avec l'extension.
  const alive = () => {
    try {
      return !!(chrome.runtime && chrome.runtime.id)
    } catch {
      return false
    }
  }

  const observers = []

  // Sans retour possible : rien ne redonne son contexte à un script orphelin.
  // Le silence, lui, n'est plus de mise : ce qui est affiché reste sous les
  // yeux du lecteur, figé, et il doit savoir qu'un rechargement le ranime. La
  // mention est posée par src/stale-notice.js, qui n'existe pas dans tous les
  // mondes où context.js est chargé seul — d'où le garde.
  const stop = () => {
    for (const o of observers.splice(0)) o.disconnect()
    if (globalThis.ADS && ADS.staleNotice) ADS.staleNotice.show()
  }

  // L'appel peut lever avant que l'identifiant ait disparu : c'est la même
  // panne, vue de l'autre bout. Elle seule est absorbée — un vrai défaut doit
  // continuer de se voir.
  const lost = (e) => !alive() || /context invalidated/i.test((e && e.message) || '')

  const guard =
    (fn) =>
    (...args) => {
      if (!alive()) return stop()
      try {
        return fn(...args)
      } catch (e) {
        if (!lost(e)) throw e
        stop()
      }
    }

  // Le seul observateur du code : les mutations de la page. Il est retenu pour
  // pouvoir être arrêté quand le contexte disparaît.
  const observe = (fn) => {
    const o = new MutationObserver(fn)
    observers.push(o)
    o.observe(document.body, { childList: true, subtree: true })
  }

  return { guard, observe }
})()

if (typeof module !== 'undefined') module.exports = ADS.context
