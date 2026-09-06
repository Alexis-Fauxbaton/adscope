globalThis.ADS = globalThis.ADS || {}

// La surface principale sur une fiche : l'annonce, son ancienneté réelle en
// sujet, sa courbe, ce que le site affiche de son côté, et le suivi mutualisé.
// Rien n'est calculé ici — le content script a lu la page, l'API a tenu le
// relevé ; cette fenêtre n'est qu'un constat posé sur la table.
ADS.fiche = (() => {
  const { el, tag, row, fill } = ADS.dom
  const { money, number } = ADS.format

  // L'ancienneté est le sujet de la fenêtre : elle se dit sans arrondi grossier.
  // La pastille peut abréger en « 4 ans » — elle alerte, elle n'argumente pas ;
  // ici « 4 ans 11 mois » et « 4 ans » ne décrivent pas le même stock.
  const spell = (n) => {
    if (n < 31) return `${n} j`
    const years = Math.floor(n / 365)
    const months = Math.floor((n - years * 365) / 30)
    return [years && `${years} an${years > 1 ? 's' : ''}`, months && `${months} mois`]
      .filter(Boolean).join(' ') || `${n} j`
  }

  // En jours, toujours, pour tout ce qui se compare : « 1 mois » couvrirait de
  // 31 à 60 jours, et c'est précisément l'écart qu'on discute.
  const days = (n) => `${number(n)} j`

  const stamp = (v) =>
    new Date(v).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

  // Le type de vendeur ferme la ligne : pour un particulier, aucun bloc de
  // statistiques ne suivra, et rien d'autre ne le dirait.
  const specs = (c) =>
    [
      c.price == null ? null : money(c.price),
      c.mileage == null ? null : `${number(c.mileage)} km`,
      c.year == null ? null : String(c.year),
      c.sellerType === 'pro' ? 'professionnel' : 'particulier',
    ].filter(Boolean).join(' · ')

  // Ce que valent les observations qui portent la courbe : depuis quand on
  // regarde, combien de fois, et quand pour la dernière. « Stable depuis deux
  // mois » ne dit rien sans elles.
  const tracking = (r) => {
    if (!r) return []
    const rows = []
    if (r.tracked_days != null) {
      const views = r.observations ? ` · ${r.observations} vue${r.observations > 1 ? 's' : ''}` : ''
      rows.push({ label: 'Suivie depuis', value: days(r.tracked_days) + views })
    }
    if (r.last_seen) rows.push({ label: 'Dernière vérification', value: stamp(r.last_seen) })
    if (r.stable_days != null) rows.push({ label: 'Prix stable depuis', value: days(r.stable_days) })
    return rows
  }

  // La contradiction est celle que le site nomme : la fenêtre ne fait que la
  // rattacher à la bande rouge, qu'aucune légende n'expliquerait autrement.
  const claim = (c) => {
    if (!c.claim) return []
    const head = tag('div', 'claim-head')
    head.append(tag('span', 'claim-label', c.claim.label), tag('span', 'claim-says', `« ${c.claim.says} »`))
    return [head, tag('p', 'claim-note', `${c.claim.note} — c'est la bande rouge. Le reste de l'axe, le site ne le montre pas.`)]
  }

  // Le survol est une affaire de souris : au clavier, aucun point de la courbe
  // ne serait atteignable. Le relevé dit les mêmes valeurs en toutes lettres,
  // replié pour ne pas encombrer, et la tabulation l'ouvre.
  const observation = (p) => ({
    label: new Date(p.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    value: money(p.price),
    mark: p.change ? 'changement' : 'vérification',
  })

  const hover = (p) => {
    el('readout').textContent = p
      ? `${new Date(p.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} · ${money(p.price)}`
      : ''
  }

  const show = (card, signals, now = new Date()) => {
    el('fiche-title').textContent = card.title || 'Annonce'
    el('fiche-specs').textContent = specs(card)
    // La durée d'abord, en clair ; le compte de jours à côté, pour qu'on puisse
    // le citer. « 4 ans 11 mois » se retient, « 1 810 j » se vérifie. Et quand
    // aucune date ne porte cet âge, la fenêtre refuse de l'épeler : elle le dit
    // en petit et se tait, comme la courbe se contente de hachure.
    const undated = card.onlineDays == null
    el('age').className = undated ? 'age age--undated' : 'age'
    el('age-main').textContent = undated ? 'date absente de la page' : spell(card.onlineDays)
    el('age-days').textContent = undated ? '' : `${number(card.onlineDays)} j`
    el('age-days').hidden = undated

    const model = ADS.curve.plot({
      // Sans mise en ligne, l'axe part de la première observation : la prendre
      // à aujourd'hui écraserait sur un seul jour tout ce qu'on a vu avant.
      publishedAt: card.publishedAt || (signals && signals.first_seen) || now,
      now,
      firstSeen: signals && signals.first_seen,
      price: card.price,
      history: (signals && signals.price_history) || [],
      claimDays: card.claim ? card.claim.days : null,
    })
    el('plot').replaceChildren(ADS.chart.draw(model, hover))
    el('axis-start').textContent = model.axis.start
    el('axis-end').textContent = model.axis.end
    el('readout').textContent = ''

    // La phrase datée de la hachure ne se négocie pas : elle a sa ligne sous
    // l'axe, large ou étroite, où aucun montant ne vient s'écrire par-dessus.
    el('hatch').textContent = model.blind ? model.blind.text : ''
    el('hatch').hidden = !model.blind
    fill('points-rows', model.points.map((p) => row(observation(p))))
    el('points').hidden = !model.points.length
    fill('claim', claim(card))
    // Le suivi mutualisé, nommé : ce qui suit ne se lit pas sur la page, il ne
    // vient que de nous être vu plusieurs fois.
    const seen = tracking(signals)
    fill('tracking', seen.length ? [tag('p', 'label', 'Suivi adscope'), ...seen.map(row)] : [])
    el('fiche').hidden = false
  }

  return { show, specs, tracking }
})()

if (typeof module !== 'undefined') module.exports = ADS.fiche
