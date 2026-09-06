globalThis.ADS = globalThis.ADS || {}

// La signature de la fenêtre : le prix tracé sur toute la vie de l'annonce, de
// la mise en ligne à aujourd'hui. C'est la durée qui est le sujet — le prix
// n'est que ce qu'on trace dessus.
//
// Le modèle ne connaît ni pixels ni SVG : il rend des fractions d'axe, et le
// tracé les met à l'échelle. Il ne connaît pas non plus les sites : ce que la
// page affiche de son côté lui arrive en jours, comptés par le site.
ADS.curve = (() => {
  const DAY = 86400000
  const when = (v) => (v instanceof Date ? v : new Date(v))
  const clamp = (v) => Math.min(1, Math.max(0, v))

  const day = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  const stamp = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

  // Ce que le suivi mutualisé a écrit, sinon la seule observation dont la
  // fenêtre dispose : le prix que la page vient de montrer. Une annonce
  // découverte du jour n'a pas d'historique, et une ligne plate inventée
  // mentirait sur ce qu'on sait — mieux vaut un point et beaucoup de hachure.
  const observed = ({ history, price, firstSeen, now }) => {
    if (history && history.length) {
      return history.map((p) => ({ at: when(p.at), price: p.price, change: !p.confirmation }))
    }
    return price == null ? [] : [{ at: when(firstSeen || now), price, change: true }]
  }

  const plot = ({ publishedAt, now, firstSeen = null, price = null, history = [], claimDays = null }) => {
    const to = when(now).getTime()
    // Une mise en ligne postérieure à l'instant présent n'existe pas, mais une
    // page peut l'affirmer : l'axe ne se retourne pas pour autant.
    const from = Math.min(when(publishedAt).getTime(), to)
    // Le jour est la plus petite durée que l'affichage sait montrer : sans ce
    // plancher, une annonce mise en ligne à l'instant donnerait un axe nul.
    const span = Math.max(to - from, DAY)
    const x = (t) => clamp((t - from) / span)

    const points = observed({ history, price, firstSeen, now }).sort((a, b) => a.at - b.at)
    const prices = points.map((p) => p.price)
    const min = points.length ? Math.min(...prices) : null
    const max = points.length ? Math.max(...prices) : null
    // Un prix qui n'a jamais bougé n'a ni haut ni bas à montrer : la ligne se
    // pose au milieu plutôt qu'au ras d'un bord, où elle passerait pour un
    // plancher atteint.
    const y = (v) => (max === min ? 0.5 : (v - min) / (max - min))

    const first = points.length ? points[0].at.getTime() : to
    // La hachure porte une date, jamais un mot seul : « aucune observation »
    // laisserait croire à un trou quelconque, la date dit lequel.
    const blind =
      first - from >= DAY
        ? {
            x: 0, w: x(first), until: new Date(first),
            text: `aucune observation avant le ${day(new Date(first))}`,
          }
        : null

    // La bande rouge : ce que le site montre de son côté, et rien d'autre. Elle
    // ne peut pas déborder de la vie de l'annonce.
    const w = claimDays == null ? null : clamp((claimDays * DAY) / span)
    const band = w == null ? null : { x: 1 - w, w, days: claimDays }

    return {
      from: new Date(from),
      to: new Date(to),
      days: Math.round(span / DAY),
      axis: { start: stamp(new Date(from)), end: 'auj.' },
      points: points.map((p) => ({
        x: x(p.at.getTime()), y: y(p.price), price: p.price, at: p.at, change: p.change,
      })),
      blind, band, min, max,
    }
  }

  return { plot }
})()

if (typeof module !== 'undefined') module.exports = ADS.curve
