// Aides pures pour le mode démo : le `label` que l'API composerait, et le
// filtre texte tolérant de `q`. Séparées de `fixtures.js` pour qu'il tienne
// sous la limite de lignes, et testables seules.

const DIACRITICS = /[\u0300-\u036f]/g

function fold(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(DIACRITICS, '')
}

// Le modèle « Autres » ne veut rien dire au marchand, il saute ; la version
// qui répète le modèle (89 % des annonces, constat du 2026-09-18) ne se
// répète pas deux fois dans le nom.
export function demoLabel(brand, model, version) {
  const modele = model === 'Autres' ? '' : model
  const reste = modele && version.toLowerCase().startsWith(modele.toLowerCase())
    ? version.slice(modele.length).trim()
    : version
  return [brand, modele, reste].filter(Boolean).join(' ')
}

// `q` : chaque mot de la saisie doit se retrouver quelque part dans marque +
// modèle + version, insensible à la casse et aux accents, l'ordre libre.
export function matchesQuery(item, q) {
  const mots = fold(q).split(/\s+/).filter(Boolean)
  if (!mots.length) return true
  const hay = fold([item.brand, item.model, item.version].join(' '))
  return mots.every((mot) => hay.includes(mot))
}
