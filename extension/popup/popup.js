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

const row = (label, value, bad, mark) => {
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
    m.textContent = mark
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

const found = (s) => row('Données trouvées', s.nextData ? 'oui' : 'non', !s.nextData)

// Sur une fiche, la question est « quelle annonce l'extension a-t-elle retenue ».
// L'accord avec l'URL ne mérite qu'une coche ; le désaccord passe la ligne en
// alerte et la note nomme les deux identifiants — c'est le défaut qu'on cherche.
const detailRows = (s) => [
  row('Fiche', s.url),
  found(s),
  row('Annonces dans le bloc', String(s.listings), !s.listings),
  row('Annonce retenue', s.pickedId, !s.matchesUrl, s.matchesUrl ? '\u00a0✓' : '\u00a0≠ URL'),
  row('Vendeur', s.sellerType === 'pro' ? 'professionnel' : 'particulier'),
]

// La source dit d'où viennent les annonces lues : le bloc du rendu serveur, qui
// décrit la première page, ou la charge reçue depuis — c'est ce qui distingue
// une page paginée bien suivie d'une page 1 relue en boucle.
const listingRows = (s) => [
  row('Résultats', s.url),
  found(s),
  row('Source', s.source === 'live' ? 'navigation en cours' : 'chargement initial'),
  row('Annonces lues', String(s.listings), !s.listings),
  row('Pro / particuliers', `${s.pro} / ${s.listings - s.pro}`),
  row('Pastilles posées', String(s.badges), !s.badges),
]

const trouble = (s) => {
  if (!s.nextData) return { text: 'La page ne contient pas le bloc de données attendu — la structure du site a changé.' }
  if (!s.listings) return { text: 'Données présentes mais aucune annonce reconnue.' }
  if (s.kind === 'detail')
    return s.matchesUrl
      ? {}
      : { text: `L'URL désigne l'annonce ${s.urlId}, le panneau décrit ${s.pickedId} : il ne parle pas de l'annonce ouverte.`, bad: true }
  return s.badges ? {} : { text: 'Annonces lues mais aucune carte correspondante : les sélecteurs sont à revoir.' }
}

const diagnose = (status) => {
  const box = el('state')
  if (!status) {
    box.append(hint('Aucune page analysée. Ouvre une liste de résultats ou une annonce voiture sur leboncoin, puis rouvre cette fenêtre.'))
    return
  }
  box.append(...(status.kind === 'detail' ? detailRows(status) : listingRows(status)))
  const { text, bad } = trouble(status)
  if (text) box.append(hint(text, bad))
}

chrome.storage.local.get(['licenseKey', 'apiBase', 'status']).then((stored) => {
  key = stored.licenseKey || ''
  el('api').value = stored.apiBase || 'http://localhost:8000'
  showKey()
  diagnose(stored.status)
})
