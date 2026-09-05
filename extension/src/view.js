globalThis.ADS = globalThis.ADS || {}

// Compose les libellés affichés. Deux origines qui ne se mélangent jamais :
// `s` vient de la page ouverte, `r` du suivi mutualisé renvoyé par l'API.
ADS.view = (() => {
  const { duration, ago, money } = ADS.format

  const age = (s) =>
    s.bumped
      ? `⟳ réactualisée ${ago(s.bumpedDaysAgo)} · en ligne depuis ${duration(s.onlineDays)}`
      : `en ligne depuis ${duration(s.onlineDays)}`

  // Une baisse de prix n'est lisible nulle part sur la page : elle suppose
  // d'avoir vu l'annonce avant.
  const drop = (r) => {
    if (!r || !(r.price_delta_since_first < 0)) return null
    const days = r.price_delta_days_since_first
    const amount = `▼ −${money(r.price_delta_since_first)}`
    return days ? `${amount} en ${duration(days)}` : amount
  }

  const badge = (listing, s, r) => [age(s), drop(r)].filter(Boolean).join(' · ')

  const tracking = (r) => {
    const rows = []
    if (!r) return rows
    if (r.tracked_days != null) {
      const views = r.observations ? ` · ${r.observations} vue${r.observations > 1 ? 's' : ''}` : ''
      rows.push({ label: 'Suivie depuis', value: duration(r.tracked_days) + views })
    }
    const fall = drop(r)
    if (fall) rows.push({ label: 'Prix', value: `${money(r.price)}  ${fall}`, strong: true })
    else if (r.stable_days != null) rows.push({ label: 'Prix', value: `stable depuis ${duration(r.stable_days)}` })
    return rows
  }

  // La contradiction, nommée : le site montre une date d'indexation là où le
  // lecteur comprend une date de mise en ligne.
  const claim = (s, displayed) =>
    s.bumped && displayed
      ? { label: 'leboncoin affiche', says: displayed, note: 'date de réactualisation, pas de publication' }
      : null

  const panel = (listing, s, r, displayed) => ({
    page: [
      { label: 'En ligne depuis', value: duration(s.onlineDays), strong: s.bumped },
      ...(s.bumped ? [{ label: 'Réactualisée', value: ago(s.bumpedDaysAgo), strong: true }] : []),
      { label: 'Vendeur', value: listing.sellerType === 'pro' ? 'professionnel' : 'particulier' },
    ],
    claim: claim(s, displayed),
    tracked: tracking(r),
  })

  return { badge, panel, drop }
})()

if (typeof module !== 'undefined') module.exports = ADS.view
