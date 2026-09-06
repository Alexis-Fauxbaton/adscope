# Seuil d'alerte et suivi des pages suivantes

Branche `feat/api`, à partir de `6b18bcd`. Deux corrections indépendantes, deux commits.

## Point 1 — l'ancienneté passe devant, la réactualisation devient un aggravant

### Ce que disent les données réelles

Base `adscope`, 7 114 annonces leboncoin au 2026-09-06 — quatre fois le relevé de la
spec (§ 10 quinquies), et les taux se confirment :

| | annonces | réactualisées | taux |
|---|---|---|---|
| professionnels | 4 025 | 3 043 | **76 %** |
| particuliers | 3 089 | 165 | 5 % |

Le seuil précédent (`réactualisée` **ou** `en ligne depuis 7 j`) allumait l'alerte sur
**87,8 % des cartes professionnelles et 76,0 % des cartes de particuliers**. Il ne triait
rien.

### Seuils retenus

```
notable = en ligne depuis ≥ 31 j  et  réactualisée  et  réactualisée il y a ≤ 14 j
dormant = en ligne depuis ≥ 31 j  et  jamais réactualisée
```

**31 jours** plutôt que 30 : c'est la borne exacte où `format.duration` cesse de compter en
jours et écrit « 1 mois ». L'alerte s'allume au moment où le libellé change d'unité — un
lecteur ne verra jamais « 30 j » en alerte et « 30 j » sans, à un jour près sans explication.

**14 jours** pour « récemment » : sur les 1 948 annonces pro anciennes et réactualisées,
1 903 l'ont été depuis moins de 14 jours ; aucune à exactement 14, et les 45 restantes
s'étalent de 15 à 55 jours. La coupure tombe dans un creux mesuré de la distribution, pas
sur un chiffre rond choisi à l'avance. Sa contribution au volume est faible (−45 annonces),
son rôle est ailleurs : elle empêche d'écrire « encore réactualisée » d'une annonce que
plus personne ne pousse.

### Effet mesuré sur les 7 114 annonces en base

Mesure faite en exécutant `ADS.leboncoin.signals` — le code livré, pas une transcription
SQL — sur les lignes de la table `listings`.

| | cartes | alerte avant | alerte après | poids intermédiaire |
|---|---|---|---|---|
| professionnels | 4 025 | 3 533 (87,8 %) | **1 904 (47,3 %)** | 228 |
| particuliers | 3 089 | 2 349 (76,0 %) | **44 (1,4 %)** | 904 |

Rapporté au relevé de 1 792 annonces cité par la spec, le rapport 1 904 / 3 043 ramène les
alertes professionnelles de 194 à **environ 121** — la spec en attendait ~130.

### L'annonce ancienne jamais réactualisée : poids intermédiaire

Elle ne mérite pas l'alerte, et pour une raison de fond : **il n'y a rien à dénoncer**. Le
produit existe parce que leboncoin affiche `index_date` là où le lecteur comprend « date de
publication ». Sur une annonce jamais réactualisée, les deux dates coïncident : le site dit
déjà la vérité. L'alerte doit rester réservée à l'écart entre ce qui est montré et ce qui est.

Elle mérite mieux que rien : c'est du stock qui dort sans qu'on paie pour le cacher.
D'où un troisième poids visuel — cadre gris appuyé, sans couleur d'alerte — plutôt que la
mention discrète.

Un fait mesuré vient à l'appui : **aucune annonce non réactualisée ne dépasse 60 jours en
base** (maximum constaté : 60). C'est la durée de vie d'une annonce leboncoin ; au-delà, il
faut la renouveler, donc la réactualiser. La « vieille annonce oubliée » de six ans n'existe
pas sans réactualisation — le cas spectaculaire est toujours du côté de l'alerte.

### Hiérarchie d'affichage

```
avant   ⟳ réactualisée il y a 2 j · en ligne depuis 6 ans
après   6 ans en ligne · ⟳ encore réactualisée il y a 2 j
```

« encore » n'apparaît que sur une annonce en alerte : sur une annonce de six jours il serait
faux, et sur une annonce d'un an il est tout le propos. Le vocabulaire reste « réactualisée »,
arrêté en `439996c`.

Le panneau de fiche suit : `En ligne depuis` porte l'accent dès que la durée est le sujet
(alerte ou dormante), `Réactualisée` redevient une ligne ordinaire, et le cadre du panneau
prend le même poids que la pastille (`--notable` / `--dormant`). La mention
« leboncoin affiche … » reste attachée à la réactualisation, quel que soit l'âge : c'est un
constat sur la page, pas une alerte.

## Point 2 — chaque charge reçue est versée au suivi

`src/sync.js` gardait un booléen `sent` : un seul envoi par chargement. Depuis `4e4f90d`
les annonces de la page 2 sont pastillées, mais elles n'étaient **jamais transmises** — ni
entrées en base, ni interrogées pour un signal en retour.

La garde devient un `Set` d'identifiants déjà transmis : chaque charge n'envoie que ses
annonces neuves, et un lot de mutations qui rejoue le rendu n'envoie rien. Les signaux des
lots successifs **se cumulent** au lieu de se remplacer — sans quoi la réponse de la page 2
effacerait les baisses de prix de la page 1.

Le marquage se fait **avant** la réponse : un envoi qui échoue n'est pas rejoué. L'inverse
ferait resolliciter une API injoignable à chaque lot de mutations de la page.

### Diagnostic

`ADS.sync.sent()` compte ce que **l'API a accusé** (`res.sent`), pas ce qu'on lui a tendu :
sans licence ou API injoignable, le compte reste à zéro. La popup l'affiche sous
« Transmises depuis l'ouverture », cumulé sur la vie de la page. Le compte entre dans
l'estampille de `listing.js`, sans quoi le diagnostic ne serait pas réécrit quand la seule
chose qui a changé est l'accusé de réception.

## Tests

`node --test tests/*.test.mjs` : **77 verts** (59 avant, tous conservés ou réécrits).
Écrits avant le code, et vérifiés en échec pour la bonne raison à chaque étape.

`tests/world.mjs` a été étendu, pas dupliqué : il charge désormais le vrai `src/sync.js`
derrière un `chrome.runtime.sendMessage` de fabrique. `w.queued()` dit ce que le content
script a émis, `w.messages()` combien de fois, et `w.arrive(signaux)` joue la réponse de
l'API — **en ne répondant que sur les identifiants du lot soumis**, comme
`/v1/listings/batch`. C'est cette fidélité qui rend le défaut de la page 2 visible en test.

## Réserves

- `sw.js` renvoie `sent` après le POST des observations *et* la lecture des signaux. Si le
  second appel échoue, les annonces sont bien entrées en base mais le diagnostic ne les
  compte pas. Il sous-estime, il ne surestime jamais.
- Une annonce transmise pendant que la licence est absente reste marquée pour la vie de la
  page : renseigner la clé sans recharger ne la renverra pas.
- Les 7 114 annonces en base viennent du crawler et des pages consultées ; elles ne sont pas
  un échantillon aléatoire du marché. Les taux concordent avec le relevé indépendant de
  1 792 annonces, ce qui est un contrôle, pas une preuve.
