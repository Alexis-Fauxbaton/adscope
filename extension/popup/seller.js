globalThis.ADS = globalThis.ADS || {}

// Ce que le marchand ne montre pas de lui-même. La pastille alerte, la popup
// informe : ces lignes méritent d'être lues, aucune ne mérite d'interrompre.
// Elles ne disent plus « cette annonce est vieille » mais « ce marchand a du
// stock qui dort et il finit par baisser » — un argument de négociation, tiré
// de ses propres annonces.
//
// Encore faut-il que ce soit vrai. Le relevé ne porte pas le stock du
// marchand : il porte les annonces de ce marchand **que nos navigations ont
// croisées** et revues dans la fenêtre. Il en tient peut-être deux cents dont
// nous connaissons vingt-neuf ; nous n'avons aucun moyen de savoir combien, et
// c'est ce que le bloc doit dire. Un chiffre cité de travers dans une
// négociation ne se rattrape pas.
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

  // Trois issues, et pas deux : n'avoir vu aucun prix bouger n'est pas la même
  // chose qu'en avoir vu bouger quatre sans qu'aucun descende. La seconde est
  // un renseignement — ce marchand tient ses prix.
  const fall = (s) => {
    if (s.price_drop_listings && s.price_drop_rate != null) {
      return rate(s.price_drop_rate) +
        (s.price_drop_after_days == null
          ? ''
          : ` après ${days(s.price_drop_after_days)} en ligne`)
    }
    const changed = s.price_changed_listings
    return changed
      ? `aucune sur ${changed} changement${plural(changed)} de prix vu${plural(changed)}`
      : 'aucun prix n’a bougé sous nos yeux'
  }

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

  // Ce que la fenêtre couvre, dit avant les chiffres qu'elle porte. La fenêtre
  // vient du relevé : un seul seuil, tenu par l'API, jamais réinventé ici.
  const scope = (s) =>
    `Les annonces de ce vendeur qu'adscope a croisées et revues ces ` +
    `${s.window_days} derniers jours. Son catalogue réel nous est inconnu : ` +
    `il peut être bien plus large, et tout ce qui suit ne parle que de ces ` +
    `${s.listings}.`

  const block = (s) => {
    if (!s) return null
    return {
      title: s.seller_name ? `Ce vendeur — ${s.seller_name}` : 'Ce vendeur',
      lead: `${s.listings} annonce${plural(s.listings)} de ce vendeur vue${plural(s.listings)} par adscope`,
      scope: scope(s),
      rows: [
        {
          label: `${s.over_a_month} sur ${s.aged} datées depuis plus d'un mois`,
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
  // Les deux segments viennent de la charge d'une page tierce — c'est le site
  // ouvert qui les écrit, jamais nous : interpolés tels quels, un `?`, un `#`
  // ou un `/` déplacerait le chemin appelé ou greffe une chaîne de requête.
  // Encodés, ils restent un segment chacun.
  //
  // L'encodage ne suffit pourtant pas : le point n'est pas un caractère réservé,
  // `encodeURIComponent('..')` rend `..`, et l'analyseur d'URL résout ce segment
  // avant l'appel — `sellerId` à `..` appelait `/v1/sellers/`. Un segment réduit
  // à des points ne peut pas s'écrire comme un segment : aucun vendeur ne porte
  // ce nom, la demande n'est pas faite.
  const DOTS = /^\.+$/

  const segment = (s) => {
    const encoded = encodeURIComponent(String(s))
    return DOTS.test(encoded) ? null : encoded
  }

  const ask = async (apiBase, licenseKey, site, sellerId, f = fetch) => {
    const path = [segment(site), segment(sellerId)]
    if (path.some((p) => p === null)) return null
    try {
      const res = await f(`${apiBase}/v1/sellers/${path.join('/')}`, {
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
