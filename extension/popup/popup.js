const { rows, trouble, occupancy } = ADS.report
const { el, row, hint, note } = ADS.dom

// La fenêtre ne connaît aucun site : elle demande au registre le nom de celui
// que le diagnostic désigne, et la liste de ceux qu'on couvre.
const named = (id) => (ADS.sites.all().find((s) => s.id === id) || {}).name || ''

const listed = (names) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} ou ${names[names.length - 1]}` : names[0] || ''

// Hors d'une fiche, la fenêtre n'a rien à résumer : ce qu'une page de résultats
// porte, ses pastilles le disent déjà carte par carte.
const showEmpty = () => {
  const where = listed(ADS.sites.all().map((s) => s.name))
  el('empty').textContent =
    `Ouvre une annonce voiture sur ${where} : le relevé s'affiche dans la page, et son résumé ici.`
  el('empty').hidden = false
}

const diagnose = (status) => {
  if (!status) return
  const box = el('state')
  box.append(...rows(status).map(row))
  const { text, bad } = trouble(status)
  if (text) box.append(hint(text, bad))
}

// Le cache, le suivi et l'API sont tenus par le service worker : lui seul sait
// ce qu'il contient, et lui seul choisit Bearer ou cookie de session.
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

// Suivre depuis la fenêtre : le même geste que dans le panneau, et la même
// route — le service worker, jamais un appel propre à la popup. Le bouton ne
// bascule qu'après la réponse : un suivi qui n'a pas pris ne se dit pas pris.
const showFiche = (status, signals) => {
  const follow = async () => {
    const res = await ask({ type: 'follow', site: status.site, siteId: status.pickedId })
    if (res && res.ok) showFiche(status, { ...(signals || {}), followed: true })
  }
  ADS.fiche.show(status.card, signals, follow)
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
  if (!status || status.kind !== 'detail' || !status.card) return showEmpty()
  el('site').textContent = named(status.site)
  showFiche(status, await tracked(status))
})
