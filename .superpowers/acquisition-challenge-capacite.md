# Challenge de la thèse d'acquisition — angle capacité et chiffres

Dépôt `/Users/alexis/Documents/Projets/adscope`, branche `feat/api`, 2026-09-25.
Lecture seule sur le code, base `adscope` en `default_transaction_read_only = on`,
aucune requête vers leboncoin / La Centrale / l'API. Sources : `crawler/logs/2026-09.log`
(258 lignes, 2026-09-06T08:22 → 2026-09-25T20:00), `crawler/shards.json` (89 shards),
la base, et les fichiers cités.

## Verdict en trois lignes

1. Les trois chiffres de fondation du point 8 sont faux dans le même sens : 400 fiches/run
   vaut 144 mesurées, 3 000 fiches/jour vaut 780, 35 annonces par page vaut 18,3 — et le
   « tour du corpus » n'a jamais eu lieu : 54 % seulement de ce que leboncoin annonce est
   entré en base sur les tranches déclarées COMPLET.
2. La file de fraîcheur dépasse la capacité à **7 recherches enregistrées** au rythme
   réellement journalisé (48 à une par jour stricte) — pas à 50 marchands ; et la plus
   grosse famille de la base, Renault Clio (6 933), n'est déjà plus couvrable par le split
   (`sweep_split.py` plafonne à 5 600).
3. Le point 7 (arrêter le ratissage, se replier sur le périmètre des recherches) n'est pas
   une trajectoire : c'est la seule décision qui fait tenir l'arithmétique. Il doit passer
   en tête de la thèse, et les tiers de fraîcheur doivent être dérivés d'un budget de
   pages/jour mesuré, pas promis.

---

## 1. Le corpus de la thèse est périmé (bloquante, sur les prémisses)

La thèse annonce « 71 600 annonces leboncoin en base dont 45 000 non revues depuis le 6 sept ».

    site |   n    | vivantes
    lbc  | 106254 |  106203
    lc   |  16588 |   16588        → 122 791 vivantes au total

`lbc` porte 106 203 annonces vivantes, soit +48 % sur le chiffre de la thèse. Le docstring de
`api/adscope_api/revisit.py:5` est encore plus loin derrière : « Les 43 457 annonces de la
base ne se revisitent donc pas toutes » — facteur 2,4.

Tous les calculs du point 8 sont faits sur un corpus 1,5 fois plus petit que le vrai, et
sur un corpus qui va encore grossir (§4).

**Alternative** : recalculer le point 8 sur un chiffre lu en base le jour de l'écriture, et
poser dans le plan que ce chiffre est une variable, pas une constante.

## 2. « 400 fiches/run », « 3 000 fiches/jour » (bloquante)

13 runs de revisite réussis depuis le 2026-09-23 (régime stabilisé) :

    160 150 130 145 145 160 160 145 150 130 155 120 125
    total 1 875 — moyenne 144,2/run — max 160

Le maximum jamais atteint par un run planifié est 200 (2026-09-22T19:59). **400 fiches/run
surévalue de 2,8×.** Par jour : 740 fiches le 09-24, 825 le 09-25, contre 3 000 annoncées —
**facteur 3,6 à 4**.

La cause est journalisée par le crawler lui-même, ligne du 2026-09-25T16:58 :

> pace reellement mesure sur ce run ~9,5 s/fiche (100 fiches en 930 s) contre les 8 s du bareme

`crawler/RUNBOOK-revisites.md:108` calcule `limit = min(100, (secondes restantes - 90) / 8)`.
Le barème de 8 s est 19 % optimiste sur la mesure.

Et 3 des 16 runs depuis le 09-23 ont rendu 0 fiche (`error: selection navigateur requise`,
`error: 2 Chrome connectes`) — **19 % de perte sèche** qu'aucun chiffre de la thèse n'absorbe.

**Alternative** : porter le barème à 10 s/fiche, et écrire la capacité en fiches/jour
*servies* (≈ 800) plutôt qu'en fiches/run théoriques.

