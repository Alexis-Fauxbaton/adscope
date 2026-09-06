const { isKey, mask, base, isBase, probe, outcome } = ADS.config
const { rows, trouble, occupancy } = ADS.report

const el = (id) => document.getElementById(id)

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
  else el('key').focus()
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

// Le domaine de production n'est pas connu à la compilation : l'accès à
// l'adresse configurée se demande sur geste de l'utilisateur — enregistrer
// en est un, et sans cet accès l'extension ne peut rien envoyer.
const access = (apiBase) =>
  chrome.permissions.request({ origins: [`${new URL(apiBase).origin}/*`] }).catch(() => false)

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

const line = ({ label, value, bad, mark }) => {
  const d = document.createElement('div')
  d.className = 'row'
  const l = document.createElement('span')
  l.textContent = label
  const v = document.createElement('span')
  v.textContent = value
  if (bad) v.className = 'bad'
  if (mark) {
    const m = document.createElement('span')
    m.className = 'mark'
    m.textContent = ` ${mark.trim()}`
    v.append(m)
  }
  d.append(l, v)
  return d
}

const hint = (text, bad) => {
  const d = document.createElement('div')
  d.className = 'hint' + (bad ? ' bad' : '')
  d.textContent = text
  return d
}

const diagnose = (status) => {
  const box = el('state')
  if (!status) {
    box.append(hint('Aucune page analysée. Ouvre une liste de résultats ou une annonce voiture sur leboncoin, puis rouvre cette fenêtre.'))
    return
  }
  box.append(...rows(status).map(line))
  const { text, bad } = trouble(status)
  if (text) box.append(hint(text, bad))
}

// Ce que la fiche ouverte ne dit pas : le stock du marchand. La demande à
// l'API est elle-même la mesure d'usage de la fonctionnalité — rien d'autre
// n'est à collecter.
const lead = (text) => {
  const d = document.createElement('div')
  d.className = 'lead'
  d.textContent = text
  return d
}

const showSeller = async (status) => {
  if (!status || status.kind !== 'detail' || !status.sellerId) return
  const stats = await ADS.seller.fetch(
    base(el('api').value), key, status.site || 'lbc', status.sellerId,
  )
  const block = ADS.seller.block(stats)
  if (!block) return
  el('seller-title').textContent = block.title
  const box = el('seller')
  // La portée avant les chiffres : elle dit de quelle population ils sortent.
  box.replaceChildren(lead(block.lead), hint(block.scope), ...block.rows.map(line))
  if (block.note) box.append(hint(block.note))
  el('seller-box').hidden = false
}

// Le cache est tenu par le service worker : lui seul sait ce qu'il contient.
const ask = (msg) => chrome.runtime.sendMessage(msg).catch(() => null)

const showCache = async () => {
  const stats = await ask({ type: 'cache-stats' })
  const box = el('cache')
  box.replaceChildren(stats ? line(occupancy(stats)) : hint('Cache illisible.'))
}

el('cache-clear').onclick = async () => {
  await ask({ type: 'cache-clear' })
  await showCache()
  note('cache-note', 'ok', 'Cache vidé. Les signaux reviendront de l’API à la prochaine page.')
}

chrome.storage.local.get(['licenseKey', 'apiBase', 'status']).then((stored) => {
  key = stored.licenseKey || ''
  el('api').value = stored.apiBase || 'http://localhost:8000'
  showKey()
  diagnose(stored.status)
  showCache()
  showSeller(stored.status)
})
