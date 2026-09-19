globalThis.ADS = globalThis.ADS || {}

// L'état de santé, en un seul endroit : la liste des problèmes qui empêchent
// l'extension de travailler **et auxquels le lecteur peut quelque chose**. Le
// 19 septembre 2026, l'accès de l'extension à l'un des sites couverts était
// coupé dans Chrome depuis douze jours ; elle n'a rien dit, la session de
// crawl s'est arrêtée faute de pastilles, et personne n'a su pourquoi. Une
// extension morte en silence, pour un marchand qui paie, c'est une résiliation.
//
// Trois espèces de problème, qui ne se réparent pas du même geste :
// `site_access` (un site par problème), `logged_out`, `unreachable`. L'icône
// porte « ! » dès que la liste n'est pas vide et s'efface quand elle se vide.
ADS.health = (() => {
  // Sobre : ce badge dit « il y a quelque chose à faire », pas « alerte » — le
  // rouge de l'alerte reste celui du compte d'annonces posé par ailleurs.
  const BADGE_COLOR = '#6b7180'

  // L'ordre d'affichage, fixe : l'accès d'abord — c'est le seul qui se répare
  // sans quitter la fenêtre —, la session ensuite, le serveur en dernier.
  const ORDER = ['site_access', 'logged_out', 'unreachable']

  const problems = new Map()

  // Un problème d'accès par site ; les deux autres sont uniques par nature.
  const keyOf = (p) => (p.site ? `${p.kind}:${p.site}` : p.kind)

  const note = (problem, on) => {
    const key = keyOf(problem)
    if (!on) return problems.delete(key)
    const seen = problems.get(key)
    if (seen && JSON.stringify(seen) === JSON.stringify(problem)) return false
    problems.set(key, problem)
    return true
  }

  const list = () => [...problems.values()].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))

  const text = () => (problems.size ? '!' : '')

  // Le badge ne bouge qu'au changement d'état : sans ce garde-fou, chaque appel
  // réussi repeindrait l'icône.
  let painted = null
  const show = async () => {
    const want = text()
    if (want === painted) return want
    painted = want
    if (want) await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR })
    await chrome.action.setBadgeText({ text: want })
    return want
  }

  // Ce que la fenêtre dit de chaque problème : une phrase, un bouton. Le
  // vocabulaire est ici et nulle part ailleurs — « reconnectez-vous » sur un
  // serveur injoignable serait la mauvaise consigne, et c'est précisément ce
  // que ces trois espèces séparées existent pour empêcher.
  const SAYS = {
    site_access: (p) => ({ text: `${p.name} : accès désactivé`, button: 'Réactiver' }),
    logged_out: () => ({ text: 'Session adscope expirée : reconnectez-vous.', button: 'Se reconnecter' }),
    unreachable: () => ({ text: 'adscope est injoignable.', button: 'Réessayer' }),
  }

  const says = (p) => ({ ...p, ...SAYS[p.kind](p) })

  return { note, list, text, show, says }
})()

if (typeof module !== 'undefined') module.exports = ADS.health
