globalThis.ADS = globalThis.ADS || {}

// Joignable ou non. Trois issues à un appel, qui ne disent pas la même chose :
// `fetch` qui rejette — il n'y a personne au bout — ; une réponse 5xx — il y a
// quelqu'un, mais il va mal ; toute autre réponse, 401 comprise — le serveur
// est là, il répond, même pour dire non. Un 401 doit donc effacer
// « injoignable » : dire « reconnectez-vous » et « injoignable » à la fois,
// c'est ne rien dire.
//
// La règle, pour qu'un 5xx passager ne fasse pas clignoter une alerte : **deux
// échecs consécutifs, et le premier remonte à au moins trente secondes**. Une
// page de résultats produit ses lots de mutations en rafale, et sync.js n'y
// oppose qu'une pause de trente secondes : sans le délai, trois échecs dans la
// même seconde suffiraient à décréter le serveur mort. Une seule réussite
// remet le compteur à zéro.
//
// L'instant et le compteur sont injectables : `now` est un paramètre, `reset`
// pose l'état de départ. Aucun test n'a à lire l'horloge réelle.
ADS.reach = (() => {
  const FAILS = 2
  const SPAN_MS = 30000

  let count = 0
  let since = 0

  const tell = async (down) => {
    ADS.health.note({ kind: 'unreachable' }, down)
    await ADS.health.show()
    return down
  }

  // Rien n'est revenu : réseau coupé, serveur arrêté, adresse fausse.
  const broke = (now = Date.now()) => {
    if (!count) since = now
    count++
    return tell(count >= FAILS && now - since >= SPAN_MS)
  }

  // Une réponse est arrivée. 5xx compte comme une panne — mais une panne de
  // plus, pas une alerte à elle seule.
  const answered = (status, now = Date.now()) => {
    if (status >= 500) return broke(now)
    count = 0
    since = 0
    return tell(false)
  }

  const reset = (c = 0, s = 0) => {
    count = c
    since = s
  }

  return { broke, answered, reset, counts: () => ({ count, since }) }
})()

if (typeof module !== 'undefined') module.exports = ADS.reach
