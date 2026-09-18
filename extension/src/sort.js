globalThis.ADS = globalThis.ADS || {}

// La barre posée en tête des résultats : trier et filtrer par ancienneté. Elle ne
// travaille que sur ce que la page a déjà chargé — aucune autre page n'est
// demandée, rien n'est requis du site, et la barre l'écrit pour que le compte
// affiché ne passe jamais pour celui de la recherche entière.
ADS.sort = (() => {
  const site = ADS.sites.current() || {}
  const { read, arrange, sift, oldest } = ADS.order

  // L'ordre du site, retenu à la première lecture : c'est lui que le second clic
  // rétablit. Les cartes arrivées depuis — lazy-load — s'ajoutent au bout, là où
  // le site les a mises.
  let known = []
  let sorted = false
  let floor = 0
  let bar = null
  let note = null
  let said = ''
  const keys = []

  const el = (tag, cls, text) => {
    const n = document.createElement(tag)
    n.className = cls
    if (text) n.textContent = text
    return n
  }

  // Chaque bouton dit son état plutôt que de le garder pour lui : `aria-pressed`
  // est ce qu'un lecteur d'écran lira, et ce que la feuille de style colore.
  const key = (label, on, press) => {
    const node = el('button', 'adscope-bar-key', label)
    node.setAttribute('type', 'button')
    node.addEventListener('click', () => {
      press()
      sync()
    })
    keys.push({ node, on })
    return node
  }

  const paint = () => {
    for (const k of keys) k.node.setAttribute('aria-pressed', String(k.on()))
  }

  const build = () => {
    bar = el('div', 'adscope-bar')
    const level = (n) => () => {
      floor = floor === n ? 0 : n
    }
    bar.append(
      el('span', 'adscope-bar-mark', 'adscope'),
      key('Trier par ancienneté', () => sorted, () => (sorted = !sorted)),
      key('≥ 30 j', () => floor === 30, level(30)),
      key('≥ 90 j', () => floor === 90, level(90)),
      (note = el('span', 'adscope-bar-note', '')),
    )
  }

  // Le périmètre, écrit noir sur blanc : ce qui est trié et filtré est la page
  // sous les yeux, pas les 9 541 résultats que le site annonce plus haut.
  const scope = (n) => `sur ${n > 1 ? `les ${n} annonces` : "l'annonce"} de cette page`

  const mount = (root, n) => {
    if (!bar) build()
    if (!bar.parentElement) root.parentElement.insertBefore(bar, root)
    // Réécrit seulement quand il change : l'observateur de listing.js rappelle
    // ce code à chaque lot de mutations, et une écriture identique en serait un.
    const say = scope(n)
    if (say !== said) note.textContent = (said = say)
    paint()
  }

  // Relit la page et réapplique l'état courant. Appelée par listing.js après
  // chaque rendu : c'est ainsi qu'une carte arrivée en lazy-load prend son rang
  // sans qu'on ait rien redemandé.
  const sync = () => {
    // La même règle que le diagnostic : l'identifiant dans l'adresse fait la
    // fiche, son absence les résultats. Les annonces similaires d'une fiche ne
    // sont pas une page de résultats, et n'appellent pas de barre.
    if (ADS.diag.urlId(location.pathname)) return
    const root = site.list ? site.list(document) : null
    if (!root || !root.parentElement) return
    const found = read(root)
    if (!found.length) return
    const live = new Set(found.map((f) => f.node))
    const held = new Set(known)
    known = known.filter((n) => live.has(n))
    for (const f of found) if (!held.has(f.node)) known.push(f.node)
    mount(root, found.length)
    const days = new Map(found.map((f) => [f.node, f.days]))
    arrange(root, found.map((f) => f.node), sorted ? oldest(known, days) : known)
    sift(found, floor)
  }

  return { sync }
})()

if (typeof module !== 'undefined') module.exports = ADS.sort
