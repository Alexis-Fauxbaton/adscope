// Le fait, en clair. Une annonce qui a bougé porte une phrase et une seule en
// grand ; ce qui a bougé en plus se dit dessous, à voix basse.
//
// Jamais « vendue » : une annonce disparaît, on ignore pourquoi.

import { shortDate, signedMoney } from './format.js'

function priceFact(changes) {
  if (!changes || !changes.length) return null
  const total = changes.reduce((sum, c) => sum + (c.to - c.from), 0)
  if (total === 0) return null
  const last = changes[changes.length - 1]
  const kind = total < 0 ? 'dropped' : 'raised'
  if (changes.length === 1) {
    return { kind, text: `${signedMoney(total)} le ${shortDate(last.at)}` }
  }
  const word = total < 0 ? 'baisses' : 'changements'
  return {
    kind,
    text: `${signedMoney(total)} en ${changes.length} ${word}, ` +
      `le dernier le ${shortDate(last.at)}`,
  }
}

function crossedFact(item) {
  const seuil = item.flags && item.flags.crossed
  if (!seuil) return null
  return { kind: 'crossed', text: `a franchi ${seuil} jours en ligne` }
}

function goneFact(item) {
  if (!item.flags || !item.flags.disappeared) return null
  if (!item.disappeared_at) return { kind: 'disappeared', text: 'a disparu' }
  return {
    kind: 'disappeared',
    text: `a disparu le ${shortDate(item.disappeared_at)}`,
  }
}

// Une disparition prime sur tout : le reste décrit une annonce qui n'est plus
// là. Vient ensuite le prix, que le marchand vient chercher, puis le seuil
// d'ancienneté, qui se serait de toute façon franchi tout seul.
export function factsOf(item) {
  return [goneFact(item), priceFact(item.changes), crossedFact(item)]
    .filter(Boolean)
}

export function hasMoved(item) {
  return factsOf(item).length > 0
}
