globalThis.ADS = globalThis.ADS || {}

// Outils de lecture de page, communs aux modules de site — ils n'en nomment
// aucun. Deux gestes reviennent : retrouver le libellé qu'une page affiche, et
// extraire les objets JSON que ses scripts en ligne transportent.
ADS.read = (() => {
  // Le libellé d'ancienneté : un nœud feuille dont le texte répond au motif du
  // site. Les classes portent des hachages régénérés à chaque build ; le texte
  // est le seul repère qui tienne. `skip` écarte le panneau posé par
  // l'extension, qui cite lui-même cette date et se relirait sinon.
  const leaf = (doc, pattern, skip) => {
    for (const n of doc.querySelectorAll('p, span, div, time')) {
      if (n.children.length) continue
      const text = (n.textContent || '').trim()
      if (pattern.test(text) && !(skip && n.closest && n.closest(skip))) return n
    }
    return null
  }

  // L'objet qui suit un `=` dans un script en ligne, découpé en comptant les
  // accolades hors chaîne — `var X = {…}` n'est pas du JSON, seul son objet l'est.
  const object = (text, from) => {
    let depth = 0
    let str = false
    for (let i = from; i < text.length; i++) {
      const c = text[i]
      if (str) {
        if (c === '\\') i++
        else if (c === '"') str = false
      } else if (c === '"') str = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) return text.slice(from, i + 1)
    }
    return null
  }

  const parse = (s) => {
    try {
      return JSON.parse(s)
    } catch {
      return null
    }
  }

  const ASSIGNMENT = /(?:^|[;\n])\s*(?:var|let|const)?\s*[\w.$]+\s*=\s*(?=\{)/gm

  // Un script peut être un document JSON entier — le JSON-LD — ou porter des
  // affectations au milieu de code : les deux sont tentés, ce qui ne se parse
  // pas est laissé.
  const blobs = (text) => {
    const out = []
    for (const m of text.matchAll(ASSIGNMENT)) {
      const found = parse(object(text, m.index + m[0].length))
      if (found) out.push(found)
    }
    const whole = parse(text)
    return whole ? [whole, ...out] : out
  }

  // Où poser le panneau. Un site rend un endroit — le parent, et le nœud devant
  // lequel insérer —, jamais un simple voisin : en tête d'une colonne il n'y a
  // personne derrière qui servirait de repère, et `insertBefore(n, null)`
  // ajoute au bout. Un nœud absent rend `null`, et l'appelant essaie l'ancre
  // suivante.
  const after = (node) => (node && node.parentElement ? { parent: node.parentElement, before: node.nextSibling } : null)
  const before = (node) => (node && node.parentElement ? { parent: node.parentElement, before: node } : null)
  const head = (node) => (node ? { parent: node, before: node.children[0] || null } : null)

  // Tous les nœuds d'un arbre qui répondent à un test, sans descendre dans ceux
  // qui y répondent déjà.
  const collect = (node, hit, out = [], depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 12) return out
    if (hit(node)) return out.push(node), out
    for (const v of Array.isArray(node) ? node : Object.values(node)) collect(v, hit, out, depth + 1)
    return out
  }

  return { leaf, blobs, collect, after, before, head }
})()

if (typeof module !== 'undefined') module.exports = ADS.read
