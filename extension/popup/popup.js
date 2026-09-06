const { isKey, mask, base, isBase, probe, outcome } = ADS.config
const { rows, trouble, occupancy, summary } = ADS.report
const { el, row, hint, fill } = ADS.dom

const note = (id, tone, text) => {
  const n = el(id)
  n.className = `note ${tone}`
  n.textContent = text
  n.hidden = false
}

let key = ''

const showKey = () => {
  el('key-saved').hidden = !key
  el('key-edit').hidden = Boolean(key)
  if (key) el('key-mask').textContent = mask(key)
}

el('key-save').onclick = async () => {
  const value = el('key').value.trim()
  if (!isKey(value)) return note('key-note', 'bad', 'Format attendu : adsc_ puis 32 caractères hexadécimaux.')
  key = value
  await chrome.storage.local.set({ licenseKey: key })
  el('key-note').hidden = true
  showKey()
}

el('key-replace').onclick = () => {
  key = ''
  el('key').value = ''
  showKey()
}

// Le domaine de production n'est pas connu à la compilation : l'accès se
// demande sur geste — enregistrer en est un, et sans lui rien ne part.
const origins = (apiBase) => ({ origins: [`${new URL(apiBase).origin}/*`] })
const access = (apiBase) => chrome.permissions.request(origins(apiBase)).catch(() => false)
// Sans geste, on ne demande pas : on vérifie ce qui est déjà accordé.
const granted = (apiBase) => chrome.permissions.contains(origins(apiBase)).catch(() => false)

el('api-save').onclick = async () => {
  const value = base(el('api').value)
  if (!isBase(value)) return note('api-note', 'bad', 'Adresse attendue : http(s)://hôte[:port]')
  el('api').value = value
  await chrome.storage.local.set({ apiBase: value })
  if (await access(value)) note('api-note', 'ok', 'Adresse enregistrée.')
  else note('api-note', 'warn', `Adresse enregistrée, mais le navigateur en refuse l’accès : l’extension ne pourra pas joindre ${value}.`)
}

el('test').onclick = async () => {
  const apiBase = base(el('api').value)
  const licenseKey = key || el('key').value.trim()
  if (!isBase(apiBase)) return note('test-note', 'bad', 'Renseigne d’abord une adresse d’API valide.')
  if (!licenseKey) return note('test-note', 'bad', 'Renseigne d’abord une clé de licence.')
  if (!(await access(apiBase))) return note('test-note', 'warn', `Accès à ${apiBase} refusé par le navigateur.`)

  note('test-note', '', 'Test en cours…')
  const r = outcome(await probe(apiBase, licenseKey), apiBase)
  note('test-note', r.tone, r.text)
  el('dot').className = `dot ${r.tone}`
}

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
// La seule demande qui parte sans geste de l'utilisateur, et elle porte la clé
// de licence. Sa destination se vérifie donc comme ailleurs : une adresse bien
// formée, et un accès déjà accordé.
const showSeller = async (status) => {
  if (!status.sellerId || !key) return
  const apiBase = base(el('api').value)
  if (!isBase(apiBase) || !(await granted(apiBase))) return
  const stats = await ADS.seller.fetch(apiBase, key, status.site, status.sellerId)
  const block = ADS.seller.block(stats)
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
  key = stored.licenseKey || ''
  el('api').value = stored.apiBase || 'http://localhost:8000'
  showKey()
  showCache()
  const status = stored.status
  diagnose(status)
  if (!status) return showEmpty()
  el('site').textContent = named(status.site)
  if (status.kind !== 'detail') return fill('summary-rows', summary(status).map(row)), (el('summary').hidden = false)
  if (status.card) ADS.fiche.show(status.card, await tracked(status))
  showSeller(status)
})
