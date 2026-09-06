# Suivi de la pagination

Base : `f656e5e` · commit : `4e4f90d` (un commit voisin, `8ff47ce`, est arrivé sur la
branche pendant le travail : il ne touche pas l'extension).
Suite : 59 tests, tous verts (`cd extension && node --test tests/*.test.mjs`), contre 52
au départ.

## Le défaut

`__NEXT_DATA__` est écrit une fois au rendu serveur. Un clic sur « page suivante »
remplace les cartes et ne le réécrit pas : `ADS.leboncoin.fromDocument` rendait les
annonces de la page 1 pendant que l'écran affichait la page 2, aucun identifiant ne
correspondait à une carte, aucune pastille ne se posait. Défaillance silencieuse.

## Le correctif

**`extension/src/page/tap.js` — monde MAIN, `document_start`.** Il enveloppe
`window.fetch`, retourne la promesse d'origine sans y toucher, et lit en marge une copie
(`res.clone()`) de la réponse déjà reçue par le navigateur. Si le corps porte
`"list_id"` et `"first_publication_date"`, il le republie tel quel — une chaîne, jamais
un objet de la page — par `CustomEvent('adscope:payload')`. Il n'expose rien d'autre sur
`window` et ne connaît pas `ADS`.

**Aucune requête n'est émise.** Le seul `fetch` de l'extension reste celui de
`src/sw.js` vers l'API adscope ; `res.clone().text()` relit un corps déjà en mémoire.
Un test le verrouille : après un appel, le `fetch` d'origine a été appelé une fois, avec
le même argument, et l'appelant reçoit l'objet réponse d'origine.

**Le filtre d'URL est porteur.** Next préfetche les fiches liées depuis une page de
résultats ; leurs annonces similaires ressemblent à s'y méprendre à des résultats et
auraient remplacé la page affichée. Sont retenues les charges `/_next/data/` sans `/ad/`
dans le chemin, et `/finder/search`. Un test couvre la fiche préchargée.

**`extension/src/feed.js` — monde isolé.** Il écoute l'événement, relit la charge par
`ADS.leboncoin.fromPayload` (extrait de `fromDocument`, même lecture pour les deux
sources) et expose `listings(document)` — la dernière charge, sinon le bloc du rendu
serveur —, `source()` et `onData()`.

**`extension/src/listing.js`** peint depuis `ADS.feed.listings` et se rejoue sur
`ADS.feed.onData`, sans dépendre d'un lot de mutations. Le diagnostic est réécrit dès que
l'ensemble des identifiants change, même avant que les cartes soient posées, puis à
nouveau quand elles le sont.

**Le diagnostic** porte l'URL complète (`?page=2`) et la source des annonces ; la popup
affiche « Source : navigation en cours / chargement initial ». C'est la ligne qui dit à
l'œil nu que la correction opère.

## Le second point

`diag.listing` gardait sa règle sans test. Le cas manquant : sur une fiche, les cartes
d'annonces similaires font écrire `listing.js`, qui écrasait le diagnostic de la fiche.
Le test charge `detail.js` puis `listing.js` sur une fiche et exige `kind === 'detail'` ;
il échoue dès qu'on retire `if (urlId(location.pathname)) return`. Vérifié en retirant la
garde. La même vérification a été faite sur `ADS.feed.onData(render)` : sans lui, les
trois tests de pagination tombent.

## Ce qui reste ouvert

1. **Rien n'a été observé dans un vrai navigateur.** Que leboncoin passe bien par `fetch`
   (et non `XMLHttpRequest`) pour `/_next/data/` reste à confirmer sur la page. Si ce
   n'était pas le cas, l'extension retomberait sur son comportement d'aujourd'hui : rien
   ne s'affiche, rien de faux.
2. **Retour arrière.** Une page servie depuis le cache mémoire de Next sans nouvelle
   charge laisserait `latest` sur la page précédente. Les résultats de recherche
   relèvent presque sûrement de `getServerSideProps`, que Next ne met pas en cache — donc
   une charge à chaque retour. À confirmer en navigation réelle ; l'échec resterait
   silencieux.
3. **`ADS.sync` n'envoie qu'une fois par chargement** (`sent`). Les annonces de la page 2
   ne sont donc pas versées au suivi mutualisé et n'en reçoivent pas les signaux : elles
   n'affichent que ce que la page dit. Limite antérieure, inchangée, mais devenue visible
   maintenant que la page 2 est pastillée.
4. **`detail.js` lit toujours `__NEXT_DATA__`.** Le même bloc périmé y pose le même
   problème d'une fiche à l'autre — `tests/dom.test.mjs` le masque en réécrivant le bloc,
   ce qu'une navigation monopage ne fait jamais. Hors périmètre ici : le brancher sur le
   flux demanderait d'accepter les charges de fiche, donc de rouvrir le filtre. À traiter
   à part.
