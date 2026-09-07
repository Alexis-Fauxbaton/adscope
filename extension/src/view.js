globalThis.ADS = globalThis.ADS || {}

// Compose les libellés affichés. Deux origines qui ne se mélangent jamais :
// `s` vient de la page ouverte, `r` du suivi mutualisé renvoyé par l'API.
ADS.view = (() => {
  const { duration, ago, money } = ADS.format

  // Les seuils se lisent sur `price_gap_days`, mesuré sur la série complète —
  // l'API pose un point par jour sur les annonces qu'elle revoit, même si elle
  // n'en sert qu'un par semaine. Au delà d'une semaine et un jour de battement,
  // l'intervalle n'est plus une cadence : le prix a été perdu de vue, et il a
  // pu bouger et revenir sans témoin. En deçà d'un jour, il a été vu chaque
  // jour, et le dire est plus fort que « chaque semaine » — c'est le nombre
  // qui le décide, plus la cadence d'écriture qui le plafonnait à sept.
  const CHECKED_MAX_DAYS = 8
  const DAILY_MAX_DAYS = 1

  // Une annonce dont la charge ne porte aucune date n'a pas d'âge à énoncer. Le
  // dire est le constat ; en fabriquer un serait exactement ce que le produit
  // combat — un nombre faux, énoncé avec autorité.
  const UNDATED = 'date absente de la page'

  // Ce qui frappe d'abord est la durée : c'est elle qui décide, la mise à jour
  // n'est qu'un aggravant. Ce que cette mise à jour atteste, en revanche, dépend
  // du site : lui seul fournit le mot.
  const age = (s, site) => {
    if (s.onlineDays == null) return UNDATED
    return s.bumped
      ? `${duration(s.onlineDays)} en ligne · ⟳ ${site.words.bump(s)} ${ago(s.bumpedDaysAgo)}`
      : `${duration(s.onlineDays)} en ligne`
  }

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
  const badge = (s, r, site = ADS.sites.current()) => ({ page: age(s, site), tracked: drop(r) })

  // « Stable depuis deux mois » ne vaut que ce que valent les observations qui
  // l'ont vu : vérifié chaque semaine, c'est un fait sur le vendeur ; jamais
  // revérifié, ce n'est qu'un aveu sur notre suivi. La ligne dit lequel des
  // deux. Sans les deux nombres — un signal d'avant l'échantillonnage, gardé
  // en cache —, elle n'affirme rien.
  const checked = (r) => {
    if (r.price_gap_days == null || r.stable_days < CHECKED_MAX_DAYS) return ''
    if (!r.price_checks) return ' · jamais revérifié'
    if (r.price_gap_days <= DAILY_MAX_DAYS) return ' · vérifié chaque jour'
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

  // Même hiérarchie que la pastille : la durée porte le poids dès qu'elle est le
  // sujet, et la mise à jour reste une ligne ordinaire. Les mots et la
  // contradiction, eux, viennent du site — ce que sa date de mise à jour atteste
  // et ce que sa page affiche de faux ne se transposent pas d'un site à l'autre.
  const panel = (listing, s, r, displayed, site = ADS.sites.current()) => ({
    page: [
      {
        label: 'En ligne depuis',
        value: s.onlineDays == null ? UNDATED : duration(s.onlineDays),
        strong: s.notable || s.dormant,
      },
      ...(s.bumped ? [{ label: site.words.bumpLabel, value: ago(s.bumpedDaysAgo) }] : []),
      { label: 'Vendeur', value: listing.sellerType === 'pro' ? 'professionnel' : 'particulier' },
    ],
    claim: site.claim(s, displayed),
    tracked: tracking(r),
  })

  return { badge, panel, drop }
})()

if (typeof module !== 'undefined') module.exports = ADS.view
