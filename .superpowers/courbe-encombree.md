# La courbe encombrée — correction de géométrie

Branche `feat/api`. Point de départ : `2431444`.

## Le défaut

Sur une fiche La Centrale plafonnée, trois textes occupaient la même bande de huit
pixels sous la bande de prix : la phrase « aucune observation avant le … », le
montant du jour et sa variation. Ils se recouvraient.

Ce n'était pas un hasard de données. Le tracé posait la phrase de la hachure
**dans** le dessin dès que la hachure dépassait 45 % de l'axe, à `y = 59`, centrée
sur la bande. Or une hachure large veut dire, mot pour mot, que les observations
sont tassées à droite — donc que les montants sont à droite eux aussi, et que le
montant du point bas se pose à `y = 61`. Le seul cas où la phrase entrait dans le
dessin était précisément celui où elle n'y avait pas la place. La branche « aérée »,
elle, ne dessinait jamais de phrase : c'est pourquoi elle se lisait.

Additionnées, les trois largeurs valaient 393 px pour 312 disponibles. Aucune
règle de placement n'aurait pu les faire tenir sur une ligne.

## La règle retenue

**Trois couloirs, un occupant chacun.**

1. **Au-dessus de la bande de prix** — le montant d'un point haut.
2. **En dessous** — le montant d'un point bas.
3. **Sous l'axe, en HTML** — la phrase datée de la hachure, *toujours*, large ou
   étroite. Elle a sa ligne à elle, précédée de son échantillon de trame, et rien
   ne vient s'y écrire par-dessus. C'était une exigence nommée : elle ne se
   négocie plus par une condition de largeur.

Les deux premiers couloirs sont **prouvablement disjoints** : le couloir haut ne
sert qu'aux points de la moitié supérieure (ligne de base entre 14 et 27, encre
jusqu'à 30) et le couloir bas qu'à ceux de la moitié inférieure (ligne de base
entre 48 et 61, encre à partir de 38). Deux montants ne peuvent donc se disputer
la place que dans le *même* couloir.

**L'ordre dit ce qui est dû.** Le dernier prix passe en premier — c'est celui
qu'on est venu lire, et il porte la baisse. Le prix d'origine prend ce qui reste ;
si sa boîte croise celle du dernier prix, il cède. Il ne disparaît pas : le
**relevé des observations** l'énonce déjà en toutes lettres, avec sa date, et la
variation reste écrite sur le montant du jour (`· −200`). Sur 108 géométries à
deux montants balayées par le test, 20 font céder le prix d'origine.

Un liseré de papier détoure les montants (`paint-order: stroke`) : ils passent
au-dessus de la hachure sans que la trame leur mange les jambages.

## Ce qui a changé

- `extension/popup/labels.js` — **nouveau**. Le placeur : boîte d'un texte, test
  de croisement, couloirs, arbitrage. La chasse fixe et le rendu à l'échelle 1
  permettent de *calculer* une largeur au lieu de la mesurer, donc de la vérifier
  sans navigateur.
- `extension/popup/chart.js` — ne porte plus aucune phrase ; délègue le placement
  des montants et rend le SVG seul (`draw` ne renvoie plus de couple).
- `extension/popup/fiche.js` — la ligne de hachure suit `model.blind`, plus une
  condition de largeur.
- `extension/popup/popup.css` — le liseré ; `.blind-text` retiré, sans emploi.
- `extension/popup/popup.html`, `extension/tests/popup-dom.mjs` — le module chargé.

Aucun fichier au-dessus de 150 lignes (`chart.js` 148, `labels.js` 83,
`popup.css` 149).

## Le verrou

`extension/tests/chart.test.mjs` — **la suite ne pouvait pas voir ce défaut** :
elle vérifiait qu'un texte *contient* la bonne phrase, jamais où il se pose. Le
nouveau test mesure la boîte de chaque texte du tracé et échoue au recouvrement.

- quatre géométries nommées : fiche plafonnée, cas aéré, observation unique,
  baisses rapprochées ;
- l'invariant « le tracé ne porte que des montants, jamais de phrase » ;
- un **balayage** de 180 courbes — six longueurs d'axe (1 j à 5 ans), trois
  proportions de hachure, dix formes de prix — où aucune paire de boîtes ne doit
  se croiser et aucun texte sortir du cadre ;
- tout texte doit déclarer son corps dans `labels.SIZE`, sinon sa boîte n'est pas
  mesurable et le test le dit.

Vérifié à rebours : en replaçant la phrase de la hachure dans le tracé, cinq des
six cas échouent, avec le message « aucune observation avant le 11 mai » recouvre
« 22 700 € · −2 200 » — le défaut de la capture, nommé.

`extension/tests/fiche.test.mjs` gagne « le montant qui cède sa place se retrouve
au relevé », et ses deux tests de hachure visent désormais la ligne sous l'axe
plutôt que « quelque part dans la fenêtre ».

## Les rendus

Six géométries rendues dans Chromium à 380 px et **regardées une par une**
(`.superpowers/rendu/`) :

| capture | géométrie | ce qu'on y voit |
|---|---|---|
| `courbe-plafonnee.png` | hachure 94 %, observations tassées, bande rouge | les trois textes séparés, chacun sur sa ligne |
| `courbe-aeree.png` | suivi depuis la mise en ligne | inchangé — la géométrie qui marchait marche encore |
| `courbe-un-seul-point.png` | une observation, 5 ans d'axe aveugle | un montant détouré sur la trame, la phrase datée dessous |
| `courbe-baisses-rapprochees.png` | quatre baisses en 28 j sur 400 | les deux montants, l'escalier serré à droite |
| `courbe-creux-au-milieu.png` | creux central, les deux montants visent le couloir haut | le prix d'origine a cédé, le relevé le porte |
| `courbe-prix-stable.png` | prix stable vérifié chaque semaine | un montant, hachure moyenne |

Mesuré dans le navigateur sur les six : la boîte calculée couvre l'encre rendue
partout (liseré compris), aucune paire de boîtes rendues ne se croise, la phrase
datée est visible et complète dès qu'il y a une hachure, et le relevé est peuplé.
C'est ce qui a calé les constantes du placeur (`RISE 0,92`, `DROP 0,26`,
`ADVANCE 0,62` — l'espace fine insécable du français avance moins que la chasse
pleine, l'estimation majore donc toujours).

## Tests

- `extension` : **285 verts** (278 + 6 de `chart.test.mjs` + 1 de `fiche.test.mjs`).
- `api` : **148 verts, 1 rouge** —
  `test_usage.py::test_the_observations_route_closes_the_days_that_passed`.
  `api/` n'a pas été touché (aucun écart au `git status`) : l'échec porte sur la
  bascule d'un jour d'usage et préexiste à ce travail.

## Ce que la conception ne dit pas encore

`docs/popup-conception.md` exige que la hachure porte une date explicite ; il ne
dit pas *où*. Il est désormais vrai qu'elle vit sous l'axe, jamais dans le tracé.
À noter le jour où la conception sera reprise — la direction visuelle, elle, n'a
pas bougé.
