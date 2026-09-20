globalThis.ADS = globalThis.ADS || {}

// Où les libellés du tracé tiennent, et lequel cède quand la place manque. Les
// boîtes se calculent en pixels d'écran, parce que le tracé se dessine à
// l'échelle 1 : une colonne étroite en refuse donc davantage, ce qui est
// exactement ce qu'on veut — un libellé recouvert ne se lit pas mieux qu'un
// libellé absent.
ADS.marks = (() => {
  // Une fonte à chasse variable n'a pas de largeur exacte, mais son avance
  // moyenne suffit à savoir si deux libellés se marchent dessus.
  const ADVANCE = 0.62
  // L'air autour d'un texte : deux boîtes qui se touchent se disputent déjà.
  const PAD = 3
  // L'encre sous la ligne de base — jambages compris — ne vaut qu'une fraction
  // du corps, alors qu'elle monte d'un corps entier au-dessus.
  const DROP = 0.3

  const box = ({ x, y, text, size, anchor }) => {
    const w = text.length * size * ADVANCE
    const left = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x
    return { x1: left - PAD, x2: left + w + PAD, y1: y - size, y2: y + size * DROP }
  }

  const clash = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2

  // Le premier venu prend sa place, les suivants prennent ce qui reste — et
  // rien s'il ne reste rien. L'ordre dit donc ce qui est dû : les deux bornes
  // de l'axe passent avant les dates de changement.
  const fits = (taken, mark) => {
    const at = box(mark)
    if (taken.some((t) => clash(t, at))) return false
    taken.push(at)
    return true
  }

  return { box, clash, fits }
})()

if (typeof module !== 'undefined') module.exports = ADS.marks
