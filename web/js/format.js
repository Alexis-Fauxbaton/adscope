// Mise en forme, côté site. Les règles sont celles de `extension/src/format.js` :
// un même chiffre ne se dit pas de deux façons selon qu'on le lit sur la fiche
// ou dans la vue du matin.

const THIN = ' '   // espace fine insécable, séparateur de milliers
const NBSP = ' '   // espace insécable, avant l'unité
const MINUS = '−'  // vrai signe moins, pas un trait d'union

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

// Séparateur de milliers posé à la main : la mise en forme ne dépend pas des
// données de localisation de l'environnement, qui varient d'un navigateur à
// l'autre et d'une machine de capture à l'autre.
export function number(n) {
  return String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, THIN)
}

export function money(n) {
  return `${number(n)}${NBSP}€`
}

// Une variation se lit avec son signe. Zéro n'est pas une variation : il se dit
// sans signe, sinon « +0 € » se lirait comme une hausse.
export function signedMoney(n) {
  const rounded = Math.round(n)
  if (rounded === 0) return money(0)
  return `${rounded < 0 ? MINUS : '+'}${money(rounded)}`
}

// L'ancienneté dite en toutes lettres. Le mois est une approximation à 30
// jours : un reste de 360 à 364 jours y vaut déjà 12, ce qui n'est plus « sous
// un an » mais un an tout court — on le reporte sur l'année plutôt que
// d'écrire « 12 mois ».
export function spellAge(days) {
  if (days <= 0) return "moins d'un jour"
  if (days < 31) return `${days} jour${days > 1 ? 's' : ''}`
  let years = Math.floor(days / 365)
  let months = Math.floor((days - years * 365) / 30)
  if (months >= 12) { years += 1; months = 0 }
  return [years && `${years} an${years > 1 ? 's' : ''}`, months && `${months} mois`]
    .filter(Boolean).join(' ') || `${days} jours`
}

// Les horodatages viennent de l'API en UTC ; ils se lisent en UTC. Un fuseau
// pris sur la machine de capture ferait glisser une date d'un jour selon
// l'heure à laquelle la capture tourne.
function parts(iso) {
  const d = new Date(iso)
  return { day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear() }
}

export function shortDate(iso) {
  const { day, month } = parts(iso)
  return `${day === 1 ? '1er' : day} ${MONTHS_SHORT[month]}`
}

export function longDate(iso) {
  const { day, month, year } = parts(iso)
  return `${day === 1 ? '1er' : day} ${MONTHS[month]} ${year}`
}

export function kilometres(n) {
  return `${number(n)}${NBSP}km`
}

// Le titre d'une annonce : marque, modèle, version quand le site l'a donnée —
// elle ne l'est que sur une annonce sur trois, et l'absence ne se comble pas.
// C'est aussi le repli de `vehicleLabel` : une API pas encore mise à jour ne
// sert pas `label`, et la carte doit quand même nommer le véhicule.
export function vehicleTitle(item) {
  return [item.brand, item.model, item.version].filter(Boolean).join(' ')
}

// Le nom propre du véhicule, composé côté API à un seul endroit (répétitions
// et « Autres » nettoyés). Une API plus ancienne ne le sert pas encore : le
// repli reprend l'ancienne composition plutôt que de laisser un trou.
export function vehicleLabel(item) {
  return item.label || vehicleTitle(item)
}

// Le même repli, mais sans la version : c'est la composition que « Mes
// suivis » utilisait avant `label`, gardée pour les API qui ne le servent pas.
export function vehicleShortLabel(item) {
  return item.label || [item.brand, item.model].filter(Boolean).join(' ')
}

// Les codes sont ceux que la base porte et que l'extension pose
// (`extension/src/sites/*.js`), les noms ceux que les sites s'écrivent à
// eux-mêmes. Un code inconnu s'affiche tel quel : mieux vaut « lbc » qu'un
// blanc, ou qu'un nom inventé.
const SITES = { lbc: 'leboncoin', lc: 'La Centrale' }

export function siteLabel(site) {
  return SITES[site] || site
}

export function vehicleLine(item) {
  return [item.year, item.mileage != null && kilometres(item.mileage),
    siteLabel(item.site)].filter(Boolean).join(' · ')
}
