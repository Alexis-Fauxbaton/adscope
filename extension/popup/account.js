globalThis.ADS = globalThis.ADS || {}

// La configuration de compte de la popup, séparée du reste (state.js
// n'existe pas encore ce qu'il faut dire) pour tenir popup.js sous 150
// lignes : la clé de machine (repliée, réservée), l'adresse de l'API, et
// l'état connecté/déconnecté qu'elle affiche à la place d'une clé humaine.
ADS.account = (() => {
  const { isKey, mask, base, isBase, probe, outcome } = ADS.config
  const DEFAULT_BASE = 'https://adscope-api.onrender.com'
  const { el, note } = ADS.dom

  let key = ''
  let connected = false

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

  // Le champ vidé rend l'adresse par défaut : une valeur posée à la main
  // (« localhost » du temps du développement) s'oublie sans rien avoir à taper.
  el('api-save').onclick = async () => {
    if (!el('api').value.trim()) {
      await chrome.storage.local.remove('apiBase')
      el('api').value = DEFAULT_BASE
      return note('api-note', 'ok', `Adresse par défaut rétablie : ${DEFAULT_BASE}.`)
    }
    const value = base(el('api').value)
    if (!isBase(value)) return note('api-note', 'bad', 'Adresse attendue : http(s)://hôte[:port]')
    el('api').value = value
    await chrome.storage.local.set({ apiBase: value })
    if (await access(value)) note('api-note', 'ok', 'Adresse enregistrée.')
    else note('api-note', 'warn', `Adresse enregistrée, mais le navigateur en refuse l’accès : l’extension ne pourra pas joindre ${value}.`)
  }

  // Ouvrir l'application sur le site, dans un nouvel onglet : `window.open`
  // reste dans les gestes qu'une popup fait déjà sans permission propre, à la
  // différence de `chrome.tabs.create`. Même bouton, connecté ou non : c'est
  // le seul geste qu'un humain fait ici — se connecter, ou revoir son compte.
  // Sans session, il pointe droit sur la page Connexion plutôt que sur
  // l'application (qui n'y ferait que rediriger).
  const openApp = () => {
    const apiBase = base(el('api').value)
    if (isBase(apiBase)) window.open(`${apiBase}/app${connected ? '' : '/#/connexion'}`, '_blank')
    return isBase(apiBase)
  }

  el('open-app').onclick = openApp

  // Ce que la popup montre à la place d'une clé : qui est connecté. Passe par
  // le service worker — lui seul sait Bearer ou cookie de session — jamais une
  // clé lue ici, pour rester vrai même quand aucune n'est configurée.
  const showAccount = (me) => {
    connected = Boolean(me && me.ok && me.email)
    el('account').textContent = connected ? me.email : ''
    el('account').hidden = !connected
    el('open-app').textContent = connected ? 'Ouvrir adscope' : 'Se connecter'
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

  // Amorce : ce que le stockage rend au chargement — la clé et l'adresse.
  const init = (stored) => {
    key = stored.licenseKey || ''
    el('api').value = stored.apiBase || DEFAULT_BASE
    showKey()
  }

  return { init, showAccount, openApp }
})()

if (typeof module !== 'undefined') module.exports = ADS.account
