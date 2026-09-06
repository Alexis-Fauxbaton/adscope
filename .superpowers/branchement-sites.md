# Branchement des sites : une couche de lecture indifférente au site

`extension/src/sites/lacentrale.js` était écrit, testé, et ne s'exécutait nulle part. Ce lot
rend la couche de lecture indifférente au site et met La Centrale en service.

Branche `feat/api`, à partir de `f2a3e4e`. Rien n'a été poussé.

## Le registre

`extension/src/sites.js` — vingt lignes. Chaque module de site s'y déclare en se chargeant
(`ADS.leboncoin = ADS.sites.register((() => { … })())`), et le code partagé ne demande jamais
qu'une chose : le site de la page ouverte, résolu par l'origine.

    ADS.sites.current()   // le site dont l'origine est celle de la page
    ADS.sites.at(origin)  // le même, par origine explicite (les tests)
    ADS.sites.all()

L'origine est comparée entière, jamais par fragment de domaine : `leboncoin.fr.exemple` n'est
pas leboncoin.

Ce qu'un site déclare :

| champ | ce qu'il dit |
|---|---|
| `id` | `lbc`, `lc` — ce qui part vers l'API |
| `origins` | les origines qu'il couvre |
| `urlId(path)` | comment une URL nomme une annonce |
| `card(doc, listing)` | la carte de résultats qui porte cette annonce |
| `dateNode(doc, skip)` | le libellé d'ancienneté que la page affiche |
| `fromDocument` / `fromPayload` / `fromScripts` | l'extraction, déjà en place |
| `signals(listing, now)` | ses seuils |
| `words.bump(s)`, `words.bumpLabel` | son vocabulaire de mise à jour |
| `claim(s, says)` | la contradiction que sa page produit, nommée avec ses mots |

`fromPayload` est facultatif : La Centrale n'a pas de script de monde MAIN, et `feed.js`
s'en accommode — sa page fait foi.

`extension/src/sites/read.js` porte les deux gestes que les deux sites partagent sans qu'aucun
soit nommé : retrouver un nœud feuille dont le texte répond à un motif (`leaf`), et extraire
les objets JSON que des scripts en ligne transportent (`blobs`, `collect`). Les trente lignes
de découpe d'accolades sortent ainsi de `lacentrale.js`, qui était à la limite des 150 lignes.

`src/page/tap.js` — le crochet sur `window.fetch`, propre au routage Next.js de leboncoin — est
devenu `src/sites/leboncoin-tap.js`. Plus rien hors de `src/sites/` ne nomme un site ; un test
le vérifie sur tous les fichiers de `src/`.

## Les dix points nommant leboncoin en dur

Tous levés. `listing.js` et `detail.js` résolvent le site en tête et sortent s'il n'y en a pas ;
`diag.js` lui demande l'identifiant de l'URL ; `feed.js` lui demande son extraction ; `sync.js`
prend le site des annonces (`fresh[0].site`) au lieu de l'écrire ; `view.js` prend ses mots et
sa contradiction du site. Un onzième point, non listé, a été levé aussi : le sélecteur de carte
`a[href*="/ad/voitures/…"]` de `listing.js`, dont la forme est propre à leboncoin — sans quoi
aucune carte La Centrale n'aurait reçu de pastille.

Le manifeste déclare les deux sites, chacun avec sa chaîne de content scripts dans l'ordre
`context → sites → sites/read → module de site → partagés`.

## Seuils : mesurés, ou par défaut assumé

La revue avait raison : reprendre 1 jour / 31 jours / 14 jours sur La Centrale aurait été une
extrapolation muette. Ce qui a été mesuré sur la page de résultats relevée le 2026-09-06 :

- **60 jours — mesuré.** Le compteur du site sature là. La fiche `B101733515` porte 1 810 jours
  en ligne et affiche « Publiée il y a 60 jours ». Au-delà, le libellé du site est faux par
  omission, et l'écart, lui, se mesure. C'est la seule borne de l'alerte La Centrale :
  `notable = capped`.
- **1 jour (écart de remontée) — non mesuré, et volontairement sans effet sur l'alerte.**
  22 des 23 cartes portent un `lastUpdate` postérieur de plus d'un jour à la mise en ligne :
  96 %. Une marque que presque toutes les annonces portent ne distingue rien, et le site ne dit
  pas ce qu'elle recouvre. Elle est affichée comme fait, jamais retenue comme signal — l'alerte
  « ancienne et encore poussée » de leboncoin n'est donc pas transposée.
- **31 jours — valeur par défaut assumée, dite comme telle dans le code.** 23 cartes d'un seul
  jour ne posent pas une borne. Celle de leboncoin est reprise, et ne pèse que sur l'appui
  visuel `dormant`, jamais sur l'alerte.
- `BUMP_RECENT_DAYS` a disparu de `lacentrale.js` : il ne servait plus rien.

## Vocabulaire

Chaque site fournit ses mots, et aucun n'est écrit dans `view.js`.

