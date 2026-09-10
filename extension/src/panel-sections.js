globalThis.ADS = globalThis.ADS || {}

// Les quatre sections, et la règle qui décide de leur existence. Chacune rend
// un titre, un fait en sous-titre — ce qu'on lit sans ouvrir — et son corps.
// Aucune ne se fabrique un contenu : sans donnée, elle n'existe pas.
ADS.sections = (() => {
  const { el } = ADS.node
  const { number, ago } = ADS.format

  // En dessous, un catalogue n'en est pas un : deux annonces vues ne disent
  // rien d'un marchand, et les additionner le ferait croire.
  const MIN_LISTINGS = 3
  const HISTOVEC = 'https://histovec.interieur.gouv.fr'

  const fact = (text) => el('p', 'adscope-fact', text)
  const day = (v) => new Date(v).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const percent = (v) => `${Math.round(v * 100)} %`

  const link = (label, href, tail) => {
    const line = el('p', 'adscope-fact')
    const a = el('a', 'adscope-link', label)
    a.setAttribute('href', href)
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noreferrer noopener')
    line.append(a, el('span', null, ` — ${tail}`))
    return line
  }

  // La remise en avant, dite avec le mot du site : `index_date` atteste une
  // réactualisation, `lastUpdate` seulement qu'on a touché à l'annonce. Le
  // relevé mutualisé la date au jour près ; la page, elle, ne sait que compter.
  const bump = ({ signals: s, remote: r, site }) => {
    if (r && r.republished && r.republished_at) return fact(`${site.words.bumpLabel} le ${day(r.republished_at)}.`)
    if (s.bumped) return fact(`${site.words.bumpLabel} ${ago(s.bumpedDaysAgo)}.`)
    return null
  }

  const car = (ctx) => {
    const { signals: s, listing, remote: r } = ctx
    const seen = (r && r.observations) || 0
    const body = [
      s.onlineDays == null
        ? fact("La page ne porte aucune date de mise en ligne : adscope n'en invente pas.")
        : fact(`En ligne depuis ${number(s.onlineDays)} jours, mise en ligne le ${day(listing.publishedAt)}.`),
      bump(ctx),
      r && r.tracked_days != null
        ? fact(`Suivie par adscope depuis ${number(r.tracked_days)} jours, ${seen} relevé${seen > 1 ? 's' : ''}.`)
        : null,
    ].filter(Boolean)
    const age = s.onlineDays == null ? 'date absente de la page' : `${number(s.onlineDays)} jours en ligne`
    return {
      key: 'car', tone: 'blue', icon: ADS.icons.car, title: 'Cette voiture',
      short: seen ? `${age}, ${seen} observé${seen > 1 ? 's' : ''}` : age,
      body,
    }
  }

  const price = (ctx) => {
    const c = ctx.market.comparables
    if (!c) return null
    return {
      key: 'price', tone: 'green', icon: ADS.icons.bars, title: 'Ce prix',
      short: ADS.spread.short(c), body: ADS.spread.open(ctx),
    }
  }

  // Trois issues, et pas deux : n'avoir vu aucun prix bouger n'est pas la même
  // chose qu'en avoir vu bouger et qu'aucun ne descende.
  const drops = (s) => {
    if (s.price_drop_listings) {
      const after = s.price_drop_after_days == null ? '' : ` après ${number(s.price_drop_after_days)} jours en ligne`
      return `${s.price_drop_listings} de ses annonces ont baissé${after}.`
    }
    return s.price_changed_listings
      ? `Aucune baisse sur ${s.price_changed_listings} changements de prix vus.`
      : "Aucun de ses prix n'a bougé sous nos yeux."
  }

  const seller = ({ listing, market }) => {
    const s = market.seller
    if (listing.sellerType !== 'pro' || !s || s.listings < MIN_LISTINGS) return null
    const body = [fact(`${s.listings} de ses annonces vues par adscope.`)]
    if (s.over_a_month_share != null) {
      const share = percent(s.over_a_month_share)
      body.push(fact(`${share} en ligne depuis plus d'un mois (${s.over_a_month} sur ${s.aged}).`))
    }
    if (s.median_age_days != null) body.push(fact(`Ancienneté médiane : ${number(s.median_age_days)} jours.`))
    body.push(fact(drops(s)))
    const met = `Ses annonces qu'adscope a croisées ces ${s.window_days} derniers jours`
    body.push(el('p', 'adscope-reserve', `${met} : son catalogue réel nous est inconnu.`))
    return {
      key: 'seller', tone: 'grey', icon: ADS.icons.shop, title: 'Ce vendeur',
      short: [s.seller_name, `${s.listings} annonces vues`,
        s.over_a_month_share != null && `${percent(s.over_a_month_share)} de plus d'un mois`]
        .filter(Boolean).join(' · '),
      body,
    }
  }

  // Ce qui se vérifie ailleurs, et que le panneau ne prétend pas savoir. Une
  // question porte les chiffres de cette annonce : c'est elle qu'on pose au
  // vendeur, et il ne l'attend pas.
  const before = ({ signals: s }) => ({
    key: 'before', tone: 'blue', icon: ADS.icons.list, title: "Avant d'y aller",
    short: 'HistoVec, CT, 3 questions',
    body: [
      link('HistoVec', HISTOVEC, "le service de l'État qui rend l'historique d'un véhicule."),
      fact('Le procès-verbal du dernier contrôle technique : son relevé de compteur date le kilométrage.'),
      fact(s.onlineDays == null
        ? 'À demander : depuis quand cette annonce est-elle en ligne ?'
        : `À demander : en ligne depuis ${number(s.onlineDays)} jours, pourquoi n'est-elle pas partie ?`),
      fact('À demander : le prix a-t-il déjà baissé, et de combien ?'),
      fact('À demander : puis-je voir le véhicule et son procès-verbal avant de me décider ?'),
    ],
  })

  const all = (ctx) => [car(ctx), price(ctx), seller(ctx), before(ctx)].filter(Boolean)

  return { all }
})()

if (typeof module !== 'undefined') module.exports = ADS.sections
