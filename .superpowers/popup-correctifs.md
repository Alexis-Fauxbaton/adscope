# Les quatre défauts de la revue popup, soldés

Branche `feat/api`, sur `9681bd5` (« La popup devient la surface principale sur les fiches »).
La refonte n'a pas été retouchée : mise en page, courbe, hiérarchie et vocabulaire sont ceux
qui ont été jugés conformes.

Tests : **278 verts** côté extension (265 auparavant, 13 ajoutés), **149 verts** côté API.

Chaque test ajouté est accompagné, plus bas, de la ligne de production dont le retrait le
fait rougir. Les quinze mutations ont été jouées ; les quinze rougissent.

---

## Bloquant 1 — un âge que rien ne porte

### La cause, sur tout le chemin

**Extraction.** Elle est correcte et le reste : `date(s)` rend `null` quand la charge porte
la clé sans valeur, et c'est le bon comportement — l'annonce existe, sa date non. Le défaut
n'est pas là.

**Signaux.** C'est là. `Math.floor((now - listed.publishedAt) / DAY)` coerce `null` en `0`,
donc en époque Unix : 20 702 jours. Et la contagion suivait — `capped` vrai, donc `notable`
vrai, donc badge rouge, donc `old` vrai, donc le résumé faussé ; et `bumpedAt - publishedAt`
mesuré depuis 1970 rendait `bumped` toujours vrai.

**leboncoin produisait le même cas**, vérifié : `isAd` n'exige que la présence de
`first_publication_date`, `parseDate` rend `null` sur une valeur vide, et
`listing.bumpedAt - listing.publishedAt` n'avait aucune garde. Les deux modules sont
corrigés de la même façon.

Les deux `signals` rendent désormais `onlineDays: null`, et **rien de ce qui en dépend** :
`bumped`, `capped`, `notable`, `old`, `dormant` sont faux, `bumpedDaysAgo` nul. La garde est
explicite (`online != null`), jamais laissée à la coercition — c'était la coercition, le
défaut.

### L'affichage : refuser, plutôt qu'inventer

Trois surfaces montrent cet âge, les trois refusent maintenant :

| surface | avant | après |
|---|---|---|
| pastille de carte (`view.age`) | « 56 ans en ligne » | « date absente de la page » |
| panneau de fiche (`view.panel`) | « En ligne depuis · 56 ans » | « En ligne depuis · date absente de la page » |
| sujet de la fenêtre (`fiche.show`) | « 56 ans 8 mois · 20 702 j » en 27 px | « date absente de la page » en 15 px, sans compte de jours |

Le constant `UNDATED` de `view.js` porte la phrase pour les deux surfaces de page ; la
fenêtre en a sa version, plus une classe `.age--undated` qui rend au refus la discrétion
qui lui revient — il ne prend pas la place du sujet, il dit qu'il n'y a pas de sujet.