## 3. « 100 pages/jour ≈ 3 500 annonces/jour » se contredit deux fois (sérieuse)

Pages de balayage réellement ouvertes, par jour :

    09-19  211    09-22 1445    09-25 1049 (+169 de sweep = 1218)
    09-20  584    09-23  208
    09-21  783    09-24  961 (+116 = 1077)

Le point 8 est faux dans les deux sens à la fois : **100 pages/jour est 10× sous la machine**,
et **3 500 annonces/jour est 4× sous la machine**. Les deux moitiés du même chiffrage ne se
raccordent pas.

Le nombre qui compte, lui, est surévalué. Sur 09-19 → 09-25 : 101 338 observations
(`price_points`) portant sur 78 827 annonces distinctes = 14 477 annonces distinctes/jour ;
5 577 pages ouvertes sur la même fenêtre (797/jour) et ~740 fiches/jour. Donc

    (14 477 − 740) / 797 = 17,2 annonces distinctes par page ouverte

`sweep_split.py:19` pose `ADS_PER_PAGE = 35`. **Le rendement réel est la moitié de
l'hypothèse**, et c'est sur 35 que repose « la page de résultats est le moyen par défaut ».

## 4. « Le tour du corpus en ~15 jours » : le tour n'a pas commencé (bloquante)

Après **19 jours** de ratissage : 37 shards complets sur 89. 51 shards jamais touchés, dont
50 avec `est_count` toujours `null`. Prix maximum atteint : **4 000 € en private**, 4 000 €
en pro (plus le shard `60000-max` fait le 09-06).

Conséquence directe en base : **88,8 % du corpus `lbc` est sous 4 300 €**. Le corpus n'est
pas une image du marché, c'est une image du bas du marché.

    lbc  <4300      94 310   88,8 %
    lbc  4300-10k    1 704    1,6 %
    lbc  10k-20k     4 095    3,9 %
    lbc  >=20k       6 094    5,7 %

Et la densité *monte* avec le prix, là où on s'est arrêté. Les trois derniers sondages ont
tous splitté :

    4000-4300 → est 8 626  (2 875 / 100 €)
    4300-4500 → est 7 381  (3 690 / 100 €)
    4000-4200 → est 7 021  (3 510 / 100 €)

6 596 pages faites ; **au moins 10 545 restent** sur le plan tel qu'il est écrit, et le plan
grossit à chaque passage (27 événements `split` en 258 lignes de log). Si la densité tenait
seulement 3 000 / 100 € jusqu'à 10 000 €, la seule tranche 4 000–10 000 € ajoute ~170 000
annonces et ~12 000 pages. « 15 jours » est une durée calculée sur un tiers du corpus que le
plan lui-même est en train de produire.

**Alternative** : soit décider tout de suite le point 7 (arrêter le ratissage au-dessus d'un
prix, et dire dans le produit que le corpus est le bas du marché), soit chiffrer le plan
restant avant d'annoncer une durée.

## 5. Sur les tranches déclarées COMPLET, il manque 46 % (bloquante)

Sur les 31 shards private `COMPLET` couvrant 0–4 000 € (`last_crawled` posé, pas de `resume`) :

    somme des est_count annoncés par leboncoin : 138 543
    annonces private lbc en base sous 4 000 €  :  74 262   →  54 %

Côté pro c'est 15 480 annoncés pour 14 168 en base (92 %). Par shard, l'écart va de **20 % à
108 %** :

    lbc-c2-2950-3000-private  est 6203  en base 1232   20 %   13 prix distincts
    lbc-c2-3950-4000-private  est 5614  en base 1238   22 %   14 prix distincts
    lbc-c2-3400-3500-private  est 6915  en base 1511   22 %   16 prix distincts
    lbc-c2-2400-2500-private  est 6913  en base 1593   23 %   16 prix distincts
    ...
    lbc-c2-2000-2100-private  est 4930  en base 5322  108 %   15 prix distincts

