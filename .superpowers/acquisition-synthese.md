# Synthèse du juge — la thèse d'acquisition contre la contre-proposition

**2026-09-25, 23 h. Dépôt `/Users/alexis/Documents/Projets/adscope`, branche `feat/api`.**
Lecture seule sur le code, base `adscope` en `default_transaction_read_only = on`. Aucune
requête vers leboncoin, La Centrale ou l'API. Toutes les mesures ci-dessous ont été
**rejouées par moi**, pas reprises des rapports : quand un chiffre diffère du leur, c'est
le mien qui est écrit, avec sa requête.

Entrées jugées : `scratchpad/acquisition-these.md`, les quatre
`.superpowers/acquisition-challenge-{capacite,simplicite,risques,produit}.md`, et
`.superpowers/acquisition-contre-proposition.md`.

---

## Verdict en dix lignes

1. Le chiffrage de la thèse (point 8) est faux dans les deux sens : **1 318 pages et 825
   fiches** le 09-25, pas 100 pages et 3 000 fiches ; **122 791** annonces vivantes, pas 71 600.
2. Trois pannes en cours, aucune d'architecture : le robot **n'écrit plus un prix depuis
   20:52:15** (2 h 10 au moment où j'écris), 43 marqueurs sont **indélébiles**, le garde-fou
   de flotte est **fermé** (509/819 = 62,1 % contre un seuil de 33,3 %).
3. La contre-proposition gagne son objection neuve : le correctif d'une ligne que trois
   contradicteurs proposent pour le garde-fou **n'ouvre rien** — rejoué, 429/739 = **58,1 %**.
4. Mais son propre remplaçant ne tient pas non plus : le témoin qu'elle propose est
   **structurellement nul** (`revisit.QUIET` interdit qu'il soit jamais autre chose que 0).
5. `sweep_split.cut` rend `None` pour **10 familles, 31 559 annonces = 29,7 %** du corpus —
   `risques` a raison, `capacite`, `simplicite` et la contre-proposition sous-estiment de 4,6×.
6. Sur les tranches déclarées COMPLET, **il manque la moitié du marché** : 144 896 annoncées
   par leboncoin, 74 262 en base (51 %). Aucun « tour du corpus » n'est chiffrable aujourd'hui.
7. La péremption à 30 j est une falaise datée : **38 804 annonces les 6 et 7 octobre**. À
   abandonner comme retrait ; garder le libellé.
8. Les points 4 et 5 de la thèse sont **déjà tranchés dans le code** (22:48–22:56 ce soir),
   dans le sens inverse de ce qu'elle dit. Débat clos, sans rapport avec l'acquisition.
9. Personne n'a vu le vrai bloqueur de l'essai : **la migration 017 est écrite et non
   appliquée**, et à HEAD `/v1/market` ne peut plus répondre sans elle.
10. Décision : **la contre-proposition pour l'ordre des travaux**, corrigée sur son lot 2 et
    augmentée de la migration ; **trois points de la thèse retenus** (1, 2, 7), le reste attend
    un chiffre. **1,5 jour avant les cinq marchands.**

---

## 1. Les objections qui tiennent

Chacune vérifiée par moi, avec sa preuve.

### T1. Le chiffrage du point 8 (les quatre rapports, confirmé)

Mon comptage du journal `crawler/logs/2026-09.log` (colonne 3, groupée par type de label) :

| jour | pages lbc | pages lc | balayage | **total pages** | fiches |
|---|---|---|---|---|---|
| 09-24 | 860 | 101 | 116 | **1 077** | 740 |
| 09-25 | 948 | 201 | 169 | **1 318** | 825 |

C'est la contre-proposition qui a le comptage juste (1 318/825) ; `capacite` (1 049) et
`risques` (931) oublient La Centrale. Conséquences, toutes mesurées :

- **100 pages/jour** = 13× sous la machine. **3 000 fiches/jour** = 3,6× au-dessus (825 mesurées).
- **35 annonces par page** (`sweep_split.py:14`) : le 09-25, 17 564 annonces distinctes pour
  1 318 pages + 825 fiches → **12,7 distinctes par page** ; le 09-24, 21,6. Jamais 35.
- **Corpus** : `lbc` 106 203 vivantes, `lc` 16 588 → **122 791**, contre 71 600 dans la thèse.
  `revisit.py:5` est encore à « 43 457 » : facteur 2,8.
- **« Tour du corpus en 15 jours »** : 37 shards sur 89 faits en 19 jours, **51 jamais
  touchés**, prix maximum atteint **4 000 €**, et 88,8 % du corpus est sous 4 300 €
  (94 310 / 106 203). Le tour n'a pas commencé.

### T2. Le robot est muet depuis 20:52:15 (produit, contre-proposition — bloquante, en cours)

- `price_points` : **0 ligne** après `2026-09-25 20:52:21`. Dernier relevé accepté
  **20:52:15**. Il est 23:03.
- `usage_days`, somme du jour sous la clé qui crawle : **18 211** (23 508 le 09-24, 6 291 le 09-23).
- `config.py:91` : `observations_per_day()` = **2 000** par défaut ;
  `ADSCOPE_OBSERVATIONS_PER_DAY` **absent** de `~/Library/LaunchAgents/fr.adscope.api.plist`
  (le plist ne porte que `ADSCOPE_OPERATOR_EMAIL` et `ADSCOPE_PUBLIC_URL`).
- `quota.py:26` sort sans rien faire **seulement** si `license_.automated`. Les quatre licences :
  `alexis` (false, 155 090 relevés), `verif` (false, 0), `alexis` (false, 0),
  `crawler` (**true, 0 relevé, jamais**).

Le robot crawle sous une licence de marchand, dépasse le quota de 9×, et est refusé depuis
deux heures. **C'est la seule panne datée à l'heure, et elle ne se répare pas en code.**

### T3. Les 43 marqueurs indélébiles (produit, simplicite, contre-proposition)

`rechecks` : **43 lignes, toutes `field='absence'`**, posées entre 21:52:22 et 21:59:27 ce
soir. `divergences` : **0 ligne**, depuis toujours.

Le circuit est fermé et il est tout entier dans le code :
`disappearance.py:91-92` pose le marqueur quand la licence n'est pas automated ;
`recheck.clear` n'a que trois appelants (`divergence.py:118`, `divergence.py:134`, et
`revival.apply`), les deux premiers gardés par `license_.automated` ; aucun relevé
automated n'a jamais existé. `revisit.py:100` met `_marked()` au **rang 0** et
`revisit.py:122-126` le fait passer outre `QUIET` **et** `next_detail_crawl`.

Le symptôme est déjà au journal, écrit par la session elle-même (run 09-25T20:00:07) :
« les 25 URL servies en tranche 2 sont exactement des identifiants deja servis en tranche 1 ».

### T4. Le garde-fou de flotte est fermé, et le correctif d'une ligne ne l'ouvre pas

Rejoué sur la base, requête de `fleet_guard.fleet` (le module a été extrait de
`disappearance.py` à 22:48 ; les numéros de ligne des rapports sont périmés, la requête non) :

| formulation | numérateur | dénominateur | part | verdict |
|---|---|---|---|---|
| code actuel | 509 | 819 | **62,1 %** | `held` |
| numérateur borné à la fenêtre | 429 | 739 | **58,1 %** | **`held`** |

`GUARD_SHARE = 1/3`. **Les deux sont au-dessus.** Le correctif proposé par `simplicite` §5,
`risques` §4 et `produit` obj. 1 laisse l'écriture suspendue : la contre-proposition a
raison contre trois rapports sur quatre, et je le confirme sur mes propres chiffres.

État de la conséquence : **1 343 absences en cours**, dont **1 264 au-delà de
`CONFIRM_DELAY`** ; **51 disparitions écrites** en tout, la dernière le **2026-09-22
00:49** ; **959** lignes « écriture suspendue » dans `~/Library/Logs/adscope-api.log`.

### T5. La péremption à 30 jours est une falaise datée (risques, produit, simplicite)

`0` annonce vivante dépasse 30 jours de silence aujourd'hui, sur les deux sites. Datées à
`last_seen + 30 j` : **21 320 le 2026-10-06 et 17 484 le 10-07 = 38 804 (36,5 % du corpus
lbc) en deux jours**, puis 16 565 des 16 588 La Centrale entre le 19 et le 25 octobre.

Et deux des trois endroits que le point 6 nomme le font déjà : `sellers.py:29`
`ONLINE_WINDOW_DAYS = 30` appliqué `:76` — **exactement le même seuil, déjà livré** ;
`alert_rules.py:28` `SEEN_WINDOW = 48 h` appliqué `:54` — plus serré. Reste `/v1/market`,
c'est-à-dire précisément le siège de la falaise.

### T6. Le palier « quelques heures » pèse 30 % du corpus (simplicite, contre-proposition)

`follows ∪ tracked_families`, comme `revisit._wanted()` (`revisit.py:66-74`) :
**31 503 annonces vivantes = 29,7 % du corpus lbc**, parce que les 11 lignes de
`tracked_families` désignent les dix plus grosses familles. Un palier promis en heures qui
porte un tiers de la base n'est pas un palier. La correction est une ligne dans `_rank` :
séparer `Follow` (5 annonces) de `TrackedFamily` (31 498).

### T7. Le moyen « par défaut » n'atteint pas 29,7 % du corpus (risques — et seul lui a raison)

J'ai rejoué `sweep_split.cut` en SQL sur les 106 195 annonces lbc vivantes à marque/modèle
canoniques, avec leur dernier prix (mêmes constantes, même arbre : `owner_type`, puis deux
coupes de prix, feuille servable si ≤ 665 annonces). Résultat **identique au sien** :

    servable      910 familles   74 636 annonces   70,3 %
    trop_large     10 familles   31 559 annonces   29,7 %

    clio 6933 · 207 3731 · 206 3624 · megane 3508 · c3 3275
    twingo 2833 · golf 2771 · 308 1923 · 307 1859 · 911 1102

La cause est `sweep_split.py:41-50` : `price_max is None` → `high = 5000`, donc le second
tour laisse un seau **`3801-max` non borné** où tombent les **24 865 annonces à plus de
3 800 €**. Exemple net, porsche 911 : 932 annonces pro, **toutes** au-dessus de 3 800 € dans
une seule feuille → `cut` rend `None`.

### T8. La Centrale est crawlée, et n'a aucun des deux moyens (risques)

La prémisse de la thèse est fausse : `crawler/shards-lacentrale.json` porte **39 shards,
1 098 pages**, et **16 565 des 16 588** annonces lc ont été vues dans les 7 derniers jours.
Or `revisit.py:76` : `ADDRESS = {"lbc": _lbc}` ; `sweep_url.py:23,113` ne fabrique que du
leboncoin. **13,5 % du corpus n'a ni page de résultats ni fiche** dans le modèle proposé.

### T9. Le taux de capture est de 51 %, et rien ne le mesure (capacite — l'objection la plus lourde)

C'est la découverte qui a le plus de conséquences, et elle n'est dans aucun des autres
rapports. `shards.json` : 33 shards private ≤ 4 000 € portent `last_crawled`, et annoncent
**144 896** annonces (`est_count`, lu sur leboncoin). En base : **74 262** annonces private
lbc sous 4 000 €. **51 %.**

Le mécanisme, vérifié sur pièce : `shards.json` pose `page_cap 100`, `ads_per_page 35`,
`shard_cap 7000` = 2 × 100 × 35, c'est-à-dire l'arithmétique qui suppose que `asc 1-100` et
`desc 1-100` **partitionnent** la tranche. Or `sort=price` n'a presque aucune cardinalité :

    tranche 3950-4000 private : 1 238 en base sur 14 prix distincts, dont 751 à 3 990 €
    tranche 0-500 private     : 2 194 en base sur 132 prix distincts (67 % de l'est_count)

Les deux passes atterrissent dans le même bloc d'ex æquo. Et le runbook écrit `COMPLET` sur
le nombre de pages ouvertes, **jamais sur un taux de capture**. Conséquence de jugement :
*aucun* chiffre de « tour du corpus » n'est valide aujourd'hui — ni celui de la thèse
(15 jours), ni les 6 596 pages / 16,1 par page de la contre-proposition, qui reposent sur un
corpus dont la moitié n'est jamais entrée.

---

## 2. Les objections qui ne tiennent pas

### F1. « Une ligne suffit pour le garde-fou » — mesuré faux
`simplicite` §5, `risques` §4, `produit` obj. 1. Voir T4 : 58,1 % contre 33,3 %. Trois
rapports concluent d'un docstring sans rejouer la requête corrigée.

### F2. « Seule Renault Clio est hors d'atteinte, à cause du plafond de 5 600 » — faux de 4,6×
`capacite` §7, `simplicite` §2, et la contre-proposition §4.2 qui reprend leur version. Le
plafond n'est pas `MAX_ENTRIES × PAGE_CAP × ADS_PER_PAGE` : c'est **la feuille non bornée
`3801-max`** (T7). 10 familles, 31 559 annonces, pas une famille et 6 933. La contre-proposition
en tire une règle (« page si ≥ 36 annonces ») qui ne couvre pas les 10 familles, et une
conclusion rassurante (« les tranches de prix les couvrent à 16,1/page ») que T9 démolit.

### F3. Le témoin de remplacement du garde-fou est structurellement nul — objection neuve du juge
La contre-proposition §2.2 propose de suspendre l'écriture « quand la preuve d'absence
contredit une vue récente indépendante », c'est-à-dire quand
`absent_since - last_seen < 48 h` dépasse une poignée. Mesuré : **0 sur 1 343**, et elle en
conclut que le garde-fou s'ouvrirait. C'est exact. Mais **ce compte ne peut jamais valoir
autre chose que 0**, et pas pour une bonne raison :

`revisit.due` (`revisit.py:118-124`) ne sert que des fiches `_marked()` **ou**
`last_seen <= now - QUIET` (3 jours). Une absence constatée par le robot a donc, par
construction, au moins trois jours de silence derrière elle. Et `observations.record` efface
`absent_since` dès qu'une vue vivante arrive, donc les deux dates ne peuvent pas être
proches. Mesuré : **silence minimum avant absence = 13 jours**, médiane 17,4, maximum 19,2.

Conséquence : le matin d'une refonte de gabarit, le robot marquerait absentes des annonces
toutes silencieuses depuis plus de trois jours — **le témoin resterait à 0 et le garde-fou
ne se déclencherait pas**. Ce n'est pas un meilleur garde-fou, c'est la **suppression** du
garde-fou, présentée comme son remplacement. Le choix peut être le bon (la signature
positive de l'extension et le titre « Annonce introuvable » sont des preuves sérieuses,
citées par la contre-proposition elle-même), mais il doit être énoncé pour ce qu'il est, et
il lui manque un contrôle. Voir §3, geste 3.

### F4. « La thèse aggrave le garde-fou en triant par retard » — vrai mais sans portée
`produit` obj. 1 et contre-proposition §2.1. Le biais existe (silence > 48 h → 429/566 =
75,8 % d'absences ; revue < 48 h → 0/310). Mais `revisit.py:130` trie **déjà** en dernière
clé par `Listing.last_seen` croissant : l'échantillon est déjà maximalement adverse. La
thèse ne change presque rien à ce biais. Ce n'est pas un argument contre elle.

### F5. « Zéro annonce n'a deux sources » — le chiffre est faux, la conclusion tient
`capacite` §10, contre-proposition §4.4. Mesuré : **1 182 annonces** portent deux empreintes
de licence distinctes (la clé `alexis` et le hash nul du crawler d'avant la colonne
`automated`), et `absence_scope.py:13` compte précisément ce hash nul comme une voix
(`LEGACY`). Mais son dernier relevé date du **2026-09-06** : il ne confirmera plus rien. La
conclusion — une seule voix vivante — tient ; le « 0 » est à corriger.

### F6. « Un seul runbook rendra les runs fiables » — non mesuré, et contredit
Point 3 de la thèse. `produit` mesure **3 écarts au protocole sur 250 runs (1,2 %)** contre
49 déconnexions d'extension et 56 timeouts navigateur. `simplicite` §7 montre que la règle
« cette session ouvre des URL, elle ne conclut rien » est **déjà écrite mot pour mot** aux
deux endroits (`RUNBOOK-balayage.md:14`, `RUNBOOK-revisites.md:28`), et que les deux
décisions restantes ne sont pas déplaçables : `N = max(data-pages, ceil(total/35))` a besoin
du `total` lu dans `__NEXT_DATA__`, que le serveur n'a pas (et son compte est bas d'un
facteur 2,4 au journal du 09-23), et `limit` a besoin du budget horloge de la session. Le
gain restant est de ~85 lignes de JS. `capacite` compte 3 runs perdus sur 16 sur « sélection
navigateur requise » : c'est du pilotage navigateur, pas du nombre de runbooks.

### F7. Le gain juridique du point 7 — revendiqué, non mesuré
`risques` §11 a raison : 16,1 annonces par page pour le ratissage contre 19,9 pour le tour
par familles simulé — même site, même navigateur, et *moins* d'annonces couvertes. Et
composer une recherche pour chacune des 920 familles **est** un ratissage exhaustif écrit
autrement. `docs/roadmap.md:141-143` dit que la question n'a pas été posée à l'avocat. À ne
pas revendiquer.

### F8. Les points 4 et 5 de la thèse — le débat est clos, et pas dans son sens
Les commits de **22:48 à 22:56 ce soir** (`a8bef9f`, `3aa62db`, `4d04848`) ont livré les
quatre états, les deux voix, la réversibilité et le filtrage par compte.
`disappearance.py:72` : `AUTOMATED_CONFIRMS_ALONE = True`, avec le motif écrit —
« sinon `disappeared_at` ne s'écrirait presque plus jamais ». Le point 4 de la thèse dit
l'inverse ; lu à la lettre il rétrograderait les 51 disparitions écrites. Aucune décision
d'acquisition ne dépend de ce débat : le retirer de la discussion.

---

## 3. Ce qu'il faut faire AVANT l'essai des cinq marchands — 1,5 jour

La contre-proposition a le bon ordre et la bonne échelle. Je la reprends, corrigée sur son
lot 2, et augmentée d'un geste que personne n'a vu.

**Geste 1 — la licence automated sur le Chrome qui crawle · 0,25 j · 0 fichier de code · ce soir.**
La licence `crawler` existe (`automated = true`, 0 relevé). La porter dans le popup du
Chrome qui crawle, et l'écrire dans les trois runbooks. Répare T2 (quota, robot muet depuis
20:52), T3 (les 43 marqueurs deviennent levables), et rend `divergences` capable d'écrire
une ligne. **Sans lui, le prochain run n'écrit aucun prix.** Ne pas activer
`ADSCOPE_ALERTS_CONFIRMED_ONLY` avant (`alert_rules.py:99` exige `automated OR hash nul` :
activé aujourd'hui, il rendrait les alertes quasi muettes).

**Geste 2 — appliquer la migration 017 · 0,25 j · personne ne l'a vu.**
Mesuré : la colonne `listings.probably_gone_at` **n'existe pas** en base, la table
`absence_reports` **n'existe pas**. Or à HEAD, `market_query.py:98` appelle
`absence_scope.visible(license_)` et `disappearance.py:116` écrit `probably_gone_at` : les
migrations ne tournent qu'à la main (`api/scripts/migrate.py`, il n'y a pas d'application au
démarrage). **À HEAD, `/v1/market` ne peut pas répondre et une absence ne peut pas s'écrire
tant que la migration n'est pas passée.** C'est un bloqueur dur de l'essai, et il arrive par
un déploiement, pas par une décision : le jour où elle passe, la règle des voix devient
vivante avec **une** voix en base, donc toute déclaration de marchand devient `probable` et
le marché commence à filtrer par compte. À décider **avant** de déployer, pas après.

**Geste 3 — trancher le garde-fou, avec un contrôle · 0,25 j · 1 fichier.**
Ni la formulation actuelle (62,1 %) ni la formulation bornée (58,1 %) n'ouvrent ; le témoin
proposé est structurellement nul (F3). Donc le choix réel est : **retirer la part de flotte
et s'appuyer sur la signature positive**, en gardant `GUARD_MIN` comme plancher — et se
donner le contrôle qui manque : **5 fiches « témoin » par run, tirées parmi les annonces
vues vivantes depuis moins de 24 h** (4 % du budget d'un run de 125). Si une témoin lit
« absente », c'est un gabarit ou un mur, et *ça*, le garde-fou actuel ne sait pas le voir.
Effet du déblocage : les **1 264 absences mûries** s'écrivent, avec leur date d'origine
(`disappearance.py:124` écrit `absent_since`, pas `now`) — l'historique n'est pas faussé.

**Geste 4 — les deux nombres que le marchand doit voir · 0,5 j · 2 fichiers · 0 migration.**
`market_query.py:91` sélectionne déjà `Listing.last_seen` ; `ItemOut` ne le porte pas.
L'ajouter, avec le libellé « non vérifiée depuis N jours », et ajouter à `SellerStatsOut` un
compte « non vérifié » (aujourd'hui `stats_for` rend `None` et la section **disparaît**).
Motif chiffré : **31,5 %** du marché est alertable (`alert_rules.py:28`, 48 h), et
**0 sur 1 106** pour la Porsche 911 — un marchand qui la suit ne recevra jamais une alerte,
et rien ne le lui dit. C'est le seul geste que le marchand voie.

**Geste 5 — une échéance sur le shard, et un barème honnête · 0,25 j · 0 code.**
`shards.json` : 89 shards, **tous** en `status: ready`, 51 jamais touchés, **8 encore au
2026-09-06** — 19 jours, exactement l'âge du silence des absences constatées aujourd'hui
(13 à 19 jours). Un champ `due_at` et une ligne de tri dans `RUNBOOK.md`. Au même geste :
porter le barème de `RUNBOOK-revisites.md:108` de **8 s à 10 s/fiche** — la session a mesuré
9,5 s elle-même (run du 09-25T16:58), et l'opérateur rabote le `limit` à la main quatre runs
sur quatre, soit 25 à 50 % de la file non servie.

**Ce qu'on ne fait pas avant l'essai** : la file unique, la péremption, les quatre états, le
runbook unique, la fusion des pages. Et **on ne touche pas F2** : il est vérifié en vrai, la
seule recherche enregistrée en base est à **96,9 % d'alertables** (746/770) quand le corpus
est à 31,5 % — c'est la preuve que le balayage par recherche marche, et que l'écart de
fraîcheur est un budget de couverture, pas une architecture de file.

---

## 4. Ce qui attend un chiffre, et le chiffre déclencheur

| Ce qui attend | Déclencheur chiffré | Aujourd'hui |
|---|---|---|
| La file unique et ses paliers | **20 recherches enregistrées** (≈ 500 pages/jour = 40 % de la capacité mesurée de 1 318) ou 14 jours de journal des 5 marchands | 1 recherche, 5 follows, 1 compte |
| `sweep_split` pour les 10 grosses familles | le jour où un marchand suit l'une d'elles **et** que le ratissage par prix ne la couvre plus. Correctif : `price_rounds = 3` ou une borne haute sur la dernière coupe — **pas un axe département** (mesuré 8,7 annonces/page contre 16,1) | 10 familles, 31 559 annonces hors d'atteinte |
| Le taux de capture (T9) | instrumenter `est_count` contre les annonces distinctes écrites par tranche, et **refuser `COMPLET` sous 70 %**. Changer d'axe de shard si une tranche remesurée reste sous 70 % | 51 % mesuré, rien ne le mesure |
| La péremption | jamais comme retrait. Si un seuil est voulu : dérivé du quantile observé par site, monté sur deux semaines | 0 annonce au-delà de 30 j ; 38 804 le 6-7 octobre |
| Le sort du ratissage (point 7) | après la réponse de l'avocat (`docs/roadmap.md:141-143`, question non posée) | revendiqué comme gain, non mesuré |
| La Centrale | avant que le ratissage ne ralentisse : 16 565 annonces n'ont aucun autre moyen | 39 shards, 1 098 pages, 16 565 vues < 7 j |
| Le lot E | remesure au **1er octobre** (`roadmap.md:118-125`) — elle n'a de sens qu'après le geste 3 | 51 disparues, 0 avec département |

---

## 5. Les décisions qui reviennent à Alexis

1. **Ce soir** : la clé `crawler` (automated) dans le Chrome qui crawle — oui ou non ; sans elle le prochain run n'écrit aucun prix.
2. **Migration 017** : l'appliquer maintenant (la règle des voix devient vivante avec une seule voix), ou attendre après l'essai — et dans les deux cas, décider ce qu'un marchand voit d'une annonce `probable`.
3. **Garde-fou de flotte** : retirer la part et s'appuyer sur la signature positive plus 5 fiches témoin par run, ou relever le seuil avec un chiffre assumé — lequel.
4. **Péremption à 30 jours** : abandonnée comme retrait du marché, remplacée par un libellé — à confirmer.
5. **Ratissage par tranches de prix** : le laisser tel quel à 51 % de capture, l'instrumenter, ou l'arrêter au-dessus d'un prix — et seulement après l'avocat.
6. **La Centrale** : troisième moyen déclaré, ou sortie du produit — il n'y a pas de troisième option dans le modèle de la thèse.
7. **La file unique** : reportée au journal des cinq marchands, avec le déclencheur de 20 recherches — à confirmer.

---

## 6. Le chiffrage

| Poste | Jours | Fichiers de code |
|---|---|---|
| Geste 1 · licence automated | 0,25 | **0** (3 runbooks) |
| Geste 2 · migration 017 appliquée + décision `probable` | 0,25 | 0 (script existant) |
| Geste 3 · garde-fou tranché + 5 fiches témoin | 0,25 | 2 (`fleet_guard.py`, `revisit.py`) |
| Geste 4 · `last_seen` et « non vérifié » au produit | 0,5 | 2 (`market_items.py`, `sellers.py`) |
| Geste 5 · `due_at` de shard + barème 10 s | 0,25 | 0 (données + 2 runbooks) |
| **Avant les cinq marchands** | **1,5 j** | **4** |
| Instrumentation du taux de capture (T9) | +0,5 j | 1 + runbook |
| La refonte si elle revient après le journal | 1,5–2 j | — (les points 4-5 sont déjà livrés) |

Aucune migration nouvelle, aucune colonne nouvelle, aucune constante temporelle nouvelle :
le compte reste à 7 (`revisit.py:57-67`, `coverage.py:24`, `alert_rules.py:28`,
`fleet_guard.py:20`). À comparer aux 2 à 3 jours de la thèse pour changer l'ordre d'une file
qui, depuis 20:52, n'accepte plus une seule observation.

---

## Annexe — mes mesures, toutes rejouées ce soir en lecture seule

`psql -d adscope`, `SET default_transaction_read_only = on`, PostgreSQL 17.11, 2026-09-25 23:03.

**Corpus** — `lbc` 106 254 dont 106 203 vivantes ; `lc` 16 588 dont 16 588. `min(last_seen)`
2026-09-06 sur les deux. Vues < 48 h : 31 617 + 7 064. Au-delà de 10 j : 43 001 + 23.
Au-delà de 30 j : **0 et 0**. Prix (dernier relevé) : < 4 300 € **94 310 (88,8 %)**,
4 300-10 k 1 704, 10-20 k 4 095, ≥ 20 k 6 094.

**Chaîne** — `rechecks` **43** (tous `absence`, 21:52:22 → 21:59:27) · `divergences` **0** ·
`absent_since` **1 343**, dont **1 264** au-delà de 6 h · `disappeared_at` **51**, dernier
**2026-09-22 00:49** · `saved_searches` 1 · `follows` 5 · `tracked_families` 11 ·
`accounts` 1 · `licenses` 4 dont 1 automated. `probably_gone_at` et `absence_reports` :
**absents du schéma**.

**Licences × relevés** — `alexis` false 155 090 (dernier **20:52:15**) · hash nul 8 396 ·
`crawler` **true, 0, jamais** · `verif` 0. Total 163 486. Relevés après 20:52:21 : **0**.
Annonces à deux empreintes distinctes : **1 182** (dont toutes via le hash nul, arrêté le 09-06).

**Quota** — `usage_days` : 18 211 le 09-25, 23 508 le 09-24, 6 291 le 09-23, contre
`observations_per_day()` = **2 000** (`config.py:91`, variable absente du plist).

**Garde-fou** — 876 fiches servies en 24 h. Actuel **509/819 = 62,1 %** · numérateur borné
**429/739 = 58,1 %** · seuil 33,3 %. Absences contredisant une vue < 48 h : **0 / 1 343** ;
silence avant absence **min 13 j, médiane 17,4 j, max 19,2 j**.

**`sweep_split.cut` rejoué** — 920 familles, 106 195 annonces : **910 servables / 74 636
(70,3 %)**, **10 trop_large / 31 559 (29,7 %)**. Annonces > 3 800 € : **24 865**. Aucun prix nul.

**Shards** — `shards.json` : 89, **tous `ready`**, 38 avec `last_crawled`, 51 jamais,
50 `est_count` nuls, **6 596 pages cumulées**, 2 avec `resume`, 8 encore au 2026-09-06,
prix maximum atteint **4 000 €**. 33 shards private ≤ 4 000 € annoncent **144 896** contre
**74 262** en base = **51 %**. Tranche 3950-4000 private : 1 238 en base, **14 prix
distincts**, 751 à 3 990 €. Tranche 0-500 : 2 194, 132 prix distincts.
`shards-lacentrale.json` : **39 shards, 1 098 pages**.

**Journal** (`crawler/logs/2026-09.log`, pages / fiches) — 09-19 211/0 · 09-20 584/128 ·
09-21 783/450 · 09-22 1 456/2 210 · 09-23 248/310 · 09-24 **1 077/740** · 09-25
**1 318/825**. Annonces distinctes relevées : 09-24 **24 045**, 09-25 **17 564**.

**Produit** — alertables (< 48 h) 38 681 / 122 791 = **31,5 %** ; `tesla model y` 746/770
(**96,9 %**) ; **porsche 911 0/1 106** ; `follows ∪ tracked_families` **31 503**.
Falaise 30 j : **21 320 le 10-06 + 17 484 le 10-07 = 38 804**, puis 16 565 lc du 19 au 25 octobre.
