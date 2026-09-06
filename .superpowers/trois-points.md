# Trois points relevés en revue

SHA de départ : `74d614f659cbec3110c30dab8155215c9bc776ee` (branche `feat/api`).
Suite : 226 tests d'extension verts (218 au départ), 149 tests d'API verts.
`popup/`, `crawler/`, `scripts/` et les .html de la racine n'ont pas été touchés.

## Comment les mesures ont été prises

Deux dispositifs, parce qu'aucun ne suffisait seul.

**Le coût** se mesure sur les pages sauvegardées de la racine, servies en HTTP local et
ouvertes dans le Chromium de Playwright. Les modules du site y sont chargés tels quels et
chronométrés sur le vrai DOM.

**La fréquence des lots** ne s'y mesure pas : une page sauvegardée est un instantané du
DOM, ses scripts ne retrouvent pas leur API, l'application ne tourne plus. Vingt secondes
d'observation sur les deux pages enregistrées donnent **zéro lot de mutations** — un
artefact de l'enregistrement, pas une propriété du site. La fréquence a donc été prise sur
une page **réelle**, dans un navigateur piloté.

**lacentrale.fr refuse le navigateur automatisé** : 403 à l'arête, sur la page de résultats
comme sur l'accueil, aussi bien en Playwright direct qu'à travers le navigateur du MCP. La
fréquence des lots est donc mesurée sur leboncoin. C'est la limite de ce rapport, et elle
est assumée : les deux sites sont des applications Next.js de même facture, mais le chiffre
qui suit vient de l'un des deux seulement.

---

## Point 1 — la réextraction à chaque lot

### Ce que la mesure dit

**La rafale existe.** Sur une page de résultats leboncoin réelle, observateur posé comme
celui de l'extension (`childList` + `subtree` sur `document.body`, après `load`, donc à
l'instant du `document_idle` du manifeste) :

| moment | lots | pointe sur une seconde glissante |
| --- | --- | --- |
| chargement + 3,5 s | 34 | **29** |
| navigation monopage vers la page 2, + 16 s | 5 | 4 |
| 10 s au repos | 0 | 0 |

Une session de lecture avec défilement, 37,8 s : 27 lots, 0,71/s en moyenne, pointe à 11
sur une seconde, écart minimal entre deux lots 0,1 ms.

La forme compte plus que la moyenne. **Au repos, rien.** La dépense se concentre dans la
seconde du chargement — le moment où la page est déjà occupée et où le lecteur attend.

**Le coût, lui, se décompose,** et c'est là que la décision se joue. Sur la page de
résultats La Centrale sauvegardée (95 scripts, 1 Mo de code en ligne), médiane sur 20 à 200
répétitions :

| geste | ms |
| --- | --- |
| `fromDocument` complet | 3,46 |
| dont l'analyse des blobs (`fromScripts` sur les textes déjà lus) | 3,42 |
| sélectionner les scripts et lire tous leurs `textContent` | 0,018 |
| construire une signature (compte + longueurs) | **0,018** |

Lire 1 Mo de texte de script est gratuit. Tout le coût est dans la découpe des objets et
les `JSON.parse`. **Une signature coûte 0,5 % d'une extraction** — deux cents fois moins.

### La décision

Corriger. 29 lots dans la seconde du chargement × 3,46 ms font ~100 ms de calcul dans la
pire seconde de la page, et le remède se paie 0,018 ms. Le rapport décide, pas l'intuition :
à fréquence faible on aurait laissé tel quel, à ce rapport-là on n'a pas d'excuse.

Et le cas La Centrale est le pire des deux : leboncoin publie ses charges par le monde MAIN,
`ADS.feed` retient la dernière dans `latest`, et l'extraction du bloc de page ne se refait
plus. La Centrale n'a pas de sonde — `fromPayload` n'existe pas pour elle — donc `latest`
reste nul et **chaque lot repayait les 3,46 ms**.

### Le correctif

`extension/src/feed.js` : un mémo indexé sur la signature des scripts, devant `listings()`.

    let signed = null
    let held = []
    const reread = (doc) => {
      let now = ''
      for (const s of doc.querySelectorAll('script')) if (s.textContent) now += s.textContent.length + ','
      if (now !== signed) {
        signed = now
        held = fromDocument(doc)
      }
      return held
    }

**Le détail qui décide de tout : les scripts vides sont écartés.** La première signature
comptait tous les `<script>`, y compris les balises `src=` que la régie publicitaire et la
mesure d'audience injectent sans arrêt. Mesuré sur deux pages réelles, cette version-là ne
tenait presque rien :

