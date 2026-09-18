// Le minimum pour construire du DOM sans gabarit ni chaîne de caractères : le
// texte passe par `textContent`, donc rien de ce que l'API renvoie ne peut
// devenir du balisage.

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag)
  for (const [name, value] of Object.entries(props)) {
    if (value == null || value === false) continue
    if (name === 'text') node.textContent = value
    else if (name === 'class') node.className = value
    else if (name.startsWith('on')) node.addEventListener(name.slice(2), value)
    else node.setAttribute(name, value === true ? '' : String(value))
  }
  for (const child of [].concat(children)) {
    if (child) node.append(child)
  }
  return node
}

export function clear(node) {
  node.replaceChildren()
  return node
}

// Un lien vers la fiche du site source : nouvel onglet, et jamais d'accès à
// notre fenêtre depuis la page ouverte.
export function outLink(href, label) {
  return el('a', {
    class: 'lien-sortant', href, target: '_blank', rel: 'noopener', text: label,
  })
}
