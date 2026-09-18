globalThis.ADS = globalThis.ADS || {}

// Les cartes d'une page de résultats vues comme des emplacements : les relire, les
// ranger autrement, en masquer. Rien ici ne calcule d'ancienneté — elle arrive
// déjà faite, écrite sur la pastille que listing.js vient de poser.
ADS.order = (() => {
  const MARK = 'data-adscope'
  const DAYS = 'data-adscope-days'
  const HIDDEN = 'data-adscope-hidden'

  // La carte est l'enfant direct du conteneur qui porte la pastille : c'est ce
  // rang-là que le site range et que le tri déplace. Y remonter depuis la
  // pastille évite d'ancrer sur la classe de la carte, hachée à chaque build.
  const slot = (node, root) => {
    let n = node
    while (n && n.parentElement !== root) n = n.parentElement
    return n
  }

  // L'âge ne se recalcule pas : il se lit là où il est déjà écrit. Une annonce
  // sans date n'en porte pas, et n'en recevra pas d'inventé.
  const read = (root) => {
    const out = []
    const seen = new Set()
    for (const badge of root.querySelectorAll(`[${MARK}]`)) {
      const node = slot(badge, root)
      if (!node || seen.has(node)) continue
      seen.add(node)
      const days = badge.getAttribute(DAYS)
      out.push({ node, days: days === null ? null : Number(days) })
    }
    return out
  }

  // Les cartes reprennent les emplacements qu'elles occupent déjà : ce qui les
  // sépare — l'encart publicitaire glissé entre deux annonces sur la page
  // relevée — ne change pas de rang. Les repères ne vivent que le temps de
  // l'échange, et rien du site n'est retiré du document.
  const arrange = (root, slots, want) => {
    if (want.length === slots.length && want.every((n, i) => n === slots[i])) return false
    const marks = slots.map((n) => {
      const m = document.createElement('span')
      root.insertBefore(m, n)
      return m
    })
    want.forEach((n, i) => root.insertBefore(n, marks[i]))
    for (const m of marks) root.removeChild(m)
    return true
  }

  // Masquer, jamais retirer : le filtre est réversible, et une carte sortie du
  // document perdrait sa pastille, son rang et le suivi qui va avec.
  const sift = (found, floor) => {
    for (const { node, days } of found) {
      if (floor && !(days >= floor)) node.setAttribute(HIDDEN, '')
      else node.removeAttribute(HIDDEN)
    }
  }

  // Les plus anciennes d'abord. Sans date il n'y a pas d'ancienneté à faire
  // valoir : la carte va au bout plutôt qu'en tête. `sort` est stable — à âge
  // égal, l'ordre du site tient.
  const oldest = (nodes, days) =>
    [...nodes].sort((a, b) => (days.get(b) == null ? -1 : days.get(b)) - (days.get(a) == null ? -1 : days.get(a)))

  return { read, arrange, sift, oldest, DAYS, HIDDEN }
})()

if (typeof module !== 'undefined') module.exports = ADS.order
