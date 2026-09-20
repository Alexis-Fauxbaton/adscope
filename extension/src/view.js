globalThis.ADS = globalThis.ADS || {}

// Compose les libellés affichés. Deux origines qui ne se mélangent jamais :
// `s` vient de la page ouverte, `r` du suivi mutualisé renvoyé par l'API.
ADS.view = (() => {
  const { duration, spell, ago, money } = ADS.format

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

  // Sur une carte de résultats, la baisse se réduit à ce qui frappe : la flèche
  // et le montant, en valeur absolue. Le délai et le cumul sont l'affaire du
  // panneau — une chose par carte. Sans baisse, la carte n'en porte rien.
  const fall = (r) => (r && r.price_delta_since_first < 0 ? `↓ ${money(r.price_delta_since_first)}` : null)

  // Deux fragments, jamais concaténés : `page` se lit sur l'annonce ouverte,
  // `tracked` n'existe que parce que l'annonce a déjà été vue avant.
  const badge = (s, r, site = ADS.sites.current()) => ({ page: age(s, site), tracked: fall(r) })

  // « Stable depuis deux mois » ne vaut que ce que valent les observations qui
  // l'ont vu : vérifié chaque semaine, c'est un fait sur le vendeur ; jamais
  // revérifié, ce n'est qu'un aveu sur notre suivi. La ligne dit lequel des
  // deux. Sans les deux nombres — un signal d'avant l'échantillonnage, gardé
  // en cache —, elle n'affirme rien.
  // `fem` accorde le participe à ce qu'il qualifie : le prix (masculin, dans
  // `tracking`) ou l'annonce suivie (féminin, dans `legend`) — même cadence,
  // deux phrases.
  const checked = (r, fem = false) => {
    if (r.price_gap_days == null || r.stable_days < CHECKED_MAX_DAYS) return ''
    const v = fem ? 'vérifiée' : 'vérifié'
    if (!r.price_checks) return fem ? ' · jamais revérifiée' : ' · jamais revérifié'
    if (r.price_gap_days <= DAILY_MAX_DAYS) return ` · ${v} chaque jour`
    if (r.price_gap_days <= CHECKED_MAX_DAYS) return ` · ${v} chaque semaine`
    return ` · non ${v} pendant ${duration(r.price_gap_days)}`
  }

  // Le garde-fou d'honnêteté du panneau, en une ligne : depuis quand on
  // regarde, et à quelle cadence — la même que `checked` calcule pour `tracking`,
  // seule la ligne qui la porte a changé.
  // En toutes lettres : c'est une phrase du panneau, pas une pastille. « Suivie
  // depuis 1 j » y passait pour une coquille, et « 1 jours » en aurait été une.
  const legend = (r) => (r && r.tracked_days != null ? `Suivie depuis ${spell(r.tracked_days)}${checked(r, true)}` : '')

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

  return { badge, tracking, drop, fall, legend }
})()

if (typeof module !== 'undefined') module.exports = ADS.view
