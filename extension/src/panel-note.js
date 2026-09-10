globalThis.ADS = globalThis.ADS || {}

// La phrase sous la courbe. Elle ne s'écrit que si la fenêtre du site laisse un
// changement de prix dehors : rien de caché, rien à dire. Et elle se compose
// des points relevés — une phrase écrite d'avance finirait par mentir le jour
// où le prix bougerait autrement.
ADS.note = (() => {
  const COUNT = ['aucune', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix']
  const spell = (n) => COUNT[n] || String(n)

  // Le genre suit le mot : « aucune des deux baisses », « aucun des deux
  // changements de prix ». Le français ne pardonne pas l'accord approximatif.
  const KIND = {
    down: { many: 'baisses', none: 'Aucune', only: 'une seule', alone: 'La seule baisse observée' },
    up: { many: 'hausses', none: 'Aucune', only: 'une seule', alone: 'La seule hausse observée' },
    mixed: {
      many: 'changements de prix', none: 'Aucun',
      only: 'un seul', alone: 'Le seul changement de prix observé',
    },
  }

  const kind = (moves) =>
    moves.every((m) => m.down) ? KIND.down : moves.every((m) => !m.down) ? KIND.up : KIND.mixed

  const moves = (m) =>
    m.points
      .map((p, i) => (i && p.change ? { x: p.x, down: p.price < m.points[i - 1].price } : null))
      .filter(Boolean)

  const window_ = (m) => {
    if (!m.band) return null
    const all = moves(m)
    if (!all.length) return null
    const seen = all.filter((p) => p.x >= m.band.x).length
    if (seen >= all.length) return null
    const word = kind(all)
    const days = m.band.days
    if (all.length === 1) return `${word.alone} tombe hors des ${days} jours affichés.`
    if (!seen) return `${word.none} des ${spell(all.length)} ${word.many} n'apparaît dans les ${days} jours affichés.`
    const which = seen === 1 ? word.only : `${spell(seen)} seulement`
    const verb = seen === 1 ? 'est visible' : 'sont visibles'
    return `Dans les ${days} jours affichés, ${which} des ${spell(all.length)} ${word.many} ${verb}.`
  }

  return { window: window_ }
})()

if (typeof module !== 'undefined') module.exports = ADS.note