- leboncoin : `⟳ réactualisée`, ligne « Réactualisée », « leboncoin affiche … date de
  réactualisation, pas de publication ». Inchangé au caractère près.
- La Centrale : `⟳ modifiée`, ligne « Modifiée ». `lastUpdate` atteste qu'on a touché à
  l'annonce, rien de plus — remontée payée ou correction de prix, la page ne les distingue pas ;
  « Réactualisée » y affirmerait une cause. La contradiction montrée est l'autre : « La Centrale
  affiche “Publiée il y a 60 jours” — compteur plafonné à 60 jours ».

## Tests

218 verts côté extension (200 avant, aucun réécrit en substance), 149 verts côté API.

Les seules retouches aux tests existants sont des points d'entrée : charger `sites.js` et
`sites/read.js` avant le module de site (`extract`, `view`, `lacentrale`), poser une origine
dans `view.test.mjs` — ce sont les mots de leboncoin qu'il vérifie, il le dit maintenant — et
suivre `tap.js` à sa nouvelle place. Aucune assertion n'a changé.

Le décor de test a été scindé : `tests/stage.mjs` porte le DOM minimal et le décor commun
(stockage, runtime, observateur, chargement des modules), `tests/world.mjs` la page leboncoin,
`tests/lc-page.mjs` les squelettes La Centrale — déplacés depuis `lacentrale.test.mjs`, qui les
importe désormais au lieu de les porter. La lecture de sélecteurs du faux DOM est devenue
générique (`tag`, `[attr]`, `*=`, `$=`, listes) : c'est ce qui permet à une carte de se
distinguer d'une autre sur les deux sites.

**18 tests ajoutés**, dans `tests/sites.test.mjs` et `tests/lacentrale-dom.test.mjs`. Chacun a
été vérifié rouge par mutation de la ligne de production qui le porte :

| test | ligne rendue rouge |
|---|---|
| l'identifiant d'annonce est lu selon le site | `lacentrale.js` `urlId` |
| la fiche est reconnue par la référence de son adresse | `detail.js:64` `site.urlId`, `diag.js:12` |
| chaque carte porte son ancienneté réelle | `listing.js:58` `site.card` |
| la carte modifiée le dit sans reprendre le mot de l'autre site | `view.js:18` `site.words.bump` |
| le panneau emprunte au site le mot de sa ligne | `view.js:68` `site.words.bumpLabel` |
| la contradiction est lisible sur une fiche plafonnée | `view.js:71` `site.claim`, `lacentrale.js` `signals` |
| les annonces partent au suivi sous leur propre site | `sync.js:59` `fresh[0].site` |
| les seuils sont propres à chaque site | `lacentrale.js` `notable: capped` |
| aucun module partagé ne nomme un site | tout retour en arrière dans `src/*.js` |

## Vérifié sur les pages réelles, hors tests

- Fiche plafonnée : `og:url` = `/auto-occasion-annonce-66101733515.html` → `urlId` rend
  `B101733515`, l'extraction rend 1 810 jours, et le libellé « Publiée il y a 60 jours » est bien
  un nœud feuille (`<div>` sans élément enfant) que `read.leaf` retrouve.
- Fiche non plafonnée : `W103538172`, 23 jours, aucune contradiction affichée.
- Résultats : 23 liens de fiche dans la page, tous appariés à une annonce extraite ; les
  adresses reconstruites depuis la référence (`W103496285` → `…-87103496285.html`) correspondent
  au `href` réel des cartes.

## Réserves

1. **`listing.js` réextrait à chaque lot de mutations.** Mesuré sur la page de résultats réelle :
   6 ms par extraction (68 scripts, 1 Mo). C'était déjà le cas sur leboncoin, mais la lecture de
   La Centrale est plus lourde — elle balaie tous les scripts en ligne, quand leboncoin lit un
   seul bloc. Sur une page qui mute en rafale, cela se paie. Un cache indexé sur la signature des
   scripts le réglerait ; je ne l'ai pas ajouté sans mesure de la fréquence réelle des lots.
2. **Les annonces similaires d'une page de résultats La Centrale entrent dans le lot envoyé.**
   La page relevée porte 23 cartes et son état préchargé 29 annonces : 6 viennent de
   `similarHits`. Elles ne reçoivent aucune pastille (aucune carte ne leur correspond) mais elles
   partent au suivi et gonflent le compte du diagnostic à 29. C'est le comportement que
   l'extracteur avait déjà — le lot le donnait pour vérifié à 29 —, et leboncoin fait de même avec
   les annonces similaires d'une fiche. À trancher séparément.
3. **`popup/popup.js` n'est pas passé au registre.** Le texte « … sur leboncoin » est devenu
   « … sur un site couvert » et le repli `status.site || 'lbc'` a disparu (le diagnostic écrit
   toujours le site), mais la popup ne sait pas énumérer les sites pris en charge : il faudrait
   qu'elle charge le registre pour le dire.
4. **Le seuil de 31 jours de La Centrale reste emprunté.** Assumé et dit dans le code, sans effet
   sur l'alerte — mais il faudra le mesurer quand la base aura des données La Centrale.
