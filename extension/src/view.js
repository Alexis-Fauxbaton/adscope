globalThis.ADS = globalThis.ADS || {}

// Compose les libellés affichés. Deux origines qui ne se mélangent jamais :
// `s` vient de la page ouverte, `r` du suivi mutualisé renvoyé par l'API.
ADS.view = (() => {
  const { duration, ago, money } = ADS.format

  // L'API pose un point par semaine sur les annonces qu'elle revoit. Au delà
  // d'une semaine et un jour de battement, l'intervalle n'en est plus une : le
  // prix a été perdu de vue, et il a pu bouger et revenir sans témoin.
  const CHECKED_MAX_DAYS = 8

  // Ce qui frappe d'abord est la durée : c'est elle qui décide, la
  // réactualisation n'est qu'un aggravant. « Encore » n'a de sens que sur une
  // annonce déjà ancienne — c'est exactement le cas de l'alerte.
  const age = (s) =>
    s.bumped
      ? `${duration(s.onlineDays)} en ligne · ⟳ ${s.notable ? 'encore ' : ''}réactualisée ${ago(s.bumpedDaysAgo)}`
      : `${duration(s.onlineDays)} en ligne`

  // Une baisse de prix n'est lisible nulle part sur la page : elle suppose
  // d'avoir vu l'annonce avant.
  const drop = (r) => {
    if (!r || !(r.price_delta_since_first < 0)) return null
    const days = r.price_delta_days_since_first
    const amount = `▼ −${money(r.price_delta_since_first)}`
    return days ? `${amount} en ${duration(days)}` : amount
  }

  // Deux fragments, jamais concaténés : `page` se lit sur l'annonce ouverte,
  // `tracked` n'existe que parce que l'annonce a déjà été vue avant.
  const badge = (s, r) => ({ page: age(s), tracked: drop(r) })

  // « Stable depuis deux mois » ne vaut que ce que valent les observations qui
  // l'ont vu : vérifié chaque semaine, c'est un fait sur le vendeur ; jamais
  // revérifié, ce n'est qu'un aveu sur notre suivi. La ligne dit lequel des
  // deux. Sans les deux nombres — un signal d'avant l'échantillonnage, gardé
  // en cache —, elle n'affirme rien.
  const checked = (r) => {
    if (r.price_gap_days == null || r.stable_days < CHECKED_MAX_DAYS) return ''
    if (!r.price_checks) return ' · jamais revérifié'
    if (r.price_gap_days <= CHECKED_MAX_DAYS) return ' · vérifié chaque semaine'
    return ` · non vérifié pendant ${duration(r.price_gap_days)}`
  }

  const tracking = (r) => {
    const rows = []
    if (!r) return rows
    if (r.tracked_days != null) {
      const views = r.observations ? ` · ${r.observations} vue${r.observations > 1 ? 's' : ''}` : ''
      rows.push({ label: 'Suivie depuis', value: duration(r.tracked_days) + views })
    }
    const fall = drop(r)
    if (fall) rows.push({ label: 'Prix', value: `${money(r.price)}  ${fall}`, strong: true })
    else if (r.stable_days != null) {
      rows.push({ label: 'Prix', value: `stable depuis ${duration(r.stable_days)}${checked(r)}` })
    }
    return rows
  }

  // La contradiction, nommée : le site montre une date d'indexation là où le
  // lecteur comprend une date de mise en ligne.
  const claim = (s, displayed) =>
    s.bumped && displayed
      ? { label: 'leboncoin affiche', says: displayed, note: 'date de réactualisation, pas de publication' }
      : null

  // Même hiérarchie que la pastille : la durée porte le poids dès qu'elle est le
  // sujet — ancienne et poussée, ou ancienne et dormante — et la réactualisation
  // reste une ligne ordinaire.
  const panel = (listing, s, r, displayed) => ({
    page: [
      { label: 'En ligne depuis', value: duration(s.onlineDays), strong: s.notable || s.dormant },
      ...(s.bumped ? [{ label: 'Réactualisée', value: ago(s.bumpedDaysAgo) }] : []),
      { label: 'Vendeur', value: listing.sellerType === 'pro' ? 'professionnel' : 'particulier' },
    ],
    claim: claim(s, displayed),
    tracked: tracking(r),
  })

  return { badge, panel, drop }
})()

if (typeof module !== 'undefined') module.exports = ADS.view
