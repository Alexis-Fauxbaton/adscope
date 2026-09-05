globalThis.ADS = globalThis.ADS || {}

ADS.format = {
  days(n) {
    if (n <= 0) return "aujourd'hui"
    if (n === 1) return 'hier'
    if (n < 31) return `${n} j`
    const months = Math.floor(n / 30)
    return months < 12 ? `${months} mois` : `${Math.floor(n / 365)} an${n >= 730 ? 's' : ''}`
  },
}
