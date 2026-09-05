const { isKey, mask, base, isBase, probe, outcome } = ADS.config

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

const row = (label, value, bad) => {
  const d = document.createElement('div')
  d.className = 'row'
  const l = document.createElement('span')
  l.textContent = label
  const v = document.createElement('span')
  v.textContent = value
  if (bad) v.className = 'bad'
  d.append(l, v)
  return d
}

const hint = (text) => {
  const d = document.createElement('div')
  d.className = 'hint'
  d.textContent = text
  return d
}

const diagnose = (status) => {
  const box = el('state')
  if (!status) {
    box.append(hint('Aucune page analysée. Ouvre une liste de résultats ou une annonce voiture sur leboncoin, puis rouvre cette fenêtre.'))
    return
  }
  box.append(
    row('Page', status.url),
    row('Données trouvées', status.nextData ? 'oui' : 'non', !status.nextData),
    row('Annonces lues', String(status.listings), status.listings === 0),
    row('Professionnelles', String(status.pro)),
    row('Pastilles posées', String(status.badges), status.badges === 0),
  )
  if (!status.nextData) box.append(hint('La page ne contient pas le bloc de données attendu — la structure du site a changé.'))
  else if (status.listings === 0) box.append(hint('Données présentes mais aucune annonce reconnue.'))
  else if (status.badges === 0) box.append(hint('Annonces lues mais aucune carte correspondante : les sélecteurs sont à revoir.'))
}

chrome.storage.local.get(['licenseKey', 'apiBase', 'status']).then((stored) => {
  key = stored.licenseKey || ''
  el('api').value = stored.apiBase || 'http://localhost:8000'
  showKey()
  diagnose(stored.status)
})
