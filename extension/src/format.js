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
}

if (typeof module !== 'undefined') module.exports = ADS.format
