// Monde MAIN : ce script s'exécute dans la page, hors de l'espace `ADS`, et n'y
// touche qu'à `window.fetch`. leboncoin est une application Next.js à Pages
// Router : le bloc `__NEXT_DATA__` n'est écrit qu'au rendu serveur, et la page
// suivante arrive par fetch sans qu'il soit réécrit. On laisse l'appel intact et
// on publie une copie de ce que le navigateur a déjà reçu pour l'utilisateur —
// aucune requête n'est émise ici.
;(() => {
  // Une charge de résultats, pas une fiche : Next préfetche les fiches liées, et
  // leurs annonces similaires ressemblent à s'y méprendre à des résultats.
  const results = (url) =>
    (url.includes('/_next/data/') && !url.includes('/ad/')) || url.includes('/finder/search')

  const carries = (body) => body.includes('"list_id"') && body.includes('"first_publication_date"')

  const publish = (res) =>
    res.text().then((body) => {
      if (carries(body)) dispatchEvent(new CustomEvent('adscope:payload', { detail: body }))
    })

  const inner = window.fetch
  window.fetch = function (...args) {
    const call = inner.apply(this, args)
    // La copie se lit en marge : l'appelant reçoit la réponse d'origine, et une
    // erreur de lecture ne doit pas remonter dans la page.
    call.then((res) => (results(String(res.url || args[0])) ? publish(res.clone()) : null)).catch(() => {})
    return call
  }
})()
