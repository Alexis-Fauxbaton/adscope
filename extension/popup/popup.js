const el = document.getElementById('state')

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

chrome.storage.local.get('status').then(({ status }) => {
  el.textContent = ''
  if (!status) {
    el.append(hint("Aucune page analysée. Ouvre une liste de résultats ou une annonce voiture sur leboncoin, puis rouvre cette fenêtre."))
    return
  }
  el.append(
    row('Page', status.url),
    row('Données trouvées', status.nextData ? 'oui' : 'non', !status.nextData),
    row('Annonces lues', String(status.listings), status.listings === 0),
    row('Professionnelles', String(status.pro)),
    row('Pastilles posées', String(status.badges), status.badges === 0),
  )
  if (!status.nextData) el.append(hint("La page ne contient pas le bloc de données attendu — la structure du site a changé."))
  else if (status.listings === 0) el.append(hint('Données présentes mais aucune annonce reconnue.'))
  else if (status.badges === 0) el.append(hint("Annonces lues mais aucune carte correspondante : les sélecteurs sont à revoir."))
})
