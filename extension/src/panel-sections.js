globalThis.ADS = globalThis.ADS || {}

// Les trois sections, et la règle qui décide de leur existence. Chacune rend
// un titre, un fait en sous-titre — ce qu'on lit sans ouvrir — et son corps.
// Aucune ne se fabrique un contenu : sans donnée, elle n'existe pas.
ADS.sections = (() => {
  const { el } = ADS.node
  const { number, money, ago } = ADS.format

  // En dessous, un catalogue n'en est pas un : deux annonces vues ne disent
  // rien d'un marchand, et les additionner le ferait croire.
  const MIN_LISTINGS = 3
  // Le seuil de l'API, redit ici : en deçà, republier et réindexer à quelques
  // heures d'écart est le fonctionnement normal d'un site. Un changement de
  // prix tombé dans cette fenêtre autour de la remontée est celui de la
  // remontée ; au delà, c'est un autre jour et une autre décision.
  const BUMP_MIN_DAYS = 1
  const DAY = 86400000

  const fact = (text) => el('p', 'adscope-fact', text)
  const day = (v) => new Date(v).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  // Les changements de prix portent les mots de l'axe de la courbe juste
  // au-dessus : c'est la même série qu'on relit, ligne à ligne.
  const when = (v) => new Date(v).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  const percent = (v) => `${Math.round(v * 100)} %`
  const plural = (n) => (n > 1 ? 's' : '')
  // Le signe porte la direction, et lui seul : une hausse se lit « + » et rien
  // ne l'alerte — l'orangé n'existe que pour ce que le site cache.
  const signed = (n) => `${n < 0 ? '−' : '+'}${money(n)}`

  // Les changements de prix relevés, du plus récent au plus ancien — le dernier
  // est ce qui vient de se passer. Chacun porte son montant et le cumul depuis
  // la première observation : c'est le cumul qui dit de combien le prix a cédé
  // depuis qu'adscope le regarde, et aucune page ne l'affiche.
  const changes = (history = []) => {
    const out = []
    for (let i = 1; i < history.length; i++) {
      const move = history[i].price - history[i - 1].price
      if (move) out.push({ at: history[i].at, move, total: history[i].price - history[0].price })
    }
    return out.reverse()
  }

  // Le cumul se tait sur le premier changement : il y répète le montant.
  const step = (m) =>
    fact(`${signed(m.move)} le ${when(m.at)}${m.total === m.move ? '' : ` · ${signed(m.total)} cumulés`}`)

  const price = ({ remote: r }) => {
    if (!r || !r.price_history || !r.price_history.length) return null
    const moves = changes(r.price_history)
    const falls = moves.filter((m) => m.move < 0).length
    const word = falls === moves.length ? 'baisse' : 'changement'
    return {
      key: 'price', tone: 'green', icon: ADS.icons.bars, title: 'Prix',
      short: moves.length
        ? `${moves.length} ${word}${plural(moves.length)} · ${signed(moves[0].total)} cumulés`
        : 'aucun changement de prix relevé',
      body: moves.length
        ? moves.map(step)
        : [fact(`Aucun changement de prix depuis la première observation, le ${day(r.first_seen)}.`)],
    }
  }

  // La remise en avant, dite avec le mot du site, et ce qu'elle valait. Une
  // remontée au même prix est exactement ce que la date fraîche de la page
  // recouvre : la nommer est tout l'objet de la ligne. Le relevé mutualisé la
  // date au jour près ; la page, elle, ne sait que compter.
  const bump = ({ signals: s, remote: r, site }) => {
    const at = r && r.republished && (r.bumped_at || r.republished_at)
    if (!at) return s.bumped ? fact(`${site.words.bumpLabel} ${ago(s.bumpedDaysAgo)}.`) : null
    const near = changes(r.price_history)
      .filter((m) => Math.abs(Date.parse(m.at) - Date.parse(at)) <= BUMP_MIN_DAYS * DAY)
    const fell = near.filter((m) => m.move < 0).reduce((sum, m) => sum + m.move, 0)
    const said = fell ? `, prix baissé de ${money(fell)}` : ' sans baisse de prix'
    return fact(`${site.words.bumpLabel} le ${when(at)}${said}.`)
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
        ? fact(`Suivie par adscope depuis ${number(r.tracked_days)} jours, ${seen} relevé${plural(seen)}.`)
        : null,
    ].filter(Boolean)
    const age = s.onlineDays == null ? 'date absente de la page' : `${number(s.onlineDays)} jours en ligne`
    return {
      key: 'car', tone: 'blue', icon: ADS.icons.car, title: 'Cette voiture',
      short: seen ? `${age}, ${seen} observé${plural(seen)}` : age,
      body,
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
    // Actives et vues se comptent aujourd'hui sur le même nombre : rien ne
    // disparaît encore en base. Le jour où les disparues seront écartées, c'est
    // cette ligne-ci qui maigrira, et l'écart entre les deux sera le fait.
    const body = [
      fact(`${s.listings} annonces actives.`),
      fact(`${s.listings} de ses annonces vues par adscope.`),
    ]
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

  // `Prix` en tête : c'est la section ouverte par défaut, et celle qui prend sa
  // place quand elle manque est la suivante, jamais un contenu de remplacement.
  const all = (ctx) => [price(ctx), car(ctx), seller(ctx)].filter(Boolean)

  return { all }
})()

if (typeof module !== 'undefined') module.exports = ADS.sections
