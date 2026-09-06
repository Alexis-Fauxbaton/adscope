# La popup, surface principale sur les fiches

Branche `feat/api`. Départ `d627056`.

## Ce qui a été fait

La fenêtre ne montre plus un diagnostic : elle montre l'annonce. Sur une fiche —
le titre, l'ancienneté réelle en sujet, la courbe de prix sur l'axe du temps, ce
que le site affiche de son côté, le suivi mutualisé avec sa dernière
vérification, puis les statistiques du vendeur. Sur une page de résultats — le
résumé. Le diagnostic et les réglages passent sous un repli `<details>`.

### La courbe

Découpée en trois : un modèle, un tracé, une surface.

- `popup/curve.js` — le modèle. Il ne connaît ni pixels ni SVG (il rend des
  fractions d'axe) ni sites (ce que la page affiche lui arrive en jours). L'axe
  va de la mise en ligne à aujourd'hui, plancher d'un jour pour qu'une annonce
  publiée à l'instant reste traçable.
- `popup/chart.js` — le tracé. Hachure au motif SVG, marches (jamais de
  diagonale : elle inventerait des prix qu'on n'a pas vus), gros point rouge
  pour un changement, petit point clair pour une vérification, bande rouge pour
  ce que le site montre.
- `popup/fiche.js` — la surface, et `popup/dom.js` les gestes partagés.

**La hachure porte toujours une date.** « aucune observation avant le 25 mai »,
jamais « aucune observation ». Elle s'écrit dans la bande quand celle-ci fait au
moins 45 % de l'axe, sous l'axe sinon — avec un carré hachuré en tête, sans quoi
rien ne dirait de quoi la phrase parle. Les deux chemins sont testés.

**La première observation est un point creux**, pas un gros point rouge : ce
n'est pas un changement constaté, c'est le début du regard. Trois signes restent
trois signes ; celui-là est le même signe, vidé.

**La bande rouge a un seul usage.** Elle n'apparaît qu'avec le `claim()` du
site, et sa largeur est la durée que le site couvre — `days`, ajouté au `claim`
de chaque module de site : `CAP_DAYS` pour l'un, `bumpedDaysAgo` pour l'autre.
Sur la fiche plafonnée, 60 jours sur 1 810 : dix pixels sur trois cents, mesuré
au rendu.

**La couche de survol est utilisable** et elle est là. Mesurée dans le
navigateur : sur quatre mois de suivi hebdomadaire, 14 cibles de 19,6 px
espacées de 20 px, sans recouvrement. Le survol écrit « 13 juillet · 13 900 € »
dans une ligne réservée sous l'axe, qui ne fait pas sauter la mise en page.

### La dégradation

Sans historique — annonce découverte du jour, ou API muette —, la fenêtre trace
la seule observation qu'elle a : celle que la page vient de donner, à
aujourd'hui, et tout le reste de l'axe est hachuré. Pas de ligne plate inventée.
C'est exactement le cas A ci-dessous.

### Le badge

`chrome.action.setBadgeText` par onglet, alimenté par un message `badge` que le
content script envoie ; seul le service worker sait à quel onglet la page
appartient, il le lit sur l'expéditeur. Le compte à zéro efface — une navigation
monopage ne réinitialise rien d'elle-même, et sans cet effacement le badge d'une
fiche resterait sur la suivante. Rien à dire, rien d'affiché.

### Les deux dettes

**La garde élargie.** Elle ne balayait que le premier niveau de `src/`. Elle
balaie maintenant `src/` en entier et `popup/`, et surtout elle ne décide plus
par le chemin : c'est le manifeste qui dit qui est partagé — un fichier que tous
les blocs de content scripts chargent sert les deux sites, celui qu'un seul
charge est le module d'un site. Rien à tenir à jour quand un site s'ajoute. Elle
couvre donc `src/sites/read.js`, qui vit parmi les modules de site sans en
nommer aucun.

Elle a immédiatement trouvé le résidu annoncé : « la charge leboncoin » dans
`popup/seller.js`, faux depuis que les deux sites sont servis. Corrigé.

**La popup énumère les sites.** Elle charge le registre et ses modules comme le
manifeste les charge pour les content scripts, puis demande : le nom du site en
tête de fenêtre vient de `sites.all()`, et la phrase d'attente aussi — « … sur
leboncoin ou La Centrale ». Aucun nom de site n'est écrit dans `popup/`.

## Le rendu réel

Popup chargée dans Chromium avec un `chrome.*` de fabrique (storage, runtime,
permissions, fetch), sur les trois cas. Ce que j'ai vu :

**A — fiche La Centrale plafonnée, sans historique.** « 4 ans 11 mois · 1 810 j »
en sujet. L'axe entièrement hachuré, la phrase datée dedans, un point creux à
aujourd'hui, la bande rouge de dix pixels contre le bord droit. Le bloc de
contradiction cite « Publiée il y a 60 jours » et le rattache à la bande. Aucun
bloc vendeur : c'est un particulier, et la ligne de caractéristiques le dit.
Lisible d'un coup d'œil, et le ton est bien celui d'un constat.

**B — fiche leboncoin, 104 jours de suivi, marchand.** Trois paliers, deux
baisses en gros points rouges, treize vérifications en petits points clairs sur
la ligne, hachure de 14 jours à gauche avec sa phrase datée sous l'axe, bande
rouge de 12 jours à droite. « 12 900 € · −2 000 » sous le dernier palier. Puis
le suivi (104 j · 21 vues, dernière vérification 4 sept., prix stable depuis
48 j) et le bloc vendeur.

**C — page de résultats.** Trois lignes : 23 lues, 9 au-delà du seuil, 4 en
alerte — ce dernier en rouge. Le repli de dépannage ouvert montre le diagnostic
d'avant, intact.

Un quatrième état vérifié au passage : sans page analysée, la phrase nomme les
deux sites depuis le registre.

### Ce que j'ai corrigé après l'avoir vu

- `duration()` rendait « 4 ans » là où la maquette dit « 4 ans 11 mois ». La
  pastille peut abréger, elle alerte ; la fenêtre argumente. `spell()` local.
- Le montant de la dernière observation s'écrivait sur la marche voisine :
  il se pose maintenant du côté où il reste de la place.
- Les petits points disparaissaient dans la ligne : liseré de papier.
- « −5,8 % après 34 j en ligne » était tronqué par l'ellipse : les valeurs du
  bloc vendeur se replient au lieu d'être coupées — c'est la réserve qui
  disparaissait.
- Les jours plutôt que « 1 mois » dans le suivi, pour la même raison que
  `seller.js` : « 1 mois » couvre de 31 à 60 jours.

## Réserves

**La portée du bloc vendeur reste avant les chiffres.** La maquette la place
après, dans un cadre. J'ai gardé l'ordre de la production — c'est le correctif
obtenu de haute lutte, et un lecteur qui lit les chiffres d'abord prend
l'échantillon pour le catalogue. Le cadre de la maquette est repris. Un test
vérifie l'ordre, pas seulement la présence.

**`popup.html` nomme les fichiers de site dans ses balises `<script>`**, comme
`manifest.json` les nomme dans ses `content_scripts` : sans modules ES dans les
content scripts, il n'y a pas d'autre façon de charger le registre. C'est une
déclaration de chargement, pas une connaissance : aucun `.js` de `popup/` ne
nomme un site, et la garde le vérifie.

**Le badge n'a pas été observé dans un navigateur** : cela demande de charger
l'extension décompressée, ce que la consigne de rendu ne couvrait pas. Son
contrat est tenu par quatre tests (rien à zéro, le nombre, l'effacement au
passage sur une page calme, l'absence d'onglet).

**`price_history` vient du cache du service worker.** La fenêtre le demande par
le message `cached` qui existait déjà. Une annonce jamais synchronisée n'a donc
pas de courbe historique — elle tombe dans la dégradation, ce qui est le
comportement voulu, mais cela veut dire que la courbe complète suppose une clé
de licence et une API joignable.

## Tests

`extension` : 226 → 265 verts. `api` : 149 verts, inchangé.

Chaque test ajouté, et la ligne de production qui le fait rougir :

| test | rougit sans |
|---|---|
| `curve.test.mjs` (13) | `popup/curve.js` — module absent |
| `fiche.test.mjs` — sujet, courbe, hachure, bande, suivi, résumé, sites | `popup/fiche.js`, `popup/chart.js`, `popup/dom.js` — modules absents |
| `fiche.test.mjs` — portée avant les chiffres | l'ordre de `nodes` dans `showSeller` (`popup/popup.js`) |
| `fiche.test.mjs` — diagnostic replié | le `<details id="tools">` de `popup.html` |
| `fiche.test.mjs` — pas de balisage | la garde elle-même ; rouge dès qu'un `innerHTML` entre |
| `badge.test.mjs` — les quatre du badge | `const badge = …` et l'entrée `badge:` de `handlers` (`src/sw.js`) |
| `badge.test.mjs` — ce que le content script annonce | `tell(alerts)` dans `src/diag.js` |
| `sites.test.mjs` — nom lisible | `name:` dans les deux modules de site |
| `sites.test.mjs` — seuil d'ancienneté | `old` dans les deux `signals()` |
| `sites.test.mjs` — durée de la contradiction | `days` dans les deux `claim()` |
| `sites.test.mjs` — garde élargie | le commentaire faux de `popup/seller.js` (il rougissait, il a été corrigé) |
| `diag.test.mjs` — `card`, `old`/`alerts`, `site` | `card`/`counts`/`site` dans `src/diag.js` |

Un test existant a été ajusté à la nouvelle signature :
`context.test.mjs` appelait `ADS.diag.listing` sans ses comptes.

## Fichiers

Nouveaux : `popup/curve.js`, `popup/chart.js`, `popup/fiche.js`, `popup/dom.js`,
`popup/paper.css`, `tests/curve.test.mjs`, `tests/fiche.test.mjs`,
`tests/badge.test.mjs`, `tests/popup-dom.mjs`.

Aucun fichier de production au-dessus de 150 lignes ; le plus gros est
`src/sites/lacentrale.js` à 150.