| signature | page de résultats (82 lots) | fiche (108 lots) |
| --- | --- | --- |
| tous les scripts | 22 extractions | 39 extractions |
| **scripts porteurs de texte** | **5** | **4** |

Passer de « 22 sur 82 » à « 5 sur 82 » n'est pas un raffinement : sans cet écart, le mémo
n'aurait supprimé que 43 % des extractions et n'aurait pas mérité son existence. La leçon
est que le mémo doit signer *ce que l'extracteur lit*, pas ce que la page contient.

Le mémo est posé sur `listings()` seul, pas sur `details()` : la fiche est déjà protégée par
le retour anticipé de `detail.js`, que ses tests verrouillent à une extraction pour vingt
lots. Y ajouter le mémo aurait fait passer ces compteurs de 1 à 2 balayages sans rien
gagner.

### Le gain, mesuré

Sur la page de résultats La Centrale sauvegardée, le `render` que l'observateur appelle,
chronométré seul sur 100 appels, avec les modules réels :

| | médiane par lot | 100 lots |
| --- | --- | --- |
| sans le mémo | 4,0 ms | 399 ms |
| **avec le mémo** | **0,4 ms** | **42 ms** |

Dix fois moins, 3,6 ms rendus à chaque lot. Rapporté à la rafale mesurée, la pire seconde
d'un chargement tombe de ~116 ms à ~12 ms.

### Les tests

`tests/lacentrale-payload.test.mjs` — « les résultats ne sont pas réextraits à chaque lot de
mutations » : vingt lots, une extraction. Rouge sur `listings: (doc) => latest || reread(doc)`
de `src/feed.js` — rendu à `fromDocument(doc)`, il compte vingt-et-une extractions.

« une charge réécrite est relue » : un script réécrit fait retomber la signature. Rouge si
`if (now !== signed)` devient `if (signed === null)`, c'est-à-dire sur un mémo qui ne
s'effacerait jamais.

`tests/feed.test.mjs` — « le bloc du rendu serveur est lu une fois, pas à chaque lot » : le
même verrou sur l'autre site. Il a demandé une correction du décor : `tests/world.mjs`
laissait son `__NEXT_DATA__` **hors du corps**, donc la signature y était vide et constante
et le mémo n'était jamais mis à l'épreuve. Le bloc est maintenant dans la page, comme sur le
site.

---

## Point 2 — les annonces similaires

### Ce que la page porte

Sur la page de résultats La Centrale relevée, l'extracteur rend 29 annonces pour 23 cartes.
Les six autres sont sous `boostVo.similarHits`, et deux faits les caractérisent.

**Elles ne sont rendues nulle part.** Aucun `<a href>` de la page ne porte leur adresse ;
leur référence n'apparaît que dans les charges JSON. Ce n'est pas « affiché ailleurs sur la
page », c'est une réserve préchargée pour un encart que la page ne monte pas.

**Elles sont amputées.** 35 clés, mais ni `vehicle`, ni `contacts`, ni `lastUpdate` — donc,
une fois normalisées : `title`, `brand`, `model`, `version`, `year`, `mileage`, `sellerName`
et `bumpedAt` tous nuls. Une référence, un prix, une date de mise en ligne, et rien qui
identifie un véhicule.

L'autre site ne fait pas la même chose, et il fallait le vérifier plutôt que le supposer.
Sur une fiche leboncoin réelle, `__NEXT_DATA__` ne porte **qu'une** annonce
(`props.pageProps.ad`). Les annonces similaires arrivent par un `POST /finder/search`
séparé, que la sonde publie sous `payload` — et la page les rend : 6 `<article>`, 5 adresses
d'annonces distinctes. **Elles ont donc des cartes, et l'extension les pastille déjà.**

### La décision

**On ne suit que ce qu'on montre.** La carte est le juge : une annonce que la page rend est
pastillée et transmise ; une annonce que la charge porte sans qu'aucune carte la rende n'est
ni comptée, ni pastillée, ni transmise.

Pourquoi ce sens plutôt que l'autre. Les deux se défendaient tant qu'on croyait ces six
annonces affichées quelque part ; la mesure a tranché — elles ne le sont pas. Restaient deux
arguments pour les envoyer quand même : elles sont déjà lues, et l'API dédoublonne. Trois
contre, et ils pèsent plus lourd :