**Le mécanisme est identifié : `sort=price` n'est pas une clé d'énumération sur ce marché.**
Dans la tranche 3950–4000 private, la base porte 1 238 annonces sur **14 prix distincts**, et
751 d'entre elles (61 %) sont à exactement 3 990 € :

    3990 | 751      3980 | 21      3970 | 3
    3950 | 268      3995 |  8      3981 | 1
    3999 | 179                     3985 | 1

`shards.json` pose `page_cap 100`, `ads_per_page 35`, `shard_cap 7000` — c'est-à-dire
2 × 100 × 35, l'arithmétique qui suppose que `asc 1-100` et `desc 1-100` **partitionnent** la
tranche. Avec 14 prix distincts, les deux passes atterrissent dans le même bloc d'ex æquo et
rendent deux sous-ensembles arbitraires qui se recouvrent. Les quatre pires tranches ont
13 à 16 prix distincts ; les meilleures (0–500 : 132 prix distincts, 500–800 : 43) capturent
67 et 73 %.

Le plus grave n'est pas l'écart, c'est que **rien dans la chaîne ne le mesure** : le runbook
écrit `shard COMPLET` sur la foi du nombre de pages ouvertes, jamais sur un taux de capture.
Le « tour du corpus » de la thèse est une arithmétique sur une quantité que personne n'a
validée.

**Alternative** : (a) instrumenter le taux de capture — journaliser par tranche `est_count`
contre le nombre d'annonces distinctes réellement écrites, et refuser `COMPLET` en dessous
d'un seuil ; (b) changer d'axe de shard pour quelque chose de haute cardinalité
(`mileage`, `regdate`, ou marque/modèle × département) au lieu du prix.

## 6. La file de fraîcheur casse à 7 recherches, pas à 50 marchands (bloquante)

Coût mesuré du tier « un jour », pour **une** recherche enregistrée — la seule qui existe en
base (`saved_searches` : 1 ligne, `tesla model y`, 1 compte), qui couvre 770 annonces, soit
**0,63 % du corpus** :

    09-25 : 169 pages sur 7 balayages     09-24 : 116 pages sur 5
    par balayage : 13 pages (private) + 11-12 (pro) ≈ 25

Capacité totale mesurée le 09-25 : 1 218 pages (1 049 balayage + 169 sweep).

    au rythme réellement journalisé : 1 218 / 169 = 7,2 recherches
    à une passe par jour stricte    : 1 218 /  25 =  48 recherches

« Ça tient jusqu'à 50 marchands » n'est vrai que dans le cas limite : 50 marchands, une
petite recherche chacun, balayée exactement une fois par jour — et alors la machine est à
100 % et **le tier « dix jours » reçoit zéro page**. Au rythme que le runbook fait
effectivement tourner, le plafond est 7.

Le tier « dix jours » lui-même n'a pas de marge : 122 791 / 10 = **12 279 annonces/jour**
contre 14 477 mesurées, soit 18 % de marge *en supposant un ciblage parfait*. Il ne l'est
pas : sur les 78 827 annonces touchées en 7 jours, **56 965 ne l'ont été qu'un seul jour sur
sept**, 21 331 deux jours, 531 trois ou plus.

**Alternative** : publier un budget en pages/jour, faire du tier « dix jours » un nombre
*dérivé* (capacité × rendement / corpus) et non une promesse, et plafonner explicitement le
nombre de recherches enregistrées admises au tier journalier.

## 7. Le point 2 échoue sur la plus grosse famille de la base (sérieuse)

Le point 2 promet que « toute annonce en retard est d'abord servie par la recherche qui la
contient, enregistrée ou non ». Le split a un plafond dur :

    sweep_split.py:19-23   ADS_PER_PAGE = 35 ; PAGE_CAP = 20 ; MAX_ENTRIES = 8
    → 8 × 20 × 35 = 5 600 annonces au maximum par recherche, tous splits compris

