// Monde MAIN : ce script s'exécute dans la page, hors de l'espace `ADS`, et n'y
// touche qu'à `window.fetch`. leboncoin est une application Next.js à Pages
// Router : le bloc `__NEXT_DATA__` n'est écrit qu'au rendu serveur, et la page
// suivante arrive par fetch sans qu'il soit réécrit. On laisse l'appel intact et
// on publie une copie de ce que le navigateur a déjà reçu pour l'utilisateur —
// aucune requête n'est émise ici.
;(() => {
  // Résultats et fiches sont publiés sous deux noms : Next préfetche les fiches
  // liées, et leurs annonces similaires passeraient pour des résultats. Ce qui
  // les sépare est le nom de l'événement, pas l'exclusion de la fiche — elle,
  // c'est le panneau qui l'attend.
  const kind = (url) => {
    if (url.includes('/finder/search')) return 'payload'
    if (!url.includes('/_next/data/')) return null
    return url.includes('/ad/') ? 'detail' : 'payload'
  }

  const carries = (body) => body.includes('"list_id"') && body.includes('"first_publication_date"')

  const publish = (res, name) =>
    res.text().then((body) => {
      if (carries(body)) dispatchEvent(new CustomEvent(`adscope:${name}`, { detail: body }))
    })

  const inner = window.fetch
  window.fetch = function (...args) {
    const call = inner.apply(this, args)
    // La copie se lit en marge : l'appelant reçoit la réponse d'origine, et une
    // erreur de lecture ne doit pas remonter dans la page.
    call
      .then((res) => {
        const name = kind(String(res.url || args[0]))
        return name ? publish(res.clone(), name) : null
      })
      .catch(() => {})
    return call
  }
})()
