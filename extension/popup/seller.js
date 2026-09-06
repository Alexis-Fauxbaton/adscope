globalThis.ADS = globalThis.ADS || {}

// Ce que le marchand ne montre pas de lui-même. La pastille alerte, la popup
// informe : ces lignes méritent d'être lues, aucune ne mérite d'interrompre.
// Elles ne disent plus « cette annonce est vieille » mais « ce marchand a du
// stock qui dort et il finit par baisser » — un argument de négociation, tiré
// de ses propres annonces.
ADS.seller = (() => {
  // En dessous, une médiane n'est pas une médiane : c'est le rang d'une des
  // trois annonces qu'on a vues. Le chiffre reste affiché — c'est le seul
  // qu'on ait — mais marqué et expliqué, jamais présenté comme un fait.
  const MIN_SAMPLE = 8

  // En jours, toujours. La pastille peut dire « 1 mois » : elle alerte. Une
  // médiane se compare d'un marchand à l'autre, et « 1 mois » couvrirait de 31
  // à 60 jours — deux stocks très différents deviendraient le même chiffre.
  const days = (n) => `${n} j`

  const plural = (n) => (n > 1 ? 's' : '')
  const percent = (share) =>
    share == null ? '—' : `${Math.round(share * 100)} %`

  // Signe moins typographique et virgule décimale : le chiffre est lu, pas
  // recopié dans un tableur.
  const rate = (r) => `${(r * 100).toFixed(1).replace('-', '−').replace('.', ',')} %`

  const fall = (s) =>
    s.price_drop_listings && s.price_drop_rate != null
      ? rate(s.price_drop_rate) +
        (s.price_drop_after_days == null
          ? ''
          : ` après ${days(s.price_drop_after_days)} en ligne`)
      : 'aucune encore observée'

  const thin = (n) => (n < MIN_SAMPLE ? '≈' : undefined)

  const note = (s) => {
    const parts = []
    if (s.aged < MIN_SAMPLE) parts.push(`${s.aged} annonce${plural(s.aged)} datée${plural(s.aged)}`)
    const drops = s.price_drop_listings
    if (drops && drops < MIN_SAMPLE) parts.push(`${drops} baisse${plural(drops)}`)
    return parts.length
      ? `Ordre de grandeur : calculé sur ${parts.join(' et ')}, pas une statistique.`
      : ''
  }

  const block = (s) => {
    if (!s) return null
    return {
      title: s.seller_name ? `Ce vendeur — ${s.seller_name}` : 'Ce vendeur',
      lead: `${s.listings} annonce${plural(s.listings)} en ligne`,
      rows: [
        {
          label: `${s.over_a_month} depuis plus d'un mois`,
          value: percent(s.over_a_month_share),
          mark: thin(s.aged),
        },
        {
          label: "Médiane d'ancienneté",
          value: s.median_age_days == null ? '—' : days(s.median_age_days),
          mark: thin(s.aged),
        },
        {
          label: 'Baisse moyenne constatée',
          value: fall(s),
          mark: s.price_drop_listings ? thin(s.price_drop_listings) : undefined,
        },
      ],
      note: note(s),
    }
  }

  // L'appel est le signal : demander ces statistiques dit qu'une fiche a été
  // ouverte et laquelle, sans un seul événement de télémétrie. Un vendeur
  // inconnu ou une API muette ne rendent rien — la popup n'en parle pas.
  //
  // Les deux segments viennent de la charge leboncoin, donc d'une page tierce :
  // interpolés tels quels, un `?`, un `#` ou un `/` déplacerait le chemin appelé
  // ou greffe une chaîne de requête. Encodés, ils restent un segment chacun.
  const segment = (s) => encodeURIComponent(String(s))

  const ask = async (apiBase, licenseKey, site, sellerId, f = fetch) => {
    try {
      const res = await f(`${apiBase}/v1/sellers/${segment(site)}/${segment(sellerId)}`, {
        headers: { Authorization: `Bearer ${licenseKey}` },
      })
      return res.ok ? await res.json() : null
    } catch {
      return null
    }
  }

  return { block, fetch: ask, MIN_SAMPLE }
})()

if (typeof module !== 'undefined') module.exports = ADS.seller