La courbe, elle, gagne un point d'honnêteté qui manquait : `publishedAt: card.publishedAt ||
now` repliait l'axe sur un seul jour et écrasait les cinq observations du suivi sur une
même abscisse. L'axe part désormais de la première observation quand la mise en ligne
manque — c'est le plus ancien fait que nous ayons.

### Rendu réel, fiche La Centrale sans date

`.superpowers/rendu/apres-fiche-sans-date.png`. Mesuré au navigateur sur le statut que le
content script écrit vraiment :

```
EN LIGNE DEPUIS
date absente de la page          (15 px, --mute ; aucun chiffre dans le sujet)
PRIX OBSERVÉ
[courbe]  11 mai 2026 → auj.     (l'axe part de la première observation)
```

`age-days` masqué, pas de bande rouge, pas de bloc de contradiction — sans date il n'y a
rien à opposer au site. `card.onlineDays: null`, `card.publishedAt: null`, `alerts: 0`.

---

## Bloquant 2 — la sonde descend au registre

`nextData: !!document.getElementById('__NEXT_DATA__')` a quitté `diag.js`. Chaque site
déclare désormais `payload(doc)` — « comment je constate que ma charge est là » :

- **leboncoin** : le bloc que son rendu serveur écrit, `__NEXT_DATA__`.
- **La Centrale** : le nom des globales qui portent sa charge, une par surface —
  `CLASSIFIED_MORE_INFOS` sur une fiche, `__PRELOADED_STATE_LISTING__` sur des résultats.
  C'est son contrat, au même titre que le bloc de l'autre, et non une classe régénérée à
  chaque build.

Le champ du diagnostic s'appelle `payload` : `nextData` nommait la structure d'un seul site
jusque dans le stockage et jusque dans `report.js`.

`diag.js` résout le site une fois au lieu de deux, et le repli est explicite : un site sans
sonde rend `false`, comme avant.

### Rendu réel, les deux surfaces La Centrale

`.superpowers/rendu/apres-resultats.png`. « **Données trouvées : oui** » en encre, sur les
deux pages, et la phrase « la page ne contient pas le bloc de données attendu » a disparu.
Le seul avertissement restant sur ces captures est celui, exact, de l'absence d'API dans le
banc de rendu.

---

## Bloquant 3 — les compteurs, verrouillés sur des valeurs calculées à la main

### Le compte, refait

Fixture `lacentrale-resultats.json`, 23 cartes, au **6 septembre 2026 18 h UTC** — le jour
du relevé des pages sauvegardées. `onlineDays = ⌊(NOW − firstOnlineDate)/86 400 000⌋`,
la date de carte valant minuit UTC.

Repères de calendrier 2026 (jour de l'an = 0) : 1ᵉʳ fév. 31, mars 59, avril 90, mai 120,
juin 151, juillet 181, août 212, sept. 243. NOW = 243 + 5 + 0,75 = **248,75**.

| réf. | mise en ligne | indice | âge | ≥ 31 | > 60 |
|---|---|---|---|---|---|
| W103496285 | 04-06 | 154 | 94 | ✓ | ✓ |
| W103536233 | 08-08 | 219 | 29 | | |
| W103527802 | 23-07 | 203 | 45 | ✓ | |
| W103538172 | 14-08 | 225 | 23 | | |
| W103527811 | 23-07 | 203 | 45 | ✓ | |
| W103531664 | 30-07 | 210 | 38 | ✓ | |
| W103527309 | 23-07 | 203 | 45 | ✓ | |
| W103538290 | 14-08 | 225 | 23 | | |
| W103540426 | 21-08 | 232 | 16 | | |
| W103546110 | 01-09 | 243 | 5 | | |
| W103512799 | 29-06 | 179 | 69 | ✓ | ✓ |
| W103536232 | 08-08 | 219 | 29 | | |
| E119712438 | 12-08 | 223 | 25 | | |
| E119732999 | 15-08 | 226 | 22 | | |
| E118964769 | 02-05 | 121 | 127 | ✓ | ✓ |
| W103502823 | 13-06 | 163 | 85 | ✓ | ✓ |
| W103409201 | 02-02 | 32 | 216 | ✓ | ✓ |
| W103515169 | 02-07 | 182 | 66 | ✓ | ✓ |
| W103504812 | 17-06 | 167 | 81 | ✓ | ✓ |
| E119605541 | 27-07 | 207 | 41 | ✓ | |
| E119524952 | 15-07 | 195 | 53 | ✓ | |
| W103544019 | 28-08 | 239 | 9 | | |
| W103515242 | 02-07 | 182 | 66 | ✓ | ✓ |

**14 au-delà du seuil d'ancienneté** (31 j), **8 au-delà du plafond** (60 j), donc 8 en
alerte — `notable` valant `capped` sur ce site.

Le compte a été refait deux fois : à la main par la table ci-dessus, puis par un script
indépendant du code de production (`Math.floor((NOW - new Date(c.firstOnlineDate))/86400000)`
sur la fixture brute). Les deux donnent 14 et 8. Les valeurs annoncées par le relecteur sont
confirmées, et non reprises.

Aucune annonce ne s'approche des bornes à moins d'un jour : sous le seuil, le plus proche est
à 29,75 j (il en faudrait 1,25 de plus) ; au plafond, 53,75 et 66,75 encadrent 60 avec plus
de six jours de marge. L'heure du relevé ne peut donc pas faire basculer un compte.

### L'horloge, tenue fixe

`listing.js` appelle `new Date()`. Les tests qui assèrent 14 et 8 encadrent le rendu par
`at('2026-09-06T18:00:00Z', …)` — ajouté à `tests/stage.mjs` : `Date` est remplacée le temps
d'un rendu par une sous-classe dont le constructeur sans argument rend l'instant du relevé,
puis rétablie. Sans cela le test dériverait d'un cran par jour.

### Les deux tautologies, retirées

- `badge.test.mjs:80` comparait `said.at(-1).alerts` à `w.status().alerts` : les deux
  sortent du même objet `counts`, l'égalité tenait à 0 = 0. Le test assère maintenant **8**,
  la valeur de la table.
- `diag.test.mjs:139` n'assérait que des types et deux inégalités qui tiennent à 0 ≤ 0. Il
  joue maintenant deux pages leboncoin d'âge choisi : une annonce de 128 jours réactualisée
  cinq jours plus tôt (seuil dépassé **et** alerte → 1 et 1), puis la même à cinq jours
  (0 et 0). Sans les deux cas, « aucune alerte » et « une alerte » resteraient
  indistinguables.
- `badge.test.mjs:85` faisait de même sur une fiche (`alerts === card.notable ? 1 : 0`,
  vrai par construction) : les deux cas y sont désormais posés séparément.

---

## Important 4 — le socle d'accessibilité

Mesures refaites au navigateur sur le rendu final (Chromium, `getComputedStyle` +
formule WCAG), pas seulement calculées :

| ce qui est mesuré | avant | après | seuil |
|---|---|---|---|
| `--mute` sur le papier (`.specs`, `.axis`, `.label`, étiquettes de ligne, `.note`) | 4,11 | **4,83** | 4,5 |
| `--mute` sur la carte (`.hint`) | 4,40 | **5,17** | 4,5 |
| `--faint`, remplissage des petits points | 2,37 | **3,34** | 3 |
| anneau de focus `input:focus` sur le champ | 2,37 | **14,37** | 3 |
| `--ok` sur le papier (`.note.ok`, 12 px) | 4,49 | **5,60** | 4,5 |
| `--warn` sur le papier (`.note.warn`, 12 px) | 4,49 | **5,66** | 4,5 |

Les deux dernières lignes n'étaient pas au relevé : elles manquaient le seuil d'un centième,
et c'est du texte de 12 px. Corrigées dans le même geste, même teinte.

La direction tient : ce sont les mêmes gris, deux crans plus sombres, sur le même papier et
la même encre. Aucun jeton de couleur n'a changé de rôle, aucune n'a changé de famille.

**Anneau de focus.** Il remplaçait l'anneau natif par plus faible que lui ; il porte
maintenant l'encre — 12,86:1 sur le papier, 14,37:1 sur le champ blanc qu'ouvre le focus.

**Jeton insécable de 70 caractères.** `.subject` et `#seller-title` portent
`overflow-wrap: anywhere`. Mesuré : `scrollWidth` 340 pour `clientWidth` 340 sur les deux —
plus de débordement, et `document.documentElement` ne défile pas horizontalement.

**Nom accessible de la courbe.** Le `<svg role="img">` porte un `<title id="plot-name">`
référencé par `aria-labelledby`, composé sans balisage :

> « Prix observé, du 22 sept. 2021 à aujourd'hui — 5 observations, dernier prix 22 700 € »

**Clavier.** Le choix jugé proportionné : un tableau des valeurs plutôt qu'une navigation
point par point. Sous la courbe, un repli « Relevé des observations » — atteint à la
tabulation, ouvert à l'entrée, et qui rend en toutes lettres ce que le survol dit à la
souris :

```
11 mai 2026        24 900 € changement
8 juin 2026        23 900 € changement
15 juin 2026       23 900 € vérification
20 juillet 2026    22 700 € changement
4 septembre 2026   22 700 € vérification
```

Le mot final distingue les trois signes que la conception nomme — gros point, petit point —
sans dépendre de leur taille ni de leur couleur. Le repli reste masqué quand il n'y a rien à
énumérer. Ordre de tabulation vérifié : les deux `summary` de la fenêtre viennent avant les
champs du dépannage.

---

## Mineur 5 — `unshown`, affiché

Le champ est rendu, il n'est pas retiré : c'est un fait que le diagnostic sait et que la
fenêtre taisait, et le message du commit d627056 disait vrai sur l'intention. Une ligne dans
le relevé des résultats, entre « Annonces lues » et « Pro / particuliers » :

```
Annonces lues            23
En réserve, sans carte    6
Pro / particuliers     23 / 0
Pastilles posées         23
```

Six : c'est le nombre relevé sous `boostVo.similarHits` le 2026-09-06. Un diagnostic écrit
avant ce champ affiche `0` sans trouer le relevé ; une fiche, qui n'a pas de cartes, ne porte
pas la ligne. L'écart entre ce que le dépôt dit et ce qu'il fait est refermé.

---

## Les tests ajoutés, et la ligne que chacun verrouille

Quinze mutations jouées, quinze rouges. Aucune n'a été retenue au dépôt.

| ligne de production retirée | fichier | tests qui rougissent |
|---|---|---|
| garde `listed.publishedAt ? … : null` dans `signals` | `src/sites/lacentrale.js` | « sans date de mise en ligne, aucun site n'énonce d'âge » · « une annonce sans date ne reçoit ni âge ni signal » · « une carte sans date n'énonce aucun âge et ne met rien en alerte » · « sur une fiche sans date, le panneau et la fenêtre refusent d'épeler un âge » |
| garde `online != null` de `bumped` | `src/sites/lacentrale.js` | les deux premiers ci-dessus |
| `payload` retiré du registre du site | `src/sites/lacentrale.js` | « chaque site constate lui-même que sa charge est présente » · « la charge du site se constate par les globales que ses pages portent » · « sur les deux surfaces du site, la charge est constatée présente » |
| garde `listing.publishedAt ? … : null` | `src/sites/leboncoin.js` | « sans date de mise en ligne, aucun site n'énonce d'âge » |
| garde `online != null` de `bumped` | `src/sites/leboncoin.js` | idem |
| `payload: site.payload(document)` remplacé par la sonde `__NEXT_DATA__` | `src/diag.js` | « sur les deux surfaces du site, la charge est constatée présente » |
| `if (s.old) counts.old++` | `src/listing.js` | « le résumé des résultats compte le seuil dépassé et les alertes » (14) · « le diagnostic des résultats compte ce qui dépasse le seuil et ce qui alerte » |
| `if (s.notable) counts.alerts++` | `src/listing.js` | les deux ci-dessus (8) · « une page de résultats annonce ce qu'elle a mis en alerte » |
| ligne « En réserve, sans carte » | `popup/report.js` | « les annonces que la charge porte sans carte sont dites » |
| `if (s.onlineDays == null) return UNDATED` dans `age` | `src/view.js` | « une carte sans date n'énonce aucun âge et ne met rien en alerte » |
| refus dans la ligne « En ligne depuis » du panneau | `src/view.js` | « sur une fiche sans date, le panneau et la fenêtre refusent d'épeler un âge » |
| refus dans le sujet de la fenêtre | `popup/fiche.js` | « sans date de mise en ligne, la fenêtre n'énonce aucun âge » |
| repli de l'axe sur la première observation | `popup/fiche.js` | idem (les cinq abscisses s'écrasent en une) |
| `fill('points-rows', …)` | `popup/fiche.js` | « la courbe porte un nom accessible et son relevé de valeurs » · « sans observation, le relevé ne s'ouvre pas sur du vide » |
| `<title id="plot-name">` de la courbe | `popup/chart.js` | « la courbe porte un nom accessible et son relevé de valeurs » |

