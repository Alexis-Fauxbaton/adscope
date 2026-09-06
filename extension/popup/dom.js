globalThis.ADS = globalThis.ADS || {}

// Les gestes que toutes les surfaces de la fenêtre partagent. Aucun ne construit
// de balisage : la fenêtre affiche du texte tiré de pages tierces, et un titre
// d'annonce est écrit par un inconnu.
ADS.dom = (() => {
  const el = (id) => document.getElementById(id)

  const tag = (name, cls, text) => {
    const node = document.createElement(name)
    if (cls) node.className = cls
    if (text != null) node.textContent = text
    return node
  }

  // La ligne étiquette/valeur, commune au vendeur, au résumé et au diagnostic.
  // `mark` porte la réserve — une coche, un « ≈ » — sans peser sur la valeur.
  const row = ({ label, value, bad, mark }) => {
    const line = tag('div', 'row')
    const right = tag('span', bad ? 'bad' : '', value)
    if (mark) right.append(tag('span', 'mark', ` ${mark.trim()}`))
    line.append(tag('span', '', label), right)
    return line
  }

  const hint = (text, bad) => tag('div', 'hint' + (bad ? ' bad' : ''), text)

  // Montrer ou cacher une section, et la remplir d'un coup : une section vide
  // laissée visible ferait croire à une panne.
  const fill = (id, nodes) => {
    const box = el(id)
    box.replaceChildren(...nodes)
    box.hidden = !nodes.length
    return box
  }

  return { el, tag, row, hint, fill }
})()

if (typeof module !== 'undefined') module.exports = ADS.dom
