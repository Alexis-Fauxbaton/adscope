globalThis.ADS = globalThis.ADS || {}

// Ce que la popup a à dire de la dernière page lue, sans toucher au document :
// des lignes, une éventuelle explication. Le rendu est l'affaire de popup.js.
ADS.report = (() => {
  // Le site dit lui-même si sa charge est là ; la fenêtre ne fait que le rendre.
  const found = (s) => ({ label: 'Données trouvées', value: s.payload ? 'oui' : 'non', bad: !s.payload })

  // La source dit d'où viennent les annonces lues : le bloc du rendu serveur,
  // qui décrit la page d'entrée, ou la charge reçue depuis — c'est ce qui
  // distingue une navigation bien suivie d'une première page relue en boucle.
  const from = (s) => ({
    label: 'Source',
    value: s.source === 'live' ? 'navigation en cours' : 'chargement initial',
  })

  const origins = (s) => ({ cache: 0, network: 0, ...(s.sources || {}) })

  // Le cache et le réseau ne disent pas la même chose : l'un montre ce qu'on
  // savait, l'autre ce que le pool sait à l'instant. Confondus, une API muette
  // passerait pour une API qui répond.
  const signals = (s) => {
    const { cache, network } = origins(s)
    return {
      label: 'Signaux affichés',
      value: `${cache} du cache · ${network} du réseau`,
      bad: !cache && !network,
    }
  }

  const sent = (s) => ({
    label: "Transmises depuis l'ouverture",
    // Zéro n'est un défaut que si le cache n'a rien servi non plus : une page
    // dont toutes les annonces sont fraîches n'a rien à transmettre, c'est
    // exactement ce qu'on attend d'elle.
    value: String(s.sent ?? 0),
    bad: !s.sent && !origins(s).cache,
  })

  // Sur une fiche, la question est « quelle annonce l'extension a-t-elle
  // retenue ». L'accord avec l'URL ne mérite qu'une coche ; le désaccord passe
  // la ligne en alerte — c'est le défaut qu'on cherche.
  const detail = (s) => [
    { label: 'Fiche', value: s.url },
    found(s),
    from(s),
    { label: 'Annonces connues', value: String(s.listings), bad: !s.listings },
    {
      label: 'Annonce retenue', value: s.pickedId, bad: !s.matchesUrl,
      mark: s.matchesUrl ? ' ✓' : ' ≠ URL',
    },
    signals(s),
    { label: 'Vendeur', value: s.sellerType === 'pro' ? 'professionnel' : 'particulier' },
  ]

  const listing = (s) => [
    { label: 'Résultats', value: s.url },
    found(s),
    from(s),
    { label: 'Annonces lues', value: String(s.listings), bad: !s.listings },
    // L'écart entre ce que la charge porte et ce que la page montre : sans lui,
    // « 29 lues, 23 pastilles » ressemblait à un défaut de sélecteurs.
    { label: 'En réserve, sans carte', value: String(s.unshown ?? 0) },
    { label: 'Pro / particuliers', value: `${s.pro} / ${s.listings - s.pro}` },
    { label: 'Pastilles posées', value: String(s.badges), bad: !s.badges },
    signals(s),
    sent(s),
  ]

  const rows = (s) => (s.kind === 'detail' ? detail(s) : listing(s))

  const trouble = (s) => {
    if (!s.payload) return { text: 'La page ne contient pas le bloc de données attendu — la structure du site a changé.' }
    if (!s.listings) return { text: 'Données présentes mais aucune annonce reconnue.' }
    if (s.kind === 'detail' && !s.matchesUrl) {
      return {
        text: `L'URL désigne l'annonce ${s.urlId}, le panneau décrit ${s.pickedId} : il ne parle pas de l'annonce ouverte.`,
        bad: true,
      }
    }
    if (s.kind !== 'detail' && !s.badges) {
      return { text: 'Annonces lues mais aucune carte correspondante : les sélecteurs sont à revoir.' }
    }
    const { cache, network } = origins(s)
    if (!cache && !network) {
      return { text: "Aucun signal, ni du cache ni de l'API : vérifie la clé de licence et l'adresse.", bad: true }
    }
    return {}
  }

  const size = (n) =>
    n < 1024 ? `${n} o` : n < 1048576 ? `${Math.round(n / 1024)} Ko` : `${Math.round(n / 1048576)} Mo`

  // Le quota est celui par défaut : `unlimitedStorage` n'est pas demandée. Le
  // taux se lit ici pour que l'approche du plafond ne soit pas une surprise.
  const occupancy = ({ entries, bytes, quota }) => ({
    label: 'Cache',
    value: entries
      ? `${entries} annonce${entries > 1 ? 's' : ''} · ${size(bytes)}${quota ? ` sur ${size(quota)}` : ''}`
      : 'vide',
    bad: Boolean(quota) && bytes / quota > 0.9,
  })

  return { rows, trouble, occupancy }
})()

if (typeof module !== 'undefined') module.exports = ADS.report