Le commentaire de `sweep_split.py:23` justifie `MAX_ENTRIES = 8` par « la plus grosse famille
de la base, Renault Clio, en porte 4 723 ». Mesuré aujourd'hui : **6 933** (+47 %). La plus
grosse famille du corpus n'est déjà plus couvrable, quel que soit le split.

À l'échelle du corpus : 921 couples `(canon_brand, canon_model)` distincts, dont **38
familles au-delà de 700 annonces** (`PAGE_CAP × ADS_PER_PAGE`), représentant 63 269 annonces
= **60 % du corpus `lbc`**. Toutes exigent un split, une en excède le maximum.

Et la queue coûte plus cher que la fiche qu'elle remplace : **631 familles portent moins de
35 annonces** — 631 ouvertures de page pour 5 587 annonces, soit **8,9 annonces par page**,
contre 1 par fiche. Une passe complète par recherches composées coûte 3 664 pages à 35/page
théoriques, ~7 000 au rendement mesuré de 18.

**Alternative** : ajouter un troisième axe de split (département) ou relever
`PAGE_CAP`/`MAX_ENTRIES`, et prévoir explicitement que sous un certain effectif la fiche
redevient le moyen le moins cher — le point 2 dit l'inverse.

## 8. Le budget de 25–30 min ne tient pas, et le runbook le dit (sérieuse)

Trois budgets différents dans trois fichiers :

    crawler/RUNBOOK.md:101            « Le budget de 25 min ne couvre pas un shard de ~200 pages »
    crawler/RUNBOOK-balayage.md:224   « BUDGET : 30 minutes au total »
    crawler/RUNBOOK-revisites.md:157  « Budget 20 minutes par run »

Le RUNBOOK admet lui-même que le budget ne couvre pas son unité de travail. Le log confirme :
sur l'ensemble des tentatives de shard, **41 lignes `partial` et 31 `skipped` contre 31 `ok`**
— **70 % des tentatives finissent avant la fin du shard**. Le 09-25, deux runs sur deux
(12:53 et 18:52) finissent en `partial: budget 25min` puis `skipped: budget 25min epuise`.
C'est ce budget, et pas autre chose, qui explique que le ratissage soit resté sous 4 300 €
pendant 19 jours (§4).

Côté revisite, le budget ne tient que parce que l'opérateur le rabote à la main, quatre runs
sur quatre le 09-25 :

    10:59  « limit=30 retenu au lieu des 41 du calcul, marge volontaire »
    14:00  « limit=55 retenu au lieu des 67 »
    16:58  « limit=20 retenu au lieu des 41 »
    20:00  « limit=25 retenu au lieu des 36 »

Soit **25 à 50 % de la file non servie à chaque run pour rester dans les 30 minutes**. La
seule fois où le `limit` calculé a été suivi (09-20T19:35), le run est mort sur un
healthcheck négatif.

**Alternative** : caler le budget sur l'unité de travail (un shard = un run, quitte à ce que
le run dure 90 min) ou redécouper les shards pour qu'ils tiennent en 25 min — mais pas les
deux à la fois comme aujourd'hui.

## 9. « Chrome éteint 48 h » : c'est déjà arrivé, en pire, deux fois (bloquante)

Trous entre deux runs, tous types de file confondus :

    175,9 h  (7,3 jours)   09-12T07:25 → 09-19T15:21
     83,8 h  (3,5 jours)   09-08T19:34 → 09-12T07:25
     23,5 h   20,7 h   19,8 h   16,6 h   14,0 h   3,7 h
    → 8 trous de plus de 3 h en 19 jours

La question n'est pas hypothétique, et l'arithmétique de rattrapage est mauvaise. Demande de
régime du tier « dix jours » : 12 279/jour. Capacité mesurée : 14 477/jour. Surplus :
2 198/jour.

    coupure de 48 h  → 24 558 revisites dues en retard →  11,2 jours de rattrapage
    coupure de 7,3 j → ~89 600                        →  41 jours de rattrapage

