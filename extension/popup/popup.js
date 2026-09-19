const { rows, trouble, occupancy, summary } = ADS.report
const { el, row, hint, fill, note } = ADS.dom

// La fenêtre ne connaît aucun site : elle demande au registre le nom de celui
// que le diagnostic désigne, et la liste de ceux qu'on couvre.
const named = (id) => (ADS.sites.all().find((s) => s.id === id) || {}).name || ''

const listed = (names) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} ou ${names[names.length - 1]}` : names[0] || ''

const showEmpty = () => {
  const where = listed(ADS.sites.all().map((s) => s.name))
  el('empty').textContent =
    `Aucune page analysée. Ouvre une liste de résultats ou une annonce voiture sur ${where}, puis rouvre cette fenêtre.`
  el('empty').hidden = false
}

const diagnose = (status) => {
  if (!status) return
  const box = el('state')
  box.append(...rows(status).map(row))
  const { text, bad } = trouble(status)
  if (text) box.append(hint(text, bad))
}

// Ce que la fiche ouverte ne dit pas : ce qu'adscope a vu de ce marchand. La
// demande est elle-même la mesure d'usage — rien d'autre n'est collecté.
//
// Relayée par le service worker, comme `/v1/me` et le cache : lui seul choisit
// Bearer ou cookie de session (`ADS.lookup.seller`, par `ADS.auth`), la popup
// n'a plus de clé à porter ni de destination à vérifier avant d'envoyer.
const showSeller = async (status) => {
  if (!status.sellerId) return
  const res = await ask({ type: 'seller', site: status.site, sellerId: status.sellerId })
  const block = ADS.seller.block(res && res.ok ? res.stats : null)
  if (!block) return
  el('seller-title').textContent = block.title
  // La portée avant les chiffres : elle dit de quelle population ils sortent.
  const nodes = [ADS.dom.tag('div', 'lead', block.lead), hint(block.scope), ...block.rows.map(row)]
  if (block.note) nodes.push(hint(block.note))
  fill('seller', nodes)
  el('seller-box').hidden = false
}

// Le cache est tenu par le service worker : lui seul sait ce qu'il contient, et
// lui seul garde l'historique de prix que la courbe trace.
const ask = (msg) => chrome.runtime.sendMessage(msg).catch(() => null)

const tracked = async (status) => {
  const res = await ask({ type: 'cached', site: status.site, ids: [status.pickedId] })
  return (res && res.signals && res.signals[status.pickedId]) || null
}

const showCache = async () => {
  const stats = await ask({ type: 'cache-stats' })
  el('cache').replaceChildren(stats ? row(occupancy(stats)) : hint('Cache illisible.'))
}

el('cache-clear').onclick = async () => {
  await ask({ type: 'cache-clear' })
  await showCache()
  note('cache-note', 'ok', 'Cache vidé. Les signaux reviendront de l’API à la prochaine page.')
}

chrome.storage.local.get(['licenseKey', 'apiBase', 'status']).then(async (stored) => {
  ADS.account.init(stored)
  // Avant tout le reste : ce qui empêche l'extension de travailler, et le geste
  // qui le répare. Le reste de la fenêtre ne l'attend pas.
  ADS.alerts.show()
  showCache()
  ADS.account.showAccount(await ask({ type: 'me' }))
  const status = stored.status
  diagnose(status)
  if (!status) return showEmpty()
  el('site').textContent = named(status.site)
  if (status.kind !== 'detail') return fill('summary-rows', summary(status).map(row)), (el('summary').hidden = false)
  if (status.card) ADS.fiche.show(status.card, await tracked(status))
  showSeller(status)
})
