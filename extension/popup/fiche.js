globalThis.ADS = globalThis.ADS || {}

// Ce que la page ne montre pas d'une fiche, en une ligne — et le seul geste.
//
// La fenêtre portait l'âge en gros, la courbe de prix, le relevé des
// observations, le suivi et le vendeur : tout cela date d'avant le panneau, qui
// le pose désormais dans la page, sous les yeux du lecteur. Le répéter ici
// n'ajoutait rien et coûtait deux identités visuelles. Reste le résumé qu'on
// cite de mémoire — « 15 jours en ligne · prix inchangé depuis le 19 sept. ».
ADS.fiche = (() => {
  const { el } = ADS.dom
  const { spell, money } = ADS.format

  const day = (v) => new Date(v).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

  // Sans date sur la page, aucun âge n'est énoncé : le dire est le constat,
  // en fabriquer un serait exactement ce que le produit combat.
  const age = (card) =>
    card.onlineDays == null ? 'date absente de la page' : `${spell(card.onlineDays)} en ligne`

  // Depuis quand le prix affiché tient : la plus ancienne observation qui le
  // porte sans interruption. Lu sur le relevé, jamais déduit d'un compte de
  // jours — « depuis le 19 sept. » se cite dans une négociation, « depuis 48 j »
  // se recalcule à chaque fois qu'on le prononce.
  const held = (h) => {
    let at = h[h.length - 1].at
    for (let i = h.length - 1; i > 0 && h[i - 1].price === h[i].price; i--) at = h[i - 1].at
    return at
  }

  // Ce que le relevé mutualisé ajoute, et lui seul : le prix a-t-il cédé depuis
  // qu'on le regarde, et depuis quand celui-ci tient. Sans relevé, rien — une
  // stabilité que personne n'a observée ne s'affirme pas.
  const price = (r) => {
    if (!r) return null
    if (r.price_delta_since_first < 0) {
      return `prix baissé de ${money(r.price_delta_since_first)} depuis le ${day(r.first_seen)}`
    }
    const history = r.price_history || []
    return history.length ? `prix inchangé depuis le ${day(held(history))}` : null
  }

  const line = (card, signals) => [age(card), price(signals)].filter(Boolean).join(' · ')

  // Le suivi est un fait du serveur : le bouton ne se déclare suivi qu'une fois
  // la demande acceptée, et c'est l'appelant qui rejoue le rendu avec l'état
  // que le serveur a rendu.
  const show = (card, signals, act) => {
    el('fiche-line').textContent = line(card, signals)
    const on = !!(signals && signals.followed)
    const button = el('follow')
    button.textContent = on ? 'Suivie' : 'Suivre'
    button.className = on ? 'follow follow--on' : 'follow'
    button.onclick = on ? null : act
    el('fiche').hidden = false
  }

  return { show, line, price }
})()

if (typeof module !== 'undefined') module.exports = ADS.fiche