41 jours dépasse la péremption de 30 jours que la thèse propose au point 6 : les annonces
sortiraient du marché *avant* d'avoir été rattrapées.

**Et la facture a une date.** 38 804 annonces `lbc` (36,5 % du corpus) ont pour dernier
`last_seen` le 09-07 ou avant. Aujourd'hui, **0 annonce** a dépassé 30 jours. Le
**2026-10-07**, les 38 804 franchissent le seuil le même jour et, sous le point 6, quittent
ensemble le marché, les stats vendeur et les alertes. Pour l'éviter il faut revoir 38 804
annonces en 12 jours = 3 234/jour **en plus** des 12 279/jour de régime, soit 15 513/jour —
au-dessus des 14 477 que la machine a jamais faits.

Accessoirement, le point 6 n'existe pas encore : aucun seuil 30 / 90 jours dans
`api/adscope_api/` (le seul `days=90` est `sessions.py:32 LIFETIME`, sans rapport).

**Alternative** : faire de la péremption un compteur glissant par annonce avec une franchise
calée sur le journal des coupures (une coupure de N heures repousse l'échéance de N heures),
sinon la falaise du 7 octobre est mécanique.

## 10. Le point 4 n'a aucune observation derrière lui (sérieuse)

« Un fait est confirmé par deux comptes distincts (robot inclus, il compte un). Une source
seule → état "probable", réversible. »

    price_points par clé de licence :
      73cc90bdae…  155 090 observations   115 629 annonces
      (null)         8 396 observations     8 395 annonces

    annonces observées par 2 clés distinctes ou plus : 0
    table divergences : 0 ligne
    1 compte, 4 licences, 5 follows, 11 familles suivies, 43 rechecks en attente

**Zéro annonce** a deux sources. Avec un seul marchand, la règle des deux comptes signifie que
*tout* reste « probable » indéfiniment — et la thèse met « probable, réversible » sur le
chemin critique de la disparition, donc de tout le corpus. « La foule confirme au-delà de
50 marchands » est une promesse adossée à un effectif de 1.

**Alternative** : définir l'état par défaut quand il n'y a qu'une source (le robot), et dire
ce que le produit affiche dans ce régime — qui est le régime réel pour les 12 prochains mois.

---

## Ce qui tient après examen

- **Le point 1 (le retard fait la priorité, pas la nature de la file) tient.** C'est un
  changement d'`ORDER BY`, et `revisit.py:99-107` classe déjà par demande / pro / ancienneté ;
  la thèse ne fait que déplacer l'axe. Aucun chiffre de capacité ne repose dessus, donc rien
  de ce qui précède ne l'atteint. C'est la meilleure idée de la thèse et la moins chère.
- **Le point 2 a raison sur le fond du calcul de coût**, là où les familles sont grosses :
  17,2 annonces distinctes par page mesurées contre 1 par fiche, soit 17× et non 30×, mais
  l'ordre de grandeur est le bon. Il échoue seulement dans la queue (631 familles à 8,9/page)
  et sur Renault Clio (§7).
- **Le point 3 (le serveur compose, l'ouvre-page consomme) tient et vaut plus que ce que la
  thèse en dit** : les 3 runs sur 16 perdus sur « selection navigateur requise » et les quatre
  `limit` rabotés à la main du 09-25 sont exactement des décisions prises côté session cowork.
  Les retirer est un gain de fiabilité mesurable (19 % de runs perdus).
- **Le point 7 tient — mais il est mal placé.** « La découverte se réduit au périmètre des
  recherches enregistrées, le ratissage ralentit puis s'arrête » est présenté comme une
  trajectoire, en fin de liste. C'est la seule chose dans la thèse qui fait tenir
  l'arithmétique des §4, §5 et §6. Il doit être le point 1.
