globalThis.ADS = globalThis.ADS || {}

// Où poser les montants de la courbe, et lequel céder quand la place manque.
// Sur une fiche plafonnée — hachure longue à gauche, observations tassées à
// droite — trois textes se disputaient la même bande. La phrase de la hachure
// est descendue sous l'axe, où rien ne vient s'écrire par-dessus ; des deux
// montants qui restent, le dernier prix est dû, le premier cède au relevé qui
// l'énonce déjà en toutes lettres.
ADS.labels = (() => {
  // Une chasse fixe avance de 0,6 cadratin par caractère, et la courbe se rend
  // à l'échelle 1 : la largeur d'un montant se calcule, elle ne se mesure pas.
  // Mesuré au navigateur sur la fonte du système ; le cran de plus couvre une
  // substitution qui ne serait pas exactement celle-là.
  const ADVANCE = 0.62
  // L'encre au-dessus de la ligne de base et en dessous, liseré de papier
  // compris : c'est l'étendue peinte qui se dispute la place, pas la lettre.
  // Mesuré au navigateur : 0,78 et 0,24 pour l'œil, un cran et demi de plus de
  // chaque côté pour le détourage.
  const RISE = 0.92
  const DROP = 0.26
  // L'air autour d'un texte : deux boîtes qui se touchent se disputent déjà.
  const PAD = 3
  // Le décalage au point : le texte s'écarte du signe qu'il nomme sans le
  // quitter, d'un côté ou de l'autre selon le sens de lecture.
  const AWAY = 8
  const BACK = 6
  // Les deux couloirs : au-dessus de la bande de prix, en dessous. Le montant
  // se pose du côté où il reste de la place — sous un point bas, au-dessus
  // d'un point haut — sinon il vient s'écrire sur la marche voisine.
  const OVER = 8
  const UNDER = 13

  // Les corps, tenus ici et repris tels quels par la feuille de style : une
  // boîte se calcule sur le corps réel, jamais sur celui qu'on suppose.
  const SIZE = { amount: 11 }
  const body = (cls) => SIZE[String(cls).split(' ')[0]]

  const span = ({ text, cls }) => text.length * body(cls) * ADVANCE

  // La boîte d'un texte posé, air compris. La chasse fixe la donne exactement,
  // ce qui permet de la vérifier sans navigateur.
  const box = ({ text, cls, x, y }) => {
    const size = body(cls)
    return {
      x1: x - PAD, x2: x + span({ text, cls }) + PAD,
      y1: y - size * RISE, y2: y + size * DROP,
    }
  }

  const clash = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2

  // Un montant à demi sorti du cadre ne se lit pas mieux qu'un montant
  // recouvert : le texte rentre, quitte à s'éloigner un peu de son point.
  const seat = (mark, width) => {
    const w = span(mark)
    const wanted = mark.start ? mark.cx + AWAY : mark.cx - BACK - w
    return {
      text: mark.text, cls: mark.cls,
      x: Math.max(PAD, Math.min(wanted, width - PAD - w)),
      y: mark.cy + (mark.low ? UNDER : -OVER),
    }
  }

  // Le premier venu prend sa place, les suivants prennent ce qui reste — et
  // rien s'il ne reste rien. L'ordre dit donc ce qui est dû : le dernier prix
  // passe avant celui d'origine, que le relevé porte de toute façon.
  const place = (marks, width) => {
    const taken = []
    const kept = []
    for (const mark of marks) {
      const spot = seat(mark, width)
      const at = box(spot)
      if (taken.some((t) => clash(t, at))) continue
      taken.push(at)
      kept.push(spot)
    }
    return kept
  }

  return { place, box, clash, SIZE }
})()

if (typeof module !== 'undefined') module.exports = ADS.labels
