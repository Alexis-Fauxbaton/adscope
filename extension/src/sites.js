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

  // Le conteneur des cartes d'une page de résultats, déduit de ce que le site
  // déclare de ses cartes : `cards` est la prise sur une carte — un attribut que
  // le site écrit lui-même, jamais une classe que son empaqueteur régénère à
  // chaque build —, `wrap` le bloc qui l'entoure quand la prise est posée
  // dedans. Leur parent commun est le conteneur : aucun site n'a à le nommer, et
  // ce qui le partage sans être une carte — un emplacement publicitaire — n'y
  // est pas compté et n'en bouge pas.
  const list = (site) => (doc) => {
    const found = site.cards ? doc.querySelector(site.cards) : null
    const card = found && site.wrap ? found.closest(site.wrap) : found
    return (card && card.parentElement) || null
  }

  // Rechargé — les tests le font entre deux mondes —, un site remplace sa
  // déclaration au lieu de la doubler.
  const register = (site) => {
    site.list = list(site)
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
