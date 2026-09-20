globalThis.ADS = globalThis.ADS || {}

ADS.format = {
  duration(n) {
    if (n <= 0) return "moins d'un jour"
    if (n < 31) return `${n} j`
    // Le mois est une approximation à 30 jours : un reste de 360 à 364 jours y
    // vaut déjà 12, ce qui n'est plus « sous un an » mais un an tout court.
    if (n < 365) {
      const months = Math.floor(n / 30)
      if (months < 12) return `${months} mois`
    }
    const years = Math.floor(n / 365) || 1
    return `${years} an${years > 1 ? 's' : ''}`
  },

  // Là où l'ancienneté est le sujet et non l'alerte, elle se dit sans arrondi
  // grossier : « 4 ans 11 mois » et « 4 ans » ne décrivent pas le même stock.
  spell(n) {
    if (n <= 0) return "moins d'un jour"
    if (n < 31) return `${n} jour${n > 1 ? 's' : ''}`
    let years = Math.floor(n / 365)
    let months = Math.floor((n - years * 365) / 30)
    // Même approximation à 30 jours que `duration` : un reste de 360 à 364
    // jours vaut 12 mois, qu'on reporte sur l'année plutôt que d'afficher « 12
    // mois ».
    if (months >= 12) { years += 1; months = 0 }
    return [years && `${years} an${years > 1 ? 's' : ''}`, months && `${months} mois`]
      .filter(Boolean).join(' ') || `${n} jours`
  },

  // Une durée écrite en toutes lettres, avec son accord. Le panneau affichait
  // « Prix relevé · 1 jours » et « après 1 jours en ligne » : l'accord se
  // recollait au point d'appel, donc il s'oubliait. Il se tient ici, une fois,
  // avec le séparateur de milliers que `number` pose — « 1 810 jours ».
  // Zéro reste au singulier, comme le français le veut : « 0 jour ».
  days(n) {
    return `${ADS.format.number(n)} jour${n > 1 ? 's' : ''}`
  },

  ago(n) {
    if (n <= 0) return "aujourd'hui"
    if (n === 1) return 'hier'
    return `il y a ${ADS.format.duration(n)}`
  },

  // Séparateur de milliers, sans dépendre des données de localisation de
  // l'environnement. Le prix n'est pas le seul nombre long qui s'affiche : un
  // kilométrage se lit avec les mêmes coupures.
  number(n) {
    return String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')
  },

  // Espace insécable avant l'unité : le montant ne se coupe pas en fin de ligne.
  money(n) {
    return `${ADS.format.number(n)}\u00a0€`
  },
}

if (typeof module !== 'undefined') module.exports = ADS.format
