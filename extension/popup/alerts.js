globalThis.ADS = globalThis.ADS || {}

// Les problèmes en cours, en tête de la fenêtre. Une phrase, un bouton, et le
// bouton fait le geste — il ne renvoie pas vers un réglage à trouver soi-même.
//
// C'est pour cette raison que l'accès aux sites se répare ici et pas dans le
// service worker : `chrome.permissions.request` exige un geste de
// l'utilisateur, et la fenêtre est le seul endroit où il y en ait un.
ADS.alerts = (() => {
  const { tag, fill } = ADS.dom

  const ask = (msg) => chrome.runtime.sendMessage(msg).catch(() => null)

  // Un geste par espèce de problème. Chacun rend une promesse : le rendu est
  // rejoué ensuite, sur l'état que le service worker recalcule — c'est lui qui
  // dit si le problème a disparu, jamais le bouton lui-même.
  const acts = {
    // Le premier appel doit être synchrone dans le gestionnaire de clic, sans
    // quoi Chrome ne reconnaît plus le geste et refuse la demande.
    site_access: (p) => chrome.permissions.request({ origins: [p.origin] }).catch(() => false),
    logged_out: () => Promise.resolve(ADS.account.openApp()),
    // Un vrai appel à l'API : c'est sa réussite qui efface le problème.
    unreachable: () => ask({ type: 'me' }),
  }

  const line = (problem, again) => {
    const { text, button } = ADS.health.says(problem)
    const box = tag('div', 'alert')
    const act = tag('button', 'ghost wide', button)
    act.addEventListener('click', () => acts[problem.kind](problem).then(again, again))
    box.append(tag('p', '', text), act)
    return box
  }

  // Rien quand tout va bien : `fill` cache la section vide, qui laisserait
  // sinon un cadre sans contenu en tête de la fenêtre.
  const show = async () => {
    const res = await ask({ type: 'health' })
    fill('alerts', ((res && res.problems) || []).map((p) => line(p, show)))
  }

  return { show }
})()

if (typeof module !== 'undefined') module.exports = ADS.alerts