Le test qui verrouille l'axe a d'abord été écrit faux : il comptait les points, or ils
restent cinq quand l'axe se replie — ils s'empilent seulement sur la même abscisse. La
mutation l'a montré vert, et il assère depuis cinq abscisses distinctes.

---

## Ce qui reste, et n'a pas été touché

- **`--rule` à 1,71:1 sur le papier**, en trame de la hachure et en ligne de base de la
  courbe. La hachure est l'un des trois signes nommés par la conception, mais elle porte
  toujours sa phrase — dans la bande quand elle est large, sous l'axe sinon — donc son sens
  ne repose jamais sur le seul graphique. La ligne de base ne porte aucune information.
  Signalé, non corrigé : l'assombrir change le poids visuel de la courbe entière.
- **`--line` à 1,35:1**, bordure des champs de saisie et des encarts. Un champ de saisie est
  un composant d'interface, et sa limite demande 3:1 ; son fond (`--card`) ne le détache
  pratiquement pas du papier. C'est un défaut réel, non relevé, et le corriger touche la
  bordure de chaque encart de la fenêtre — hors du périmètre de ce lot, à trancher.
- **Chevauchement d'étiquettes sur la fiche plafonnée** : à 1 810 jours d'axe, la phrase de
  la hachure et le montant de droite se recouvrent (visible sur
  `apres-fiche-plafonnee.png`). Antérieur à ce lot — ni `chart.js` ni `curve.js` n'ont
  changé de géométrie — et la consigne était de ne pas refaire la refonte.
- **`format.duration(null)`** rend encore « moins d'un jour ». Plus aucun appelant ne lui
  passe `null` ; l'y garder capable de mentir a été préféré à une garde défensive qui
  masquerait le retour d'un `onlineDays` nul là où il ne devrait plus arriver.

## Rendu conservé

- `.superpowers/rendu/apres-fiche-plafonnee.png` — la fiche à 1 810 jours, diagnostic ouvert.
- `.superpowers/rendu/apres-fiche-sans-date.png` — la même fiche privée de `creationDate`.
- `.superpowers/rendu/apres-resultats.png` — les 23 résultats, résumé 23 / 14 / 8 et relevé.

Les trois sont rendus à partir des statuts que les content scripts écrivent réellement sur
les deux pages sauvegardées, joués dans le banc de test puis servis à un navigateur.