1. **Ce que l'extension raconte à l'API doit être ce que le lecteur a sous les yeux.** Une
   réserve que la page a chargée sans la montrer n'est pas quelque chose qu'il a consulté.
2. **La donnée est dégradée.** Sans véhicule, l'API ne peut même pas leur poser
   d'empreinte : `observations.py` ne calcule `fingerprint` que si l'un des cinq champs est
   renseigné, et aucun ne l'est. On écrirait des lignes qui n'apprennent rien.
3. **`bumpedAt: null` n'est pas « pas modifiée », c'est « on ne sait pas »** — et
   `signals()` lit le premier. On calculerait un signal sur une prémisse fausse.

La règle porte sur l'**affichage**, jamais sur l'origine de la donnée. Conséquence voulue :
les annonces similaires d'une fiche leboncoin **continuent** d'entrer au suivi, puisqu'elles
ont leurs cartes et leurs pastilles. Ce n'est pas une exception, c'est la même règle.

### Le diagnostic dit maintenant la vérité

`ADS.diag.listing(shown, unshown, badges, source)` : `listings` compte ce que la page montre,
`unshown` nomme l'écart. Vérifié de bout en bout, modules réels sur la page sauvegardée :

    { kind: "listing", listings: 23, unshown: 6, pro: 23, badges: 23, sent: 23 }

Vingt-trois lues, vingt-trois pastilles, six en réserve — et l'écart est dit au lieu d'être
laissé à deviner. La popup actuelle affiche « Annonces lues 23 / Pastilles posées 23 » :
elle ne ment plus, même sans connaître le nouveau champ. `unshown` l'attend pour la refonte.

### Ce que la règle change ailleurs — à lire avant de valider

Trois tests existants ont dû changer, et ce ne sont pas des ajustements cosmétiques.

**`tests/diag.test.mjs`** — « le diagnostic compte les annonces » posait `listings: 2,
badges: 1` sur un bloc à deux annonces et une seule carte. Ce test encodait exactement le
défaut signalé. Il exige maintenant `listings: 1, unshown: 1, badges: 1`.

**`tests/feed.test.mjs`** — trois tests de pagination. Le décor y place l'URL de la page 2,
la carte de la page 2, et un `__NEXT_DATA__` figé qui décrit encore la page 1. Ces annonces
de page 1 partaient au suivi ; elles ne partent plus, faute de carte à l'écran. C'est
cohérent — elles ont été transmises quand elles étaient affichées, sur la page 1 — mais
c'est un **changement de comportement au-delà des `similarHits`**, et il mérite un regard.
Le sujet des tests est préservé : les annonces de la page suivante entrent bien au suivi dès
que la charge arrive.

**`src/detail.js`** verse désormais `[listing]` au lieu de `listings` : le panneau décrit une
annonce, une seule. Les fiches que Next a préchargées sans que le lecteur les ouvre ne sont
affichées nulle part et ne partent plus. Perte réelle mais faible : le crawler travaille sur
des pages de résultats.

### Les tests

`tests/lacentrale-payload.test.mjs`, avec une réserve `boostVo.similarHits` de six
références ajoutée au décor de `tests/lc-page.mjs` :

- « les annonces préchargées sans carte ne comptent pas parmi les annonces lues » :
  `listings: 23`, `badges: 23`, `unshown: 6`. Rouge sur l'appel
  `ADS.diag.listing(shown, listings.length - shown.length, …)` de `src/listing.js`.
- « les annonces préchargées sans carte ne partent pas au suivi » : le lot vaut 23 et aucune
  des six n'y figure. Rouge sur `ADS.sync.send(shown)` de `src/listing.js`.

`tests/detail.test.mjs` :

- « la fiche ne verse au suivi que l'annonce que son panneau décrit ». Rouge sur
  `ADS.sync.send([listing])` de `src/detail.js`.
- « les annonces similaires qui ont une carte entrent au suivi » : l'autre moitié de la
  règle, celle qui empêche de la durcir en « une seule annonce par fiche ».

`tests/diag.test.mjs` : « une annonce que la charge porte sans carte n'entre pas au suivi ».

Chaque rouge a été constaté en remettant la ligne d'origine, pas déduit.

---

## Point 3 — le seuil de 31 jours

### Ce que la base contient

    site='lc' : 24 annonces, un seul jour de relevé (2026-09-06), 25 observations.

Ce sont les 23 cartes du relevé d'origine plus la fiche. **Le second site vient d'être mis
en service et le crawler ne le visite pas** — son runbook le remet explicitement à plus
tard. Aucune donnée nouvelle n'est arrivée depuis la revue.

