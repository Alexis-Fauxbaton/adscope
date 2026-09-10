globalThis.ADS = globalThis.ADS || {}

// Les deux lectures que la fiche demande en plus de son suivi. Elles se font
// ici parce que le content script ne peut pas les faire : sa requête partirait
// avec l'origine du site ouvert.
//
// Les segments viennent de la charge d'une page tierce — c'est le site ouvert
// qui les écrit, jamais nous : interpolés tels quels, un `?`, un `#` ou un `/`
// déplacerait le chemin appelé. Encodés, ils restent un segment chacun. Le
// point, lui, n'est pas réservé : `encodeURIComponent('..')` rend `..`, que
// l'analyseur d'URL résout avant l'appel. Aucun identifiant ne porte ce nom —
// la demande n'est pas faite.
ADS.lookup = (() => {
  const DOTS = /^\.+$/

  const segment = (s) => {
    const encoded = encodeURIComponent(String(s))
    return DOTS.test(encoded) ? null : encoded
  }

  const get = async (parts, { apiBase, licenseKey }) => {
    if (!licenseKey) return null
    const path = parts.map(segment)
    if (path.some((p) => p === null)) return null
    const res = await fetch(`${apiBase}/v1/${path.join('/')}`, {
      headers: { Authorization: `Bearer ${licenseKey}` },
    })
    // Une annonce inconnue de la base rend 404 : ce n'est pas une panne, c'est
    // une réponse — le panneau se passe de la section, il ne l'invente pas.
    return res.ok ? res.json() : null
  }

  const comparables = async (site, siteId, cfg) => ({
    ok: true,
    comparables: await get(['listings', site, siteId, 'comparables'], cfg),
  })

  const seller = async (site, sellerId, cfg) => ({ ok: true, stats: await get(['sellers', site, sellerId], cfg) })

  return { comparables, seller }
})()

if (typeof module !== 'undefined') module.exports = ADS.lookup
