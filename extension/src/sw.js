// Les modules de site, sans en nommer aucun : le manifeste dit déjà lesquels
// existent et pour quelles origines. Le service worker charge ceux du monde de
// l'extension — le monde MAIN ne lui appartient pas —, dans l'ordre déclaré et
// chacun une fois. Ajouter un site reste ce que l'architecture promet : un
// fichier, et deux lignes au manifeste.
const siteFiles = () => {
  const seen = new Set()
  for (const block of chrome.runtime.getManifest().content_scripts) {
    if (block.world === 'MAIN') continue
    for (const f of block.js) if (f.startsWith('src/sites/')) seen.add(`/${f}`)
  }
  return [...seen]
}

// L'état de santé et la joignabilité d'abord : l'authentification et les appels
// s'y rapportent. Le registre des sites ensuite — le service worker en a besoin
// pour savoir quelles origines l'extension prétend couvrir, et donc lesquelles
// le navigateur lui accorde encore.
importScripts(
  '/src/health.js', '/src/reach.js', '/src/auth.js', '/src/cache.js',
  '/src/api.js', '/src/observation.js', '/src/lookup.js', '/src/sites.js',
)
importScripts(...siteFiles())
importScripts('/src/access.js')

const { config, call } = ADS.api
const { signature, stale } = ADS.observation

// Un seul aller-retour côté content script : on pousse ce qui a été vu, puis
// on récupère ce que le pool sait déjà, pour ce qui manque au cache ou a vieilli.
const sync = async (site, listings) => {
  const now = Date.now()
  const cfg = await config()
  await ADS.cache.purgeDaily(now).catch(() => {})
  const known = await ADS.cache.read(site, listings.map((l) => l.siteId))
  const due = listings.filter((l) => stale(l, known[l.siteId], now))
  if (!due.length) return { ok: true, sent: 0, signals: {}, skipped: listings.length }

  const items = due.map(ADS.observation.of)
  for (let i = 0; i < items.length; i += 100) {
    await call('/v1/observations', { items: items.slice(i, i + 100) }, cfg)
  }

  const signals = {}
  const ids = due.map((l) => l.siteId)
  for (let i = 0; i < ids.length; i += 30) {
    const batch = await call('/v1/listings/batch', { site, ids: ids.slice(i, i + 30) }, cfg)
    for (const s of batch) signals[s.site_id] = s
  }

  const entries = {}
  for (const l of due) {
    if (signals[l.siteId]) entries[l.siteId] = { at: now, sig: signature(l), signals: signals[l.siteId] }
  }
  await ADS.cache.write(site, entries)
  return { ok: true, sent: items.length, signals, skipped: listings.length - due.length }
}

// Ce qu'on savait, tout de suite et sans réseau. Hors ligne, c'est la seule
// réponse que l'extension obtiendra, et elle suffit à afficher le suivi.
const cachedSignals = async (site, ids) => {
  const known = await ADS.cache.read(site, ids)
  const signals = {}
  for (const [id, entry] of Object.entries(known)) signals[id] = entry.signals
  return { ok: true, signals }
}

// Ce que la page a dit d'elle-même quand elle ne portait plus d'annonce. Rien
// n'est mis en cache : ce n'est pas un signal à afficher.
const absent = async (site, siteId, evidence) => {
  const cfg = await config()
  const { verdict } = await call('/v1/disappearances', { site, site_id: siteId, evidence }, cfg)
  return { ok: true, verdict }
}

// Suivre une annonce, par licence : la seule écriture que le lecteur commande.
// L'API répond 201 la première fois et 200 ensuite, sans distinction ici — la
// réponse n'est pas mise en cache, la liste des suivis reste au serveur.
const follow = async (site, siteId) => {
  const cfg = await config()
  return { ok: true, ...(await call('/v1/follows', { site, site_id: siteId }, cfg)) }
}

// Ce que la popup montre à la place d'une clé : qui est connecté (`email` nul pour une clé de machine).
const me = async () => ({ ok: true, ...(await call('/v1/me', null, await config(), 'GET')) })

// Le rouge de tampon, réservé à l'alerte — le même que celui de la fenêtre.
const BADGE_COLOR = '#9f1239'

// Le badge de l'icône, par onglet — un nombre toujours affiché devient du
// papier peint en deux jours, donc rien à dire, rien d'affiché.
//
// `null` et non `''` : un texte par onglet, fût-il vide, recouvre le badge
// global. C'est ainsi que le « ! » d'une session tombée restait invisible
// précisément sur les onglets où le lecteur regardait. Tant qu'un problème est
// en cours, l'onglet ne pose donc rien et laisse passer l'alerte : le compte
// dit ce que la page montre, le « ! » dit que l'extension ne travaille plus.
const badge = async (alerts, tab) => {
  if (!tab) return { ok: false, reason: 'no-tab' }
  const text = ADS.health.text() || alerts <= 0 ? null : String(alerts)
  if (text) await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: BADGE_COLOR })
  await chrome.action.setBadgeText({ tabId: tab.id, text })
  return { ok: true, text }
}

const handlers = {
  cached: (msg) => cachedSignals(msg.site, msg.ids),
  sync: (msg) => sync(msg.site, msg.listings),
  absent: (msg) => absent(msg.site, msg.siteId, msg.evidence),
  follow: (msg) => follow(msg.site, msg.siteId),
  comparables: async (msg) => ADS.lookup.comparables(msg.site, msg.siteId, await config()),
  seller: async (msg) => ADS.lookup.seller(msg.site, msg.sellerId, await config()),
  badge: (msg, sender) => badge(msg.alerts, sender && sender.tab),
  me: () => me(),
  // Ce que la fenêtre affiche avant tout le reste. L'accès aux sites est
  // revérifié à chaque ouverture : c'est le seul problème que le navigateur
  // peut créer sans qu'aucun appel n'échoue.
  health: async () => ({ ok: true, problems: await ADS.access.check() }),
  'cache-stats': () => ADS.cache.stats(),
  'cache-clear': async () => ({ ok: true, cleared: await ADS.cache.clear() }),
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  const handler = handlers[msg && msg.type]
  if (!handler) return false
  handler(msg, sender)
    .then(respond)
    .catch((e) =>
      respond({ ok: false, reason: e.message, authRequired: !!e.authRequired, unreachable: !!e.unreachable }),
    )
  return true
})

// Au démarrage, et à chaque fois que le navigateur accorde ou retire une
// permission : c'est par là que l'accès coupé se sait sans qu'un seul appel
// n'ait échoué.
ADS.access.watch()
