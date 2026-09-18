globalThis.ADS = globalThis.ADS || {}

// Le registre. Chaque module de site y déclare ce qui lui est propre : les
// origines qu'il couvre, la lecture d'un identifiant d'annonce dans une URL, la
// carte qui porte une annonce sur une page de résultats, le libellé
// d'ancienneté que la page affiche, son extraction, ses seuils et ses mots.
//
// Le code partagé ne connaît que « le site de la page ouverte » : il en résout
// un par l'origine et n'en nomme aucun. Ajouter un site redevient ce que
// l'architecture promettait — ajouter un fichier, et deux lignes au manifeste.
ADS.sites = (() => {
  const all = []

  // Rechargé — les tests le font entre deux mondes —, un site remplace sa
  // déclaration au lieu de la doubler.
  const register = (site) => {
    const seen = all.findIndex((s) => s.id === site.id)
    if (seen < 0) all.push(site)
    else all[seen] = site
    return site
  }

  // L'origine entière, jamais un fragment de domaine : un hôte qui contient
  // celui d'un site lui ressemble sans en être un.
  const at = (origin) => all.find((s) => s.origins.includes(origin)) || null

  return { register, at, all: () => all, current: () => at((globalThis.location || {}).origin) }
})()

if (typeof module !== 'undefined') module.exports = ADS.sites
