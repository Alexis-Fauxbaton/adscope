globalThis.ADS = globalThis.ADS || {}

// La Centrale compte l'ancienneté en jours et sature à 60 : une annonce de 61 jours et une
// de cinq ans portent le même libellé, et une page de résultats n'en affiche aucune. La date
// exacte est pourtant là — `creationDate` sur une fiche, `firstOnlineDate` sur une carte.
ADS.lacentrale = ADS.sites.register((() => {
  const SITE = 'lc'
  const DAY = 86400000
  const { leaf, blobs, collect } = ADS.read

  // Une fiche porte `creationDate`, une page de résultats `firstOnlineDate` : jamais les deux.
  const isDetail = (o) => 'classifiedReference' in o && 'creationDate' in o
  const isCard = (o) => 'reference' in o && 'firstOnlineDate' in o
  const date = (s) => (s ? new Date(s) : null)
  const number = (v) => (v === null || v === undefined || v === '' ? null : Number(v))
  const type = (t) => (t === 'PRO' ? 'pro' : 'private')
  // L'adresse se déduit de la référence : le site remplace la lettre de tête par son code
  // ASCII (W103538172 → 87103538172), vérifié sur les 23 annonces de la page relevée.
  const slug = (ref) => `auto-occasion-annonce-${String(ref).charCodeAt(0)}${String(ref).slice(1)}.html`
  // Et se relit dans l'autre sens : c'est ainsi qu'une adresse ouverte nomme son annonce.
  const urlId = (path) => {
    const m = path.match(/auto-occasion-annonce-(\d\d)(\d+)\.html/)
    return m ? String.fromCharCode(Number(m[1])) + m[2] : null
  }
  const listing = (ref, rest) => ({
    site: SITE,
    siteId: String(ref),
    url: `https://www.lacentrale.fr/${slug(ref)}`,
    ...rest,
  })

  // Seul le marchand est retenu : agréger les annonces d'une entreprise est de la donnée
  // d'entreprise, celles d'un particulier seraient personnelles — et une fiche de particulier
  // porte son nom. `customerReference` est la clé du vendeur des deux côtés ; le siret, porté
  // par les seules cartes, ne sort jamais de la page.
  const seller = (customerType, id, name) =>
    customerType === 'PRO' && id
      ? { sellerId: String(id), sellerName: name || null }
      : { sellerId: null, sellerName: null }

  const card = (c) => {
    const v = c.vehicle || {}
    return listing(c.reference, {
      title: [v.make, v.model, v.version].filter(Boolean).join(' ') || null,
      sellerType: type(c.customerType),
      ...seller(c.customerType, c.customerReference, (c.contacts || {}).nomPublie),
      price: number(c.price),
      publishedAt: date(c.firstOnlineDate),
      // `lastUpdate` dit qu'on a touché à l'annonce, pas pourquoi : remontée payée
      // ou simple correction, la page ne les distingue pas.
      bumpedAt: c.lastUpdate ? new Date(c.lastUpdate * 1000) : null,
      brand: v.make || null, model: v.model || null, version: v.version || null,
      year: number(v.year), mileage: number(v.mileage),
    })
  }
  const detail = (c, ld, vehicle, account) =>
    listing(c.classifiedReference, {
      title: ld.name || null,
      sellerType: type(c.customerType),
      ...seller(c.customerType, c.customerReference, account.publishedName),
      price: number((ld.offers || {}).price) || number(c.price),
      publishedAt: date(c.creationDate),
      // Rien sur une fiche ne dit qu'elle a été remontée : on n'invente pas.
      bumpedAt: null,
      brand: ld.brand || null, model: ld.model || null, version: vehicle.label || null,
      year: number(ld.dateVehicleFirstRegistered),
      mileage: number((ld.mileageFromOdometer || {}).value) || number(c.mileage),
    })
  // Une seule lecture pour les deux surfaces : la fiche si la page en porte une,
  // les cartes sinon — dédoublonnées, la mise en avant reparaissant en résultat.
  const fromScripts = (texts) => {
    const found = texts.flatMap(blobs)
    const combined = collect(found, isDetail)[0]
    if (combined) {
      const vehicle = collect(found, (o) => 'make' in o && 'label' in o)[0] || {}
      const account = collect(found, (o) => 'publishedName' in o)[0] || {}
      return [detail(combined, found.find((o) => o['@type'] === 'Car') || {}, vehicle, account)]
    }
    const seen = new Set()
    return collect(found, isCard).filter((c) => !seen.has(c.reference) && seen.add(c.reference)).map(card)
  }
  const fromDocument = (doc) => fromScripts([...doc.querySelectorAll('script')].map((s) => s.textContent || ''))

  // Le libellé plafonné, sous le prix.
  const PUBLISHED = /^Publiée il y a .+/i
  const dateNode = (doc, skip) => leaf(doc, PUBLISHED, skip)
  const displayed = (doc) => {
    const node = dateNode(doc)
    return node && (node.textContent || '').trim()
  }
  // La carte de résultats, reconnue par l'adresse de l'annonce ; le bloc qui l'entoure
  // porte les métadonnées de suivi du site, quand ses classes changent à chaque build.
  const cardOf = (doc, l) => {
    const link = doc.querySelector(`a[href*="${slug(l.siteId)}"]`)
    return link && (link.closest('[data-tracking-meta]') || link)
  }

  // Mesuré : là où le compteur du site s'arrête. La fiche relevée le 2026-09-06 porte
  // 1 810 jours en ligne et affiche « Publiée il y a 60 jours » ; au-delà de ce plafond,
  // son libellé ne distingue plus rien, et l'écart, lui, se mesure.
  const CAP_DAYS = 60
  // Mesuré le 2026-09-06, et la mesure conclut à l'insuffisance : la base porte 24 annonces
  // du site, toutes d'un seul relevé, dont 5 dans la fenêtre [31, 60] que ce seuil découpe.
  // Aucune borne ne s'y dessine, et l'absence est vérifiée : en tirant 23 anciennetés au
  // hasard parmi les 29 188 de leboncoin, le plus grand écart se place n'importe où entre 18
  // et 56 jours — l'estimateur est du bruit à cet effectif. Il faut environ 500 annonces pour
  // voir la forme, 2 000 pour y poser une borne. 31 jours reste donc emprunté à leboncoin, où
  // il a été mesuré ; ici la valeur ne pèse que sur l'appui visuel, jamais sur l'alerte.
  const OLD_MIN_DAYS = 31
  // Non mesuré non plus, et volontairement sans effet sur l'alerte : 22 des 23 cartes
  // relevées portent un `lastUpdate` postérieur de plus d'un jour à la mise en ligne.
  // Une marque que 96 % des annonces portent ne distingue rien, et le site ne dit pas ce
  // qu'elle recouvre — elle est affichée comme fait, jamais retenue comme signal.
  const BUMP_MIN_MS = DAY

  const signals = (listed, now) => {
    const online = Math.floor((now - listed.publishedAt) / DAY)
    const bumped = !!listed.bumpedAt && listed.bumpedAt - listed.publishedAt > BUMP_MIN_MS
    const capped = online > CAP_DAYS
    return {
      onlineDays: online,
      bumped,
      bumpedDaysAgo: bumped ? Math.floor((now - listed.bumpedAt) / DAY) : null,
      capped,
      // L'alerte est le plafond, et lui seul : passé 60 jours le libellé du site est faux
      // par omission. En deçà il dit l'âge exact — appuyé, jamais mis en alerte.
      notable: capped,
      dormant: !capped && online >= OLD_MIN_DAYS,
    }
  }

  // Le vocabulaire du site : `lastUpdate` atteste qu'on a touché à l'annonce, rien de plus.
  // « Réactualisée » y affirmerait une remontée que la page ne donne pas.
  const words = { bump: () => 'modifiée', bumpLabel: 'Modifiée' }

  // La contradiction, nommée : le site dit soixante jours faute de savoir en dire
  // davantage, quand la page porte la date exacte.
  const claim = (s, says) =>
    s.capped && says ? { label: 'La Centrale affiche', says, note: `compteur plafonné à ${CAP_DAYS} jours` } : null

  return {
    id: SITE,
    origins: ['https://www.lacentrale.fr'],
    urlId, card: cardOf, dateNode, words, claim, displayed,
    fromDocument, fromScripts, signals,
  }
})())

if (typeof module !== 'undefined') module.exports = ADS.lacentrale
