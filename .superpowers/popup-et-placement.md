# La popup refaite, et le panneau remonté en haut de la fiche

Lot du 2026-09-20, dossier `extension/` seulement. 415 tests verts, y compris avec
l'horloge décalée d'un an. Tous les fichiers source sous 150 lignes.

## 1. La popup passe au registre du panneau, et perd ce qu'elle répétait

Deux identités cohabitaient : le panneau dans la page portait le registre validé le
2026-09-08 (`docs/panneau-conception.md` — app consumer, sol gris très clair, cartes
blanches, ombre douce, accent #4F46E5), la fenêtre portait encore le « document
administratif » rejeté le même jour. `popup/paper.css` est supprimé ; `popup/popup.css`
reprend les mêmes jetons que `src/panel.css`, en pile système — aucune fonte n'est
chargée du dehors, et un test le vérifie.

Elle ne répète plus ce que la page montre déjà. Contenu, 360 px de large :

1. **les alertes** — rien quand tout va bien ;
2. **le compte** : l'email connecté, ou rien ;
3. **« Ouvrir adscope »**, bouton principal ;
4. **sur une fiche** : une ligne — « 15 jours en ligne · prix inchangé depuis le
   5 sept. » — et le bouton Suivre / Suivie ;
5. **Réglages** repliés : adresse de l'API, « Clé — machines uniquement », et le
   diagnostic existant replié à l'intérieur.

Supprimés, avec leurs tests : `popup/chart.js`, `popup/labels.js`, `popup/seller.js`,
`popup/paper.css`, `tests/chart.test.mjs`, `tests/seller.test.mjs`, et `report.summary`
(le résumé d'une page de résultats — ses pastilles le disent déjà carte par carte).
`src/curve.js` reste : le panneau s'en sert. Un test neuf compare les `<script>` de
`popup.html` au contenu de `popup/` : rien d'orphelin dans un sens ni dans l'autre.

La ligne de résumé dit deux choses que la page ne montre pas : l'ancienneté réelle, et
**depuis quand le prix affiché tient**. Cette date se lit sur le relevé — on remonte la
série tant que le prix ne bouge pas — plutôt que de se déduire d'un compte de jours :
« depuis le 5 sept. » se cite dans une négociation, « depuis 48 j » se recalcule à
chaque fois qu'on le prononce.

Le bouton Suivre passe par le service worker, comme celui du panneau, et ne bascule
qu'après la réponse : un suivi refusé laisse « Suivre ».

## 2. L'alerte d'accès dit ce qui se passe vraiment

`src/health.js`, entrée `site_access` :

> adscope n'a plus l'accès permanent à La Centrale : il ne fonctionne que sur les
> onglets où vous cliquez sur son icône.

Bouton inchangé (« Réactiver »). L'ancien texte — « La Centrale : accès désactivé » —
contredisait l'écran : en mode « Sur clic », le panneau s'affiche après un rechargement
sur l'onglet où l'on vient de cliquer l'icône.

**Le maillon non automatisable** : `chrome.permissions.contains` voit bien la coupure, et
`chrome.permissions.request` rend l'accès **sans fenêtre de confirmation**. Vérifié à la
main par Alexis dans un Chrome réel ; aucun test ne peut l'établir, le stub de
`chrome.permissions` rendrait ce qu'on lui demande de rendre. Ce que les tests tiennent,
c'est le reste : l'origine demandée est celle du site coupé et aucune autre, un problème
donne un bouton et un seul, et le texte ne prétend plus l'extension éteinte.

## 3. « 1 jour », pas « 1 jours »

L'accord se recollait au point d'appel — `${number(n)} jours` écrit à sept endroits —
donc il s'oubliait. Il se tient maintenant une fois, dans `src/format.js` :

```js
days(n) { return `${ADS.format.number(n)} jour${n > 1 ? 's' : ''}` }
```

Séparateur de milliers compris (« 1 823 jours »), zéro au singulier comme le français le
veut. Appliqué à `panel-cards.js` (carte chiffre, titre de la courbe, carte pâle),
`panel-sections.js` (voiture, vendeur, baisses) et au nom accessible du tracé. Et
`view.legend` passe de `duration` à `spell` : « Suivie depuis 1 jour » au lieu de
« Suivie depuis 1 j » — c'est une phrase du panneau, pas une pastille. La pastille de
carte, elle, garde son abréviation : la place y est comptée.

Tests : 0, 1, 2 jours, et 1 810 pour les milliers.

## 4. La courbe garde sa taille de texte en colonne étroite

**Choix : un repère en pixels d'écran, recalculé à la largeur disponible**, plutôt que
de sortir les libellés du SVG. Les deux sauvent le texte ; seul le premier garde le
calcul d'encombrement — c'est lui qui décide quel libellé cède quand deux se marchent
dessus, et il se fait sur des textes, en pixels. Hors du SVG, on ne saurait plus lesquels
se recouvrent sans mesurer quand même.

En pratique : `ADS.plot.draw(model, width)` pose `viewBox`, `width` et `height` sur la
même largeur — échelle 1, le corps déclaré est le corps affiché. La largeur ne se connaît
qu'une fois la carte posée : `ADS.plot.box` dessine à celle de la maquette, puis
`ADS.plot.fit(root)`, appelé par `panel.render` juste après l'insertion, mesure la boîte
et redessine. Le redimensionnement de la fenêtre rejoue `fit` (`src/detail.js`), sans
refaire le rendu. Le placement des libellés part dans `src/panel-labels.js`.

**Défaut trouvé au passage** : `.adscope-panel { all: initial }` rendait aussi
`box-sizing` à `content-box` — le panneau mesurait 100 % de sa colonne **plus** ses 40 px
de marge intérieure et débordait d'autant. Invisible à 620 px, où le maximum absorbait
l'écart ; franc en colonne étroite, avec le tracé qui sortait de sa carte.

Vérifié à 300, 400 et 620 px (tests) et à l'écran : `docs/panneau-courbe-etroite.png`
montre le même modèle à 300 px, avant et après.

## 5. Le panneau remonte en haut de la colonne principale

Cause confirmée sur les deux fiches sauvegardées, lues scripts désactivés — sous
JavaScript elles se réhydratent à vide. Les deux portent la même ossature, sous `<main>` :

| zone | contenu |
|---|---|
| `.carousel-area` | la galerie |
| `.side-area` | `#summary-information` : titre, prix, vendeur, boutons de contact |
| `.main-area` | `<section>` → `#classified-main-infos-v2`, puis `#classified-more-infos-v2` |

`#pavePrix`, l'ancre d'avant ce lot, vit dans `#classified-more-infos-v2` — **après six
autres pavés** (description, budget, garantie, assurance, historique, entretien). D'où
« super bas ». Le libellé d'ancienneté est pire encore : il ferme la page dans
`#container-references-info`.

Le placement part dans `src/sites/lacentrale-place.js`, sur le modèle de
`leboncoin-absence.js` : une étude de DOM dont la conclusion s'écrit une fois.

- **A, retenu** — devant `#classified-main-infos-v2`, sinon en tête de `.main-area`.
  Mesuré : panneau 620 px, tracé 532 px.
- **B, écarté** — après `[data-page-zone="syntheseAnnonce"]`, dans la colonne de droite.
  Mesuré : panneau 336 px, tracé 264 px, et planté entre le prix et « N° téléphone ».
- **Repli** — si A manque, sous `#pavePrix`. Jamais pas de panneau.

Aucune ancre n'est une classe de CSS-Modules : `SummaryInformation_header__6rt5E` est
régénérée à chaque build. Le garde-fou de `tests/lacentrale.test.mjs` le vérifie
désormais sur le hachage (`__xxxxx` dans un sélecteur) plutôt qu'en interdisant toute
classe — `.main-area`, que le site écrit à la main, sert d'ancre de repli.

Le contrat du registre change : `mount` rend un **endroit** — `{ parent, before }` — et
plus un voisin. En tête de colonne il n'y a personne derrière qui serve de repère.
`ADS.read.after / before / head` le construisent ; leboncoin est inchangé.

Tests : le panneau monte en A ; sans l'identifiant du bloc, la zone suffit ; sans colonne,
repli sous le prix ; idempotence conservée sur huit lots de mutations.

## Captures

Rendues dans un Chromium réel (playwright-core + le Chrome for Testing déjà installé),
sur un serveur statique lancé et arrêté par son PID. La fenêtre est servie telle quelle,
avec un `chrome.*` posé avant ses scripts ; la fiche est servie **sans ses propres
scripts**, réécrite à la volée par l'interception réseau.

- `docs/popup-v2-fiche.png` — sur une fiche, tout va bien
- `docs/popup-v2-alerte.png` — accès coupé + session tombée
- `docs/popup-v2-hors-site.png` — hors des deux sites
- `docs/panneau-lc-placement-a.png` / `-b.png` — la fiche La Centrale, 1440 px, pleine page
- `docs/panneau-courbe-etroite.png` — la courbe à 300 px, avant / après

Sur les deux captures de fiche, le logo du site apparaît sous la galerie : c'est la
bannière collante, qui sans JavaScript ne se repositionne pas. Artefact de la capture, pas
du panneau.

## À regarder par Alexis

1. **A ou B.** A est implémenté. B reste déclaré (`site.spots.b`) : basculer est une
   ligne. Les deux captures pleine page sont faites pour être posées côte à côte.
2. **Une seule ligne sur la fiche, est-ce assez ?** La popup ne dit plus que l'âge et la
   tenue du prix. Tout le reste — courbe, vendeur, sections — vit dans la page. Si la
   fenêtre doit redevenir utile quand le panneau ne s'affiche pas (site cassé, accès
   coupé), c'est un lot à part.
3. **Hors fiche, la fenêtre ne sait pas qu'elle est hors site.** Elle lit le dernier
   diagnostic écrit par un content script, qui est global et non par onglet : sur un
   onglet quelconque elle affiche donc le renvoi « Ouvre une annonce voiture sur… ».
   Savoir vraiment sur quel onglet on est demanderait `chrome.tabs.query` — l'URL revient
   déjà grâce aux `host_permissions` des deux sites. Non fait : hors périmètre du lot.
4. **`window_days` au pluriel forcé.** `panel-sections.js` écrit « ces 30 derniers
   jours » avec le seuil que l'API rend. À 1, ce serait « ces 1 derniers jours ». La
   fenêtre de l'API vaut 30 ; laissé tel quel plutôt que d'inventer un cas qui n'existe
   pas.
5. **Le plancher du tracé est passé de 240 à 180 px.** Au-dessus de 240 il mordait sur une
   colonne réelle de 300 px et le dessin sortait de sa carte. 180 ne se rencontre pas.
