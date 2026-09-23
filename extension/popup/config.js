globalThis.ADS = globalThis.ADS || {}

// Trois pannes possibles, trois réparations différentes : mauvaise clé,
// mauvaise adresse, serveur éteint. La popup doit les séparer nettement.
ADS.config = (() => {
  const KEY = /^adsc_[0-9a-f]{32}$/

  const isKey = (k) => KEY.test(k.trim())
  const mask = (k) => `${k.trim().slice(0, 13)}…`
  const base = (u) => u.trim().replace(/\/+$/, '')
  // `new URL(v).origin`, pas la seule forme de l'adresse : `v` peut porter des
  // identifiants avant l'hôte (`https://api.adscope.fr@evil.example`), une
  // adresse qui ressemble à la bonne et pointe ailleurs — le champ envoie la
  // clé de licence à qui lit `v`, jamais à qui lit son origine réelle (audit
  // offensif, angle extension, T2). L'origine reconstruite doit retomber
  // exactement sur `v` : aucun composant qu'une origine ne porte pas (identifiants,
  // chemin, requête, fragment) ne doit s'y cacher.
  const isBase = (u) => {
    const v = base(u)
    if (!/^https?:\/\//.test(v)) return false
    try {
      return new URL(v).origin === v
    } catch {
      return false
    }
  }

  const probe = async (apiBase, licenseKey, f = fetch) => {
    let res
    try {
      res = await f(`${base(apiBase)}/v1/me`, { headers: { Authorization: `Bearer ${licenseKey}` } })
    } catch {
      return { state: 'unreachable' }
    }
    if (res.status === 401 || res.status === 403) return { state: 'refused' }
    if (!res.ok) return { state: 'unreachable', status: res.status }
    const body = await res.json().catch(() => null)
    // Un 200 qui ne porte pas la réponse de /v1/me (page d'accueil, portail
    // captif, corps réduit à « ok ») dit une adresse erronée, pas une licence
    // valide. Le corps est du JSON quelconque : rien ne garantit un objet.
    if (!body || typeof body !== 'object' || !('label' in body)) return { state: 'unreachable' }
    return { state: 'ok', label: body.label, expiresAt: body.expires_at }
  }

  const until = (iso) => {
    const d = new Date(iso)
    return isNaN(d) ? '' : ` · jusqu'au ${d.toLocaleDateString('fr-FR')}`
  }

  const outcome = (r, apiBase) => {
    if (r.state === 'ok') {
      return { tone: 'ok', text: `Licence valide — ${r.label || 'sans libellé'}${r.expiresAt ? until(r.expiresAt) : ''}` }
    }
    if (r.state === 'refused') {
      return { tone: 'bad', text: 'Licence refusée : clé inconnue ou révoquée. L’API répond bien.' }
    }
    return {
      tone: 'warn',
      text: r.status
        ? `API en erreur (HTTP ${r.status}) sur ${base(apiBase)}.`
        : `API injoignable sur ${base(apiBase)} : adresse erronée ou serveur arrêté.`,
    }
  }

  return { isKey, mask, base, isBase, probe, outcome }
})()

if (typeof module !== 'undefined') module.exports = ADS.config
