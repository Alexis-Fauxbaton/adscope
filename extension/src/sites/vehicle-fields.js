globalThis.ADS = globalThis.ADS || {}

// Ce qui revient sur les deux sites : traduire une valeur vers un vocabulaire
// fermé, retrouver un attribut par clé dans une liste, dériver un département
// d'un code postal complet. Les tables elles-mêmes — ce que chaque site écrit
// et dans quelle langue — vivent dans le module qui les a relevées.
ADS.vehicleFields = (() => {
  // Une valeur absente de la table part telle qu'observée (ou via `fallback`) :
  // c'est l'appelant qui décide quoi en faire, jamais ce module qui invente.
  const canon = (table, raw, fallback = raw) => {
    if (raw === null || raw === undefined || raw === '') return null
    const hit = table[raw]
    return hit !== undefined ? hit : fallback
  }
  const attrOf = (attrs, key) => (attrs || []).find((a) => a.key === key)
  // Un attribut `{value, value_label}` : traduit par son code, replié sur son
  // libellé humain si la table ne le connaît pas.
  const numeric = (table, attr) => (attr ? canon(table, attr.value, attr.value_label || attr.value) : null)

  const zipOf = (v) => (typeof v === 'string' && /^\d{5}$/.test(v) ? v : null)

  // Département à partir d'un code postal complet : Corse en 2A/2B selon le
  // seuil 20200, DOM sur 3 chiffres (971..976), 2 chiffres sinon. Règle
  // standard française usuelle, non vérifiée sur une annonce corse réelle.
  const department = (zip) => {
    if (!zipOf(zip)) return null
    const dom = zip.slice(0, 3)
    if (dom >= '971' && dom <= '976') return dom
    if (zip.slice(0, 2) === '20') return Number(zip) < 20200 ? '2A' : '2B'
    return zip.slice(0, 2)
  }
  // Le département déduit du code postal complet quand il y en a un, sinon le
  // repli déjà donné par la page — jamais un nom de ville seul. Le code postal
  // complet, lui, ne sort que pour un vendeur professionnel : pour un
  // particulier, il désigne une commune précise sur une donnée qu'adscope ne
  // doit pas garder (audit offensif, angle extension, T4) — `pro` vient de
  // l'appelant, qui seul sait le type de vendeur.
  const withZip = (zip, fallback, pro) => {
    const z = zipOf(zip)
    return { department: z ? department(z) : (fallback || null), postalCode: pro ? z : null }
  }

  return { canon, attrOf, numeric, department, withZip }
})()

if (typeof module !== 'undefined') module.exports = ADS.vehicleFields
