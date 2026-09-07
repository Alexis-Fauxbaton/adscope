globalThis.ADS = globalThis.ADS || {}

// `chrome.storage.local` n'est pas la base — la base est distante et durable.
// C'est un cache et un repli hors ligne : ce qu'on savait s'affiche sans
// attendre le réseau, et sans réseau il s'affiche quand même.
//
// Une clé par annonce, `a:<site>:<identifiant>`, portant les derniers signaux connus
// et leur horodatage. Le quota reste celui par défaut : `unlimitedStorage`
// n'est pas demandée, ce cache n'a pas à être durable.
ADS.cache = (() => {
  const PREFIX = 'a:'
  const META = '_meta'
  const DAY = 86400000
  const KEEP_DAYS = 30
  const HISTORY_MAX = 20

  const local = () => chrome.storage.local
  const key = (site, id) => `${PREFIX}${site}:${id}`
  const isEntry = (k) => k.startsWith(PREFIX)

  // Le premier point plus les vingt plus récents. Le premier porte la baisse
  // depuis l'origine, qui est le signal vendeur ; les intermédiaires anciens
  // n'ont pas de lecteur. Sans ce plafond, quelques annonces suivies longtemps
  // remplissent le quota et l'enregistrement cesse en silence.
  //
  // L'historique porte aussi des confirmations — « le prix n'avait pas bougé ce
  // jour-là ». Prises au même rang que les changements, elles rempliraient le
  // plafond et évinceraient précisément ce qui se lit. Elles ne prennent donc
  // que la place qui reste, les plus récentes d'abord.
  //
  // L'API en écrit une par jour mais n'en sert qu'une par semaine : sans cet
  // éclaircissement à la source, les vingt places couvriraient vingt jours de
  // suivi au lieu de près de cinq mois, et ce plafond-ci sacrifierait sept fois
  // plus vite les changements qu'il est censé protéger.
  const trim = (entry) => {
    const points = entry.signals && entry.signals.price_history
    if (!Array.isArray(points) || points.length <= HISTORY_MAX + 1) return entry
    const rest = points.slice(1)
    const changes = rest.filter((p) => !p.confirmation)
    // `slice(-0)` rendrait tout le tableau : sans place, aucune confirmation.
    const room = Math.max(0, HISTORY_MAX - changes.length)
    const spared = new Set(room ? rest.filter((p) => p.confirmation).slice(-room) : [])
    const kept = rest.filter((p) => !p.confirmation || spared.has(p))
    return {
      ...entry,
      signals: { ...entry.signals, price_history: [points[0], ...kept.slice(-HISTORY_MAX)] },
    }
  }

  // La purge des trente jours ne libère rien quand tout est récent : celle-ci
  // sacrifie la moitié la plus ancienne, quel que soit son âge. Elle n'a lieu
  // que sur refus d'écriture.
  const evict = async () => {
    const all = await local().get(null)
    const keys = Object.keys(all)
      .filter(isEntry)
      .sort((a, b) => (all[a].at || 0) - (all[b].at || 0))
    const doomed = keys.slice(0, Math.ceil(keys.length / 2))
    if (doomed.length) await local().remove(doomed)
    return doomed.length
  }

  const set = async (items) => {
    try {
      await local().set(items)
      return true
    } catch {
      await evict()
      // Une seule nouvelle tentative : si elle échoue, le cache renonce à
      // cette écriture, il ne bloque pas l'affichage pour autant.
      try {
        await local().set(items)
        return true
      } catch {
        return false
      }
    }
  }

  // Une page de résultats lit ses vingt-quatre annonces en un seul appel.
  const read = async (site, ids) => {
    const stored = await local().get(ids.map((id) => key(site, id)))
    const found = {}
    for (const id of ids) {
      const entry = stored[key(site, id)]
      if (entry && entry.signals) found[id] = entry
    }
    return found
  }

  const write = async (site, entries) => {
    const items = {}
    for (const [id, entry] of Object.entries(entries)) items[key(site, id)] = trim(entry)
    return Object.keys(items).length ? set(items) : true
  }

  const purge = async (now = Date.now()) => {
    const all = await local().get(null)
    const old = Object.keys(all).filter(
      (k) => isEntry(k) && now - (all[k].at || 0) > KEEP_DAYS * DAY,
    )
    if (old.length) await local().remove(old)
    await local().set({ [META]: { ...all[META], purged: now } })
    return old.length
  }

  // Opportuniste, au chargement, une fois par jour au plus : le balayage
  // complet du stockage coûte trop pour être refait à chaque page, et une
  // alarme demanderait une permission de plus.
  const purgeDaily = async (now = Date.now()) => {
    const stored = await local().get(META)
    const meta = stored[META]
    if (meta && now - (meta.purged || 0) < DAY) return null
    return purge(now)
  }

  const stats = async () => {
    const all = await local().get(null)
    return {
      entries: Object.keys(all).filter(isEntry).length,
      bytes: await local().getBytesInUse(null),
      quota: local().QUOTA_BYTES || null,
      purged: (all[META] && all[META].purged) || null,
    }
  }

  const clear = async () => {
    const all = await local().get(null)
    const keys = Object.keys(all).filter(isEntry)
    if (keys.length) await local().remove(keys)
    return keys.length
  }

  return { read, write, purge, purgeDaily, stats, clear }
})()

if (typeof module !== 'undefined') module.exports = ADS.cache
