globalThis.ADS = globalThis.ADS || {}

ADS.format = {
  duration(n) {
    if (n <= 0) return "moins d'un jour"
    if (n < 31) return `${n} j`
    if (n < 365) return `${Math.floor(n / 30)} mois`
    const years = Math.floor(n / 365)
    return `${years} an${years > 1 ? 's' : ''}`
  },

  ago(n) {
    if (n <= 0) return "aujourd'hui"
    if (n === 1) return 'hier'
    return `il y a ${ADS.format.duration(n)}`
  },

  // Séparateur de milliers et espace insécable avant l'unité, sans dépendre
  // des données de localisation de l'environnement.
  money(n) {
    const digits = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')
    return `${digits}\u00a0€`
  },
}

if (typeof module !== 'undefined') module.exports = ADS.format