Les 23 anciennetés, en jours au 2026-09-06 :

    0, 10, 11, 13, 15, 24, 29, 29, 39, 43, 55, 56, 57, 63, 74, 78, 93, 96, 107, 155, 159, 162, 194, 332

Dans la fenêtre `[31, 60]` que ce seuil découpe : **5 annonces**. Dans `[15, 60]`, où une
borne pourrait vivre : 9, et le plus grand écart y vaut 12 jours, centré sur 49.

### Pourquoi ces 23 points ne posent pas de borne

Le chiffre de 49 n'est pas rien : c'est un creux apparent. Reste à savoir s'il dit quelque
chose. Deux vérifications, l'une et l'autre négatives.

**L'estimateur est du bruit à cet effectif.** En tirant 23 anciennetés au hasard parmi les
29 188 de leboncoin, deux cents fois, et en cherchant le plus grand écart dans `[15, 60]` :
médiane 36,5, premier décile 23,5, neuvième décile 50,0, étendue de 18,5 à 56. Le creux à 49
de La Centrale est exactement ce qu'un tirage de 23 annonces produit **quelle que soit** la
distribution sous-jacente.

**À grande échelle, il n'y a aucun écart à trouver.** Sur les 29 188 annonces leboncoin,
les 46 jours de `[15, 60]` sont **tous** peuplés. Un creux ne se lit pas dans un écart entre
deux valeurs consécutives : il se lit dans une densité — c'est ainsi que les 14 jours de
leboncoin ont été trouvés, sur une sous-population de 1 948 annonces.

**Combien il en faudrait.** Chaque jour de `[15, 60]` pèse entre 0,83 % et 3,28 % de la
population : tout le signal cherché tient dans 2,5 points. Écart maximal entre la densité
d'un échantillon et la densité vraie, médiane sur 200 tirages :

| annonces tirées | écart à la densité vraie | annonces dans la fenêtre |
| --- | --- | --- |
| 23 | **13,0 points** | ~13 |
| 100 | 5,6 | ~55 |
| 250 | 3,1 | ~138 |
| **500** | **2,1** | ~276 |
| **2 000** | **1,0** | ~1 104 |

À 23 annonces, l'erreur vaut cinq fois le signal. Il en faut environ **500 pour voir la
forme** de la distribution, et **2 000 pour y poser une borne** avec l'assurance qu'a eue
celle de leboncoin. La base en a 24.

Réserve honnête : ces effectifs sont calculés sur la distribution leboncoin, faute d'en
avoir une autre. La Centrale ne place que 39 % de ses annonces dans `[15, 60]` là où
leboncoin en place 55 % — l'ordre de grandeur tient, la précision non.

### La décision

**Pas assez de données. La valeur empruntée reste**, et le commentaire de
`src/sites/lacentrale.js` dit désormais ce qui a été mesuré, sur combien d'annonces, et à
partir de quel effectif il faudra y revenir. Aucun code n'a changé sur ce point : `31` reste
`31`, et son effet reste ce qu'il était — l'appui visuel, jamais l'alerte, qui est le
plafond du compteur du site et lui seul.

---

## Ce qui reste ouvert

1. **La fréquence des lots n'a pas été mesurée sur La Centrale**, qui refuse le navigateur
   automatisé. Le chiffre de 29 lots dans la seconde vient de leboncoin. Si quelqu'un peut
   ouvrir une page de résultats La Centrale dans un Chrome ordinaire, la mesure tient en
   dix lignes de console et vaut d'être refaite.
2. **Le mémo relit dès qu'un script porteur de texte apparaît** — 5 fois sur 82 lots, mais
   ces cinq-là sont souvent des balises de régie, pas la charge d'annonces. Le raffinement
   suivant serait de ne signer que les scripts que l'extracteur retient réellement. Non fait :
   le gain restant est petit et le code s'alourdirait.
3. **Sur une page de résultats, `detail.js` pose son panneau sur `listings[0]`**, sans
   vérifier qu'une carte le rend. Sur la page relevée ce premier est `boostVo.hit`, une vraie
   carte, donc le défaut ne mord pas ; si la réserve venait à passer devant, le panneau
   décrirait une annonce sans titre ni kilométrage. Repéré, non corrigé — hors du périmètre
   des trois points.
4. **`unshown` n'est lu par personne** tant que la popup n'est pas refaite. Le champ est
   dans `chrome.storage.local`, il attend.
