# Challenge de la thèse « acquisition refondue » — angle risques et effets de bord

Contradicteur, 2026-09-25. Lecture seule sur le code, base `adscope` en
`default_transaction_read_only = on`. Aucune requête vers leboncoin ou La Centrale,
aucune licence lue, aucun processus touché.

Thèse challengée : `scratchpad/acquisition-these.md` (une seule file, deux moyens, la
page de résultats par défaut, péremption à 30 jours, le ratissage qui ralentit puis
s'arrête).

---

## Verdict en trois lignes

1. Les points 2 (parité carte/fiche) et 6 (l'ancienneté survit au retour) tiennent :
   vérifiés sur pièce, `leboncoin-ads.json` porte les 7 champs utiles sur 35/35 cartes
   et `publication.apply` ne fait jamais reculer `published_at`.
2. Le reste ne tient pas dans ces chiffres : la péremption à 30 j est une falaise datée
   (38 804 annonces lbc le 6-7 octobre, 16 588 La Centrale avant le 25), les pages de
   résultats ne peuvent pas atteindre 29,7 % du corpus (`sweep_split.cut` rend `None`),
   et le budget de 100 pages/jour divise par 9 le rythme mesuré aujourd'hui (≈ 930
   pages de résultats le 2026-09-25) alors que le tour du corpus en coûte 6 596.
3. Trois choses à faire avant de refondre quoi que ce soit : débloquer le garde-fou de
   flotte (suspendu 959 fois, 466/868 à l'instant), rendre le découpeur capable des
   dix plus grosses familles, et dire ce que devient La Centrale — qui est crawlée
   aujourd'hui, contrairement à la prémisse de la thèse.

---

## Ce qui a été mesuré (pour que chaque objection s'y rattache)

| Mesure | Valeur | Source |
|---|---|---|
| Annonces lbc en base / vivantes | 106 254 / 106 203 | `listings` |
| Annonces La Centrale / vivantes | 16 588 / 16 588 | `listings` |
| Vivantes non revues depuis 30 j **aujourd'hui** | **0** (lbc et lc) | `listings`, `now()` |
| Basculent le 2026-10-06 + 10-07 | 21 320 + 17 484 = **38 804** lbc | `last_seen + 30 j` |
| Basculent du 2026-10-19 au 10-25 | **16 565** lc sur 16 588 | idem |
| Disparitions écrites / absences en cours | 51 / 1 343 | `disappeared_at`, `absent_since` |
| Dernière disparition écrite | 2026-09-22 00:49 | `max(disappeared_at)` |
| Garde-fou de flotte, à l'instant | gone 509 / settled 819 = **62,1 %** (seuil 33 %) | `disappearance.fleet` rejoué |
| « écriture suspendue » dans le log API | **959 fois**, dernière 466/868 | `~/Library/Logs/adscope-api.log` |
| Réclamations `absence` en attente / écarts écrits | 43 / **0** | `rechecks`, `divergences` |
| Pages cumulées / annonces connues, lbc | 6 596 → 106 254 = **16,1 annonces/page** | `crawler/shards.json` |
| Pages cumulées / annonces connues, lc | 998 → 16 588 = **16,6 annonces/page** | `crawler/shards-lacentrale.json` |
| Pages de résultats ouvertes le 2026-09-25 | ≈ **931** (662 crawl lbc + 101 lc + 168 balayage) | `crawler/logs/2026-09.log` |
| Fiches ouvertes le 2026-09-25 | 680 (5 phases de revisite) | idem |
| Familles canon lbc | 920, dont **10 hors d'atteinte** de `cut` | simulation de `sweep_split.cut` |
| Annonces dans ces 10 familles | **31 559 = 29,7 %** du corpus lbc vivant | idem |
| Vendeurs pro lbc+lc / avec `seller_id` | 5 557 / 16 574 annonces | `listings` |
| Vendeurs pro dont **tout** le stock date du 6-7 sept | **868 sur 5 557 (15,6 %)** | `listings` |
| Empreintes portées par ≥ 2 annonces vivantes | 6 876 empreintes, **17 473 annonces (16,5 %)** | `fingerprint` |
| Les 51 disparues : avec département | **0** | `listings` |

---

## Objections

### 1. BLOQUANTE — La péremption à 30 j n'est pas un dégradé, c'est une falaise datée au 6 octobre

**Preuve.** Aujourd'hui **aucune** annonce vivante n'a `last_seen` au-delà de 30 jours :
la base est née le 2026-09-06, la plus ancienne vue a 19 jours. La règle ne retire donc
rien le jour où on la livre — et tout d'un coup ensuite. En datant chaque annonce
vivante à `last_seen + 30 jours` :

```
2026-10-06  lbc 21 320   lc     22
2026-10-07  lbc 17 484   lc      1
2026-10-19  lbc  4 274   lc    441
2026-10-21  lbc  1 879   lc  5 278
2026-10-22  lbc 18 280   lc  2 304
2026-10-24  lbc 15 897   lc  4 103
2026-10-25  lbc 15 172   lc  2 392
```

Le 6 et le 7 octobre, **38 804 annonces lbc (36,5 % des vivantes)** quittent
`/v1/market` sur deux jours consécutifs — ce sont exactement celles que le premier
passage du crawl a vues et que rien n'a revues depuis 19 jours, malgré 6 596 pages
crawlées. `market_query.core:97` ne filtre aujourd'hui que
`Listing.disappeared_at.is_(None)` : c'est le seul endroit du produit où la péremption
est réellement neuve (voir objection 9), et c'est celui qui encaisse la falaise.

Ces 38 804 ne survivront que si le ratissage continue — or la thèse le fait ralentir
puis s'arrêter (point 7). La péremption et la fin du ratissage sont donc deux moitiés
d'une même perte, présentées séparément.

**Alternative.** Ne pas retirer du marché : exposer `last_seen` dans `ItemOut` et laisser
la page griser + offrir un filtre, exactement comme `.superpowers/disparition-plan.md`
(§ « GET /v1/market », `probably_gone_at` « posé pour tous ») le fait déjà pour la
disparition probable. Si le retrait est voulu quand même : seuil dérivé du quantile
observé de `last_seen` par site, pas un 30 fixe, et une montée en charge sur deux
semaines — jamais une bascule de 38 804 lignes en deux jours.

---

### 2. BLOQUANTE — Les pages de résultats ne peuvent pas atteindre 29,7 % du corpus : `sweep_split.cut` rend `None`

**Preuve.** J'ai rejoué `sweep_split.cut` (ADS_PER_PAGE 35, PAGE_CAP 20, MAX_ENTRIES 8,
`_price_bounds` tel quel) sur les 106 197 annonces lbc vivantes à marque/modèle
canoniques, avec leur dernier prix réel. Résultat :

- 910 familles servables → 74 636 annonces (70,3 %), **3 757 pages** pour un tour ;
- **10 familles `trop_large`** → **31 559 annonces, 29,7 % du corpus lbc vivant**, qui
  n'entrent jamais dans la file. Ce sont les voitures les plus courantes du marché :

```
renault clio 6 933 · peugeot 207 3 731 · peugeot 206 3 624 · renault megane 3 508
citroen c3 3 275 · renault twingo 2 833 · volkswagen golf 2 771 · peugeot 308 1 923
peugeot 307 1 859 · porsche 911 1 102
```

La cause est dans `api/adscope_api/sweep_split.py:41-50` : quand `price_max is None`,
`_price_bounds` invente `5000` comme borne haute (`high = low * 2 if low else 5000`).
Le deuxième tour de coupe laisse donc un seau `3801-max` non borné, où tombent les
**24 864 annonces à plus de 3 800 € (23,4 %)**. `price_rounds < 2` puis `MAX_ENTRIES = 8`
s'épuisent, `cut` rend `None`, `sweep.py:69` journalise `trop_large` et l'entrée sort de
la file. La thèse fait de la page de résultats le moyen *par défaut* d'un corpus dont
elle n'atteint pas le tiers.

Combiné à l'objection 1 : ces 31 559 annonces sont périmées sans retour possible.

**Alternative.** Rendre le découpeur capable avant d'en faire le défaut : bornes de prix
lues sur la base (quantiles par famille) au lieu du 5 000 € en dur, et deux axes de
découpe supplémentaires déjà traduisibles sans risque — `regdate` et `locations`
(`sweep_url.py:102-111`, tous deux relevés sur une URL fabriquée par le site le
2026-09-22). Le plafond `MAX_ENTRIES` doit alors monter. À défaut : garder les tranches
de prix de `shards.json` comme moyen des grosses familles, et ne parler de « moyen par
défaut » que pour les 910 autres.

---

### 3. BLOQUANTE — La Centrale n'est pas « hors crawl », et le modèle ne lui laisse aucun moyen

**Preuve.** La prémisse de la thèse (« La Centrale hors crawl (DataDome) ») est fausse
au 2026-09-25 :

- `crawler/shards-lacentrale.json` porte **39 shards, 998 pages crawlées** ;
- `crawler/logs/2026-09.log`, ligne `2026-09-25T08:46:23 lc-5000-10000-part 101 14060` :
  101 pages ouvertes ce matin, « 24 annonces (firstOnlineDate) sur chacune » ;
- **16 565 des 16 588** annonces La Centrale ont été vues dans les 7 derniers jours.

La Centrale est donc alimentée aujourd'hui — par le ratissage exhaustif, précisément ce
que la thèse retire. Et dans le modèle proposé elle n'a **ni l'un ni l'autre des deux
moyens** :

- page de résultats : `sweep_url.translate` ne fabrique que du leboncoin
  (`CATEGORY = "2"`, `https://www.leboncoin.fr/recherche`, table `FUEL_CODES` relevée sur
  leboncoin) ;
- fiche : `revisit.ADDRESS = {"lbc": _lbc}` (`revisit.py:74`), et `revisit.due` rend `[]`
  pour tout autre site (ligne 117-119) ; `recheck.mark` refuse d'écrire pour un site
  absent d'`ADDRESS` (`recheck.py:43`).

Conséquence chiffrée : **13,5 % du corpus (16 588 annonces, 381 vendeurs pro nommés)**
cesse d'être observé le jour où le ratissage s'arrête, et périme intégralement entre le
19 et le 25 octobre. Le panneau La Centrale, remonté en tête de colonne par Alexis
(`docs/roadmap.md:116`), n'aurait plus que des annonces périmées à commenter.

**Alternative.** Choisir explicitement, et l'écrire dans la thèse : soit les shards La
Centrale restent un troisième moyen déclaré (et la thèse n'a plus « une seule file »,
elle en a une et demie), soit La Centrale sort du produit et il faut dire ce que le
panneau affiche sur une fiche lacentrale.fr.

---

### 4. SÉRIEUSE — Le garde-fou de flotte est déjà bloqué, et le modèle le rend inopérant dans les deux sens

**Preuve.** `disappearance.fleet` rejoué à l'instant (2026-09-25 22:37) sur la même
requête que le code : **gone 509, settled 819, soit 62,1 %** — le double du seuil
`GUARD_SHARE = 1/3`, et `settled ≥ GUARD_MIN = 30`. Donc `observe` rend `held` et
n'écrit rien. Ce n'est pas théorique : `~/Library/Logs/adscope-api.log` porte **959**
lignes « écriture suspendue », la dernière à « 466 disparitions pour 868 revisites ».
État en base : **1 343 absences en cours, 51 disparitions écrites, la dernière le
2026-09-22 00:49** — le tuyau est bouché depuis trois jours, et **0** ligne dans
`divergences` alors que 43 réclamations `absence` de marchands attendent le robot.

Le mécanisme, et c'est là que la thèse aggrave : le numérateur compte des absences qui
**persistent sans borne de temps** (le docstring de `disappearance.py` l'assume : « une
absence qui subsiste est courante par construction et n'a pas à être bornée »), tandis
que le dénominateur est une fenêtre de 24 h de fiches servies. La thèse fait de la fiche
un moyen résiduel (« découverte dans le temps restant », point 7). Quand le budget fiche
baisse, le dénominateur baisse ; sous `GUARD_MIN = 30` le garde-fou **cesse de retenir**
(`settled >= GUARD_MIN` est une condition d'activation) et la première refonte de
gabarit écrit sans garde. Aujourd'hui 680 fiches/jour donnent settled 819 ; il suffit
d'un matin où le balayage mange les 30 minutes pour que la population tombe à zéro.

**Alternative.** Réparer le garde-fou avant de déplacer la source des constatations :
borner le numérateur à la même fenêtre (`absent_since >= now - GUARD_WINDOW`), ou
calculer la part sur les fiches servies dans la fenêtre plutôt que sur l'état de la
base. Et donner à la fiche un budget **plancher**, pas un reste.

---

### 5. SÉRIEUSE — Le chiffrage : 16,1 annonces par page mesurées, pas 35 ; et le budget divise par 9 le rythme réel

**Preuve.** Trois mesures concordantes contre les 35 annonces/page du point 8 :

- `crawler/shards.json` : **6 596 pages cumulées pour 106 254 annonces lbc connues =
  16,1 annonces distinctes par page**. Le crawl couvre un shard dans les deux sens (asc
  1-100 puis desc 1-100) parce que le site plafonne à 100 pages — 200 pages pour les
  4 069 annonces du shard `lbc-c2-3800-3900-private` (log des 03:53, 06:54 et 09:54 du
  2026-09-25) = 20,3/page.
- `crawler/shards-lacentrale.json` : 998 pages pour 16 588 = **16,6/page**.
- Simulation du tour par familles (objection 2) : 3 757 pages pour 74 636 = **19,9/page**.

Donc un tour du corpus lbc vivant coûte **6 596 pages**, pas 3 000. À 100 pages/jour :
**66 jours** (corpus entier) ou **38 jours** (les 910 familles servables). La thèse dit
15 jours, et pose un seuil de péremption à 30. Le régime permanent qu'elle dessine est
celui où une part de la base est **toujours** périmée.

Second écart : le rythme réel. Le journal du 2026-09-25 donne **≈ 931 pages de résultats
ouvertes** (662 crawl lbc + 101 La Centrale + 168 balayage) et 680 fiches. Le budget de
100 pages/jour de la thèse **divise par 9,3** le rythme d'acquisition mesuré, tout en
gardant un seuil de 30 jours.

Troisième écart, mineur mais révélateur : la thèse part de « 71 600 annonces leboncoin en
base dont 45 000 non revues depuis le 6 sept ». Mesuré : **106 254** lbc (+ 16 588 lc) et
**38 804** vues le 6-7 septembre. Le dimensionnement repose sur un corpus sous-estimé de
33 %.

**Alternative.** Choisir les deux nombres ensemble, jamais l'un sans l'autre : soit le
seuil suit le tour mesuré (60 jours), soit le budget suit le seuil (≥ 220 pages/jour
pour les familles servables seules, davantage pour le corpus). Et rejouer la simulation
sur les totaux du **site**, pas de la base : le journal du 2026-09-23T22:02 lit 667 sur
leboncoin contre 280 attendus par la base, un facteur 2,4.

---

### 6. SÉRIEUSE — La disparition ne se constate que sur fiche, et rien dans le modèle ne dit *quelle* fiche ouvrir

**Preuve.** La thèse donne à « disparition probable » une fraîcheur due de quelques
heures (point 1), mais aucun mécanisme ne produit cet état :

- `disappearance.WRITES = "absent"` et seul `leboncoin-absence.js:61`
  (`props.ad === null` + signature du site) rend cette preuve : il faut une fiche ;
- une page de résultats ne dit jamais **qui** manque — elle rend un tableau `ads`, pas un
  complément ; et `RUNBOOK-balayage.md:14` interdit à la session de conclure quoi que ce
  soit (« Cette session ouvre des URL. Elle ne conclut rien. »), `coverage.py` ne mesure
  que sur `last_seen`.

Déduire l'absence d'un écart « connues dans la coupe » vs « lues sur les pages » n'est pas
tenable aux échelles mesurées : le plafond est `N = 20` pages soit 700 annonces par coupe
(`RUNBOOK-balayage.md:96`), et l'écart base/site atteint 2,4× (667 lus contre 280
attendus, log du 09-23). Tout ce qui dépasse le rang de prix 700 dans une coupe serait
donc marqué « probable » sans avoir bougé. Sur les 38 familles de plus de 700 annonces,
c'est systématique.

Ce que la thèse dissout est justement le seul sélecteur qui fonctionne sans page de
résultats : `revisit._rank` (`revisit.py:99-107`) — marqué au rang 0, demandé par un
marchand, pro et ancien, ancien, le reste. Il ne coûte aucune requête au site.

**Alternative.** Garder une file de fiches explicite avec un budget plancher, et garder
`_rank` comme sélecteur de fiche ; laisser le balayage ne faire qu'une chose, avancer
`last_seen`. Si un écart doit servir à quelque chose, ne le calculer que sur les coupes
dont le `total` lu est ≤ 665, et mesurer d'abord l'écart base/site coupe par coupe.

---

### 7. SÉRIEUSE — Le lot E a besoin de fiches, et le modèle lui en donne moins

**Preuve.** `docs/roadmap.md:44` : lot E dépend de « `disappeared_at` alimenté, donc
revisites qui tournent ». `docs/roadmap.md:118-125` : la règle « succession » exige le
département et le même vendeur si pro, et la mesure du 2026-09-20 a trouvé **zéro cas
réel** — « 11 disparitions confirmées, toutes sur des annonces d'avant le stockage du
département », avec consigne de remesurer vers le 1er octobre. État aujourd'hui :
**51 disparues, 0 avec département**, 38 pro. Le stock de matière du lot E est donc
toujours nul, à cinq jours de la date de remesure.

Or le lot E ne peut se nourrir que de fiches : `disappeared_at` s'écrit uniquement dans
`disappearance.observe`, sur preuve `absent` de fiche, après deux constatations à 6 h. La
thèse réduit la fiche au reste du budget (point 7) pendant que le garde-fou bloque
l'écriture (objection 4). Les deux verrous jouent dans le même sens.

**Alternative.** Débloquer le garde-fou puis laisser tourner une semaine de fiches au
rythme mesuré (680/jour le 2026-09-25) pour donner au lot E sa mesure du 1er octobre —
et décider du partage de budget *après*, sur des chiffres. Pas avant.

---

### 8. MINEURE — Les points 4 et 5 sont déjà décidés, plus finement, et le point 4 contredit une décision prise il y a quatre heures

**Preuve.** `.superpowers/disparition-plan.md` (commit `f62465f`, 2026-09-25 22:19,
772 lignes) porte déjà les quatre états, les « deux voix », la réversibilité, la
migration 017 non destructive (`listings.probably_gone_at`, table `absence_reports` clé
`(listing_id, actor)`) et le filtrage par compte du marché et des alertes.

Et son § 2.4 conclut l'**inverse** du point 4 de la thèse (« un fait est confirmé par
deux comptes distincts, robot inclus, il compte un ») : le robot doit confirmer seul,
« sinon `disappeared_at` devient une colonne morte », parce qu'il est aujourd'hui la seule
source. La base le confirme : **51 disparitions, toutes issues des revisites du robot ;
43 réclamations `absence` de marchands en attente ; 0 divergence écrite**. Lue à la
lettre, la thèse rétrograderait ces 51 en « probable » et le produit n'aurait plus aucune
disparition ferme.

**Alternative.** Laisser le plan de disparition faire foi sur les points 4 et 5, et
restreindre la thèse aux points 1-3 et 6-8. Sinon, rouvrir explicitement le § 2.4 avec
l'argument qui le contredit — il n'y en a pas dans la thèse.

---

### 9. MINEURE — La péremption est déjà faite aux deux endroits où elle protégeait ; elle n'est neuve que là où elle casse

**Preuve.** Le point 6 annonce « sort du marché, des stats vendeur et des alertes ». Deux
des trois existent déjà :

- **stats vendeur** : `sellers.py:31` `ONLINE_WINDOW_DAYS = 30`, appliqué en
  `sellers.py:75` (`Listing.last_seen >= now - timedelta(days=ONLINE_WINDOW_DAYS)`), avec
  le motif écrit dans le docstring — « celle que personne n'a revue depuis un mois a de
  fortes chances d'être partie ». Même seuil, même sens.
- **alertes** : `alert_rules.py:27` `SEEN_WINDOW = timedelta(hours=48)`, appliqué en
  `alert_rules.py:54`. Bien plus serré que 30 jours.

Reste `/v1/market` (`market_query.core:97`), c'est-à-dire exactement le siège de la
falaise de l'objection 1.

Et du côté vendeur, ce que la règle *ajouterait* est pire que rien : mesuré, **868 des
5 557 vendeurs pro (15,6 %)** ont l'intégralité de leur stock connu vu le 6-7 septembre.
`stats_for` rend `None` quand la population est vide (`sellers.py:81-82`) : la section
« Ce vendeur » **disparaît** du panneau au lieu de dire « non vérifié ». 1 357 vendeurs de
plus (24,4 %) sont amputés d'une partie de leur stock, ce qui décale `median_age_days` et
`over_a_month_share` sans le signaler.

**Alternative.** Écrire que la péremption ne concerne que le marché, et ajouter à
`SellerStatsOut` un compte « non vérifié depuis N j » — une section qui dit son trou vaut
mieux qu'une section absente.

---

### 10. MINEURE — « Ancienneté réelle » survit au retour (le point tient), mais le doublon ne survit pas à l'absence de fiche

**Preuve, favorable d'abord.** `publication.apply` (`publication.py:14-30`) prend un
`min` sur `published_at` et sur `site_published_first`, un `max` sur `bumped_at` : une
annonce périmée puis revue garde sa date de mise en ligne réelle, `market_query.age_expr`
la recalcule à l'identique. **Le point 6 de la thèse tient sur ce point précis** :
« revient dès qu'elle est revue » ne coûte pas l'ancienneté.

**Preuve, défavorable ensuite.** **6 876 empreintes portent 2 annonces vivantes ou plus,
soit 17 473 annonces (16,5 % du corpus lbc vivant)**. Une annonce périmée puis revenue et
sa republication coexistent alors dans le marché, avec deux âges différents pour la même
voiture — et seul le lot E sait les séparer, qui a besoin de fiches (objection 7). La
péremption ne résout pas le doublon, elle le masque trente jours puis le rend.

**Alternative.** Publier le chiffre de doublons en même temps que la péremption, et
conditionner la pastille « ancienneté réelle » au lot E pour les annonces dont l'empreinte
est partagée.

---

### 11. MINEURE — Juridique : à volume de requêtes égal l'exposition ne baisse pas ; ce qui disparaît, c'est la preuve d'un périmètre borné

**Preuve.** Le coût par annonce est le même dans les deux régimes : **16,1 annonces par
page** pour le ratissage par tranches de prix (`shards.json`, 6 596 pages → 106 254
annonces), **19,9** pour le tour par familles simulé (3 757 pages → 74 636). Mêmes
requêtes, même site, même navigateur, à un cinquième près — et *moins* d'annonces
couvertes pour les familles. Rien dans ces chiffres ne soutient « réduire le ratissage
réduit l'exposition ».

Surtout, le point 2 de la thèse dit que le serveur compose une URL « pour la recherche qui
la contient, **enregistrée ou non** ». Il y a **920 familles canon** dans la base : composer
une recherche pour chacune *est* un ratissage exhaustif, écrit autrement. La couverture
visée n'est pas réduite, elle est renommée.

Ce qui est réellement perdu, c'est `crawler/shards.json` : **89 shards déclarés**, un plan
avec sa progression, c'est-à-dire l'artefact qui permettrait de montrer un périmètre
borné. Et `docs/roadmap.md:141-143` dit que la question posée à l'avocat est exactement
celle-là — « droit des bases de données et balayage complet contre périmètre par
familles » — et qu'elle **n'a pas encore été posée**. La thèse tranche une question
juridique ouverte, dans le sens qui supprime la pièce justificative.

**Alternative.** Ne pas revendiquer un gain juridique non mesuré. Si le but est de réduire
l'exposition, réduire le **nombre de pages** (et accepter un tour plus long) : c'est le
seul levier mesurable. Et garder un plan déclaré avec sa progression — la thèse en prévoit
un au point 7 (« un plan de shards avec sa progression ») ; dire explicitement que c'est
lui la pièce juridique, pas un vestige du régime précédent.

---

## Ce qui tient après examen

- **Point 2, parité carte/fiche sur leboncoin.** Vérifié sur pièce : la fixture
  `extension/tests/fixtures/leboncoin-ads.json` est une charge de page de résultats de
  35 annonces, et **35/35** portent `price`, `first_publication_date`, `index_date`,
  `brand`, `model`, `regdate`, `mileage`, `fuel`, `gearbox` ; `u_car_version` sur 17/35
  (48,6 %), cohérent avec les 34,1 % de `version` renseignés en base. Le test
  `extension/tests/vehicle-fields.test.mjs:55` l'affirme en propre : « leboncoin —
  fiches : la même lecture qu'une carte », et `leboncoin.js` n'a qu'un seul `normalize`
  pour les deux. L'identité du vendeur passe aussi par la carte : **16 193 des 20 518
  annonces pro lbc vivantes (78,9 %) portent un `seller_id`**, alors que seulement 3 538
  fiches ont jamais été servies. La fiche n'apporte, de fait, que l'absence.
- **Point 6, le retour n'efface pas l'ancienneté.** `publication.apply`, cf. objection 10.
- **Point 1, la priorité par retard sur une échéance** est plus juste que la nature de la
  file : `revisit.QUIET` (3 j) le fait déjà à moitié, et `_rank` mélange déjà demande
  marchand, type de vendeur et ancienneté sans se soucier de la provenance. Rien dans les
  mesures ne s'y oppose.

## Ce qu'il faudrait mesurer avant de trancher

1. Le total **du site** (pas de la base) pour les 10 familles hors d'atteinte : sans lui,
   on ne sait pas si un découpage prix/année/département les rend servables.
2. L'écart base/site coupe par coupe (le journal n'a que Tesla Model Y : 667 vs 280,
   puis 419 vs 355 après stabilisation).
3. Le rythme de fiches nécessaire pour vider les 1 343 absences en cours une fois le
   garde-fou réparé — c'est le plancher du budget fiche, et il n'est pas connu.
