globalThis.ADS = globalThis.ADS || {}

ADS.leboncoin = ADS.sites.register((() => {
  const KEPT = new Set(['brand', 'model', 'u_car_version', 'regdate', 'mileage'])

  const parseDate = (s) => (s ? new Date(s.replace(' ', 'T')) : null)

  const isAd = (o) => o && typeof o === 'object' && 'list_id' in o && 'first_publication_date' in o

  // Les résultats portent un tableau `ads`, une fiche un objet unique.
  const findAds = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 12) return null
    if (Array.isArray(node)) {
      for (const v of node.slice(0, 8)) {
        const found = findAds(v, depth + 1)
        if (found) return found
      }
      return null
    }
    if (Array.isArray(node.ads) && node.ads.some(isAd)) return node.ads.filter(isAd)
    if (isAd(node)) return [node]
    for (const v of Object.values(node)) {
      const found = findAds(v, depth + 1)
      if (found) return found
    }
    return null
  }

  const attributes = (ad) => {
    const out = {}
    for (const a of ad.attributes || []) if (KEPT.has(a.key)) out[a.key] = a.value
    return out
  }

  // Relevé le 2026-09-06 sur une page réelle : `owner` porte `store_id`, `name`,
  // `user_id` et `siren`, **quel que soit le type de vendeur** — un particulier
  // y figure avec un prénom. La présence du champ ne dit donc rien ; le type,
  // si. Seul le marchand est retenu : agréger ses annonces publiées est de la
  // donnée d'entreprise, celles d'un particulier seraient de la donnée
  // personnelle. `user_id` et `siren` ne sortent jamais de la page.
  const seller = (owner) =>
    owner.type === 'pro' && owner.store_id
      ? { sellerId: String(owner.store_id), sellerName: owner.name || null }
      : { sellerId: null, sellerName: null }

  const normalize = (ad) => {
    const attr = attributes(ad)
    const owner = ad.owner || {}
    return {
      site: 'lbc',
      siteId: String(ad.list_id),
      url: ad.url,
      title: ad.subject,
      sellerType: owner.type === 'pro' ? 'pro' : 'private',
      ...seller(owner),
      price: Array.isArray(ad.price) ? ad.price[0] : ad.price,
      publishedAt: parseDate(ad.first_publication_date),
      bumpedAt: parseDate(ad.index_date),
      brand: attr.brand, model: attr.model, version: attr.u_car_version,
      year: attr.regdate ? Number(attr.regdate) : null,
      mileage: attr.mileage ? Number(attr.mileage) : null,
    }
  }

  // Une réactualisation n'est retenue qu'au-delà d'un jour : republier et
  // indexer à quelques heures d'écart est le fonctionnement normal du site.
  const BUMP_MIN_MS = 24 * 3600 * 1000

  // Réactualiser n'est pas un signal : 76 % des annonces professionnelles en base
  // le sont (5 % chez les particuliers). Le signal est l'annonce ancienne qu'on
  // maintient en avant parce qu'elle ne part pas. Un mois : c'est là que
  // l'affichage cesse de compter en jours, et la borne coupe l'alerte pro de
  // 3 041 à 1 903 sur les 7 110 annonces mesurées le 2026-09-06.
  const OLD_MIN_DAYS = 31

  // Réactualisée « récemment » : au-delà de deux semaines, la remise en avant est
  // passée et n'explique plus la position de l'annonce. Sur les annonces pro
  // anciennes et réactualisées, 1 903 sur 1 948 le sont depuis moins de 14 jours ;
  // les 45 autres s'étalent jusqu'à 55 — la coupure tombe dans un creux.
  const BUMP_RECENT_DAYS = 14

  const signals = (listing, now) => {
    // Une charge peut porter la clé de date sans valeur : `null` compté en millisecondes rendrait
    // l'époque Unix, cinquante-six ans énoncés d'autorité. Sans date, aucun âge, et rien qui suive.
    const online = listing.publishedAt ? Math.floor((now - listing.publishedAt) / 86400000) : null
    const bumped = online != null && listing.bumpedAt - listing.publishedAt > BUMP_MIN_MS
    const bumpedDaysAgo = bumped ? Math.floor((now - listing.bumpedAt) / 86400000) : null
    const old = online != null && online >= OLD_MIN_DAYS
    return {
      onlineDays: online, bumped, bumpedDaysAgo,
      // L'alerte : ancienne, et encore poussée. La page dit « aujourd'hui », la
      // voiture est là depuis des mois.
      notable: old && bumped && bumpedDaysAgo <= BUMP_RECENT_DAYS,
      // Ce qui dépasse le seuil du site, alerte ou non : le résumé le compte.
      old,
      // Du stock qui dort sans qu'on paie pour le cacher : rien à dénoncer, la
      // page affiche déjà son âge. Appuyé, pas mis en alerte.
      dormant: old && !bumped,
    }
  }

  // La même lecture pour les deux sources : le bloc du rendu serveur et les
  // charges que la page reçoit ensuite ont la même forme.
  const fromPayload = (json) => {
    const ads = findAds(json)
    return ads ? ads.map(normalize) : []
  }

  const fromDocument = (doc) => {
    const tag = doc.getElementById('__NEXT_DATA__')
    return tag ? fromPayload(JSON.parse(tag.textContent)) : []
  }
  // Comment ce site constate que sa charge est là : le bloc que son rendu serveur écrit.
  const payload = (doc) => !!doc.getElementById('__NEXT_DATA__')

  // Ce que l'URL d'une fiche porte : une suite d'au moins six chiffres.
  const urlId = (path) => (path.match(/\d{6,}/) || [])[0] || null

  // La carte des résultats qui porte cette annonce, et le bloc qui l'entoure.
  const card = (doc, l) => {
    const link = doc.querySelector(`a[href*="/ad/voitures/${l.siteId}"], a[href$="/${l.siteId}"]`)
    return link && (link.closest('article') || link)
  }

  // Le libellé que la fiche affiche sous le titre : « il y a 3 jours à 15:36 ».
  const DISPLAYED = /il y a .+ à \d{1,2}:\d{2}|(?:hier|aujourd'hui) à \d{1,2}:\d{2}/i
  const dateNode = (doc, skip) => ADS.read.leaf(doc, DISPLAYED, skip)

  // Le vocabulaire du site : `index_date` atteste une réactualisation, et
  // « encore » n'a de sens que sur une annonce déjà ancienne — l'alerte, donc.
  const words = {
    bump: (s) => `${s.notable ? 'encore ' : ''}réactualisée`,
    bumpLabel: 'Réactualisée',
  }

  // La contradiction, nommée : le site montre une date d'indexation là où le lecteur comprend
  // une date de mise en ligne. `days` dit ce qu'elle couvre : pas plus loin que la remontée.
  const claim = (s, says) =>
    s.bumped && says
      ? { label: 'leboncoin affiche', says, days: s.bumpedDaysAgo, note: 'date de réactualisation, pas de publication' }
      : null

  return {
    id: 'lbc', name: 'leboncoin', origins: ['https://www.leboncoin.fr'],
    urlId, card, dateNode, words, claim,
    fromDocument, fromPayload, payload, normalize, signals, findAds,
  }
})())

if (typeof module !== 'undefined') module.exports = ADS.leboncoin
