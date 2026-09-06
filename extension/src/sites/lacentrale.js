globalThis.ADS = globalThis.ADS || {}

// La Centrale compte l'ancienneté en jours et sature à 60 : une annonce de 61 jours et une
// de cinq ans portent le même libellé, et une page de résultats n'en affiche aucune. La date
// exacte est pourtant là — `creationDate` sur une fiche, `firstOnlineDate` sur une carte.
ADS.lacentrale = (() => {
  const SITE = 'lc'
  const DAY = 86400000

  // Les charges utiles ne sont pas dans l'arbre de `__NEXT_DATA__` mais dans des scripts
  // en ligne, en affectations — `var CLASSIFIED_MORE_INFOS = {…}` sur une fiche,
  // `window.__PRELOADED_STATE_LISTING__ = {…}` sur des résultats. L'objet qui suit le `=`
  // est découpé ici, en comptant les accolades hors chaîne.
  const object = (text, from) => {
    let depth = 0
    let str = false
    for (let i = from; i < text.length; i++) {
      const c = text[i]
      if (str) {
        if (c === '\\') i++
        else if (c === '"') str = false
      } else if (c === '"') str = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) return text.slice(from, i + 1)
    }
    return null
  }
  const parse = (s) => { try { return JSON.parse(s) } catch { return null } }
  const ASSIGNMENT = /(?:^|[;\n])\s*(?:var|let|const)?\s*[\w.$]+\s*=\s*(?=\{)/gm

  // Le JSON-LD est un document entier, une affectation un objet au milieu d'un script : les
  // deux sont tentés, ce qui ne se parse pas est laissé — dont la copie échappée que
  // `__NEXT_DATA__` porte des mêmes scripts.
  const blobs = (text) => {
    const out = []
    for (const m of text.matchAll(ASSIGNMENT)) {
      const found = parse(object(text, m.index + m[0].length))
      if (found) out.push(found)
    }
    const whole = parse(text)
    return whole ? [whole, ...out] : out
  }
  const collect = (node, hit, out = [], depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 12) return out
    if (hit(node)) return out.push(node), out
    for (const v of Array.isArray(node) ? node : Object.values(node)) collect(v, hit, out, depth + 1)
    return out
  }

  // Une fiche porte `creationDate`, une page de résultats `firstOnlineDate` : jamais les deux.
  const isDetail = (o) => 'classifiedReference' in o && 'creationDate' in o
  const isCard = (o) => 'reference' in o && 'firstOnlineDate' in o
  const date = (s) => (s ? new Date(s) : null)
  const number = (v) => (v === null || v === undefined || v === '' ? null : Number(v))
  const type = (t) => (t === 'PRO' ? 'pro' : 'private')
  // L'adresse se déduit de la référence : le site remplace la lettre de tête par son code
  // ASCII (W103538172 → 87103538172), vérifié sur les 23 annonces de la page relevée.
  const listing = (ref, rest) => ({
    site: SITE,
    siteId: String(ref),
    url: `https://www.lacentrale.fr/auto-occasion-annonce-${String(ref).charCodeAt(0)}${String(ref).slice(1)}.html`,
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
  // Le libellé plafonné, sous le prix. Les classes du site portent des hachages
  // régénérés à chaque build : le texte est le seul repère qui tienne.
  const PUBLISHED = /^Publiée il y a .+/i
  const displayed = (doc) => {
    for (const n of doc.querySelectorAll('div, span, p')) {
      const text = (n.textContent || '').trim()
      if (!n.children.length && PUBLISHED.test(text)) return text
    }
    return null
  }
  // Là où le compteur du site s'arrête ; au-delà, son libellé ne distingue plus
  // rien. Les trois autres bornes sont celles de leboncoin, où on les a mesurées.
  const CAP_DAYS = 60
  const BUMP_MIN_MS = DAY
  const OLD_MIN_DAYS = 31
  const BUMP_RECENT_DAYS = 14
  const signals = (listed, now) => {
    const online = Math.floor((now - listed.publishedAt) / DAY)
    const bumped = !!listed.bumpedAt && listed.bumpedAt - listed.publishedAt > BUMP_MIN_MS
    const bumpedDaysAgo = bumped ? Math.floor((now - listed.bumpedAt) / DAY) : null
    const capped = online > CAP_DAYS
    const old = online >= OLD_MIN_DAYS
    // Passé le plafond, le libellé du site est faux par omission, et l'écart suffit
    // à l'alerte ; en deçà, elle reste celle de leboncoin — ancienne, et poussée.
    const notable = capped || (old && bumped && bumpedDaysAgo <= BUMP_RECENT_DAYS)
    return { onlineDays: online, bumped, bumpedDaysAgo, capped, notable, dormant: old && !capped && !bumped }
  }
  // La contradiction, nommée : le site dit soixante jours faute de savoir en dire
  // davantage, quand la page porte la date exacte.
  const claim = (s, says) =>
    s.capped && says ? { label: 'La Centrale affiche', says, note: `compteur plafonné à ${CAP_DAYS} jours` } : null
  return { fromDocument, fromScripts, signals, claim, displayed }
})()

if (typeof module !== 'undefined') module.exports = ADS.lacentrale
