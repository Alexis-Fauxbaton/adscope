# Contre-proposition à la thèse d'acquisition — « mesurer avant de refondre »

**2026-09-25, 23 h. Dépôt `/Users/alexis/Documents/Projets/adscope`, branche `feat/api`.**
Lecture seule sur le code, base `adscope` en `default_transaction_read_only = on`, aucune
requête vers leboncoin, La Centrale ou l'API réelle, aucun processus touché.

Thèse challengée : `acquisition-these.md` (une file unique triée par fraîcheur due, deux
moyens choisis par le coût, un seul runbook, quatre états, péremption à 30/90 jours,
découverte qui s'arrête). Quatre contradicteurs l'ont examinée :
`acquisition-challenge-capacite.md`, `-simplicite.md`, `-risques.md`, `-produit.md`.

---

## 0. En une page

La thèse répond à une question de conception — *dans quel ordre servir la file ?* — que
rien de mesuré n'a encore posée. Toutes les pannes que les quatre contradicteurs ont
trouvées, et les deux que j'ajoute ici, sont **une constante fausse ou une valeur de
colonne fausse**, jamais une architecture fausse. Aucune ne se répare en refondant une
file.

Ma proposition : **quatre correctifs, 1,25 jour, 3 fichiers de code et 4 de documentation.**
Aucune file fusionnée, aucune route retirée, aucune colonne, aucune migration, aucune
constante temporelle nouvelle. Les runbooks continuent de tourner tels quels ; F2, vérifié
en vrai, n'est pas touché.

Contre la thèse : ~115 lignes retirées, une route, un prédicat d'appartenance mesuré à
80 137 buffers par recherche, deux seuils qui ne concernent aujourd'hui **aucune ligne**,
une colonne, une migration, et 2 à 3 jours — pour changer l'ordre d'une file qui, depuis
20 h 52 ce soir, **n'accepte plus une seule observation**.

Et j'ajoute une objection qu'aucun des quatre n'a mesurée : **le correctif d'une ligne que
trois d'entre eux proposent pour le garde-fou de flotte ne débloque rien.** Je l'ai rejoué.
Il rend 58,1 % contre un seuil de 33,3 %. Le garde-fou reste fermé. Il faut autre chose, et
cette autre chose est plus simple encore.

---

## 1. Les deux faits qui datent la décision de ce soir

### 1.1 Depuis 20 h 52 min 21 s, le robot ne peut plus écrire un prix

L'API a redémarré ce soir à **20:52:21** (PID 56610, `runs = 6` au `launchctl print`). Ce
redémarrage a chargé `quota.guard` (`main.py:68`), qui refuse toute licence **non
automated** au-delà de `ADSCOPE_OBSERVATIONS_PER_DAY`, par défaut **2 000**
(`config.py:90-91`). Cette variable est **absente** de l'environnement du processus et du
plist (`launchctl print gui/501/fr.adscope.api` : `DATABASE_URL`,
`ADSCOPE_OPERATOR_EMAIL`, `ADSCOPE_PUBLIC_URL`, rien d'autre).

Or le robot tourne sous une licence non automated :

| licence | automated | relevés `price_points` | dernier relevé |
|---|---|---|---|
| `alexis` | **false** | 155 090 | **2026-09-25 20:52:15** |
| (hash nul) | — | 8 396 | 2026-09-06 10:45 |
| `crawler` | true | **0** | jamais |

Et son usage du jour, compté par `usage_days` sous ce même hash : **18 211 observations le
09-25, 23 508 le 09-24**, contre un quota de 2 000. Soit 9 à 12×.

Le dernier `price_point` accepté est daté de **20:52:15 — six secondes avant le
redémarrage**. Rien depuis. Le run planifié de 23 h n'écrira aucun prix.

### 1.2 Pendant ce temps les absences passent, et chacune fabrique un marqueur indélébile

`POST /v1/disappearances` (`main.py:142`) **n'appelle pas** `quota.guard`. Mesuré après le
redémarrage :

- **43 absences** écrites entre 21:52:22 et 21:59:27 (`absent_since > 20:52:21`)
- **43 `rechecks`**, tous `field='absence'`, créés dans les mêmes minutes
  (`min(observed_at)` 21:52:22, `max` 21:59:27)

Le mécanisme est en boucle fermée, et il est entièrement dans le code :

1. `disappearance.observe:120-121` — `if license_ is not None and not license_.automated:
   recheck.mark_absence(...)`. La licence est non automated, donc **chaque absence du robot
   pose un marqueur**, alors que le commentaire dit « c'est le robot qui tranchera ».
2. `recheck.clear` n'a que deux appelants, `divergence._verify:127` et
   `divergence.on_absence:141`, tous deux gardés par `license_.automated`
   (`divergence.py:27`, `disappearance.py:141`). **Aucun marqueur ne peut donc être levé.**
3. `revisit._rank:102` place `_marked()` au **rang 0**, et `due()` le fait passer outre
   `QUIET` **et** `next_detail_crawl` (`revisit.py:126-128`). Ces 43 fiches tiennent la tête
   de la file indéfiniment.

Le symptôme est déjà journalisé par la session cowork, mot pour mot, `crawler/logs/2026-09.log`,
run `2026-09-25T20:00:07` :

> « OBSERVATION: les 25 URL servies en tranche 2 sont exactement des identifiants deja
> servis en tranche 1 du meme run et qui y etaient a 0 panneau »

**Conséquence sur la thèse.** La file dont la thèse veut changer l'ordre converge vers
43 fiches sur 106 203, n'accepte plus d'observation depuis deux heures, et grossit son
propre bouchon à chaque run. `divergences` porte 0 ligne ; la page opérateur
`/app/ecarts.html` est un décor. Réordonner cela n'a aucun effet observable.

---

## 2. L'objection neuve : le correctif d'une ligne du garde-fou ne débloque rien

Trois contradicteurs sur quatre proposent la même réparation de `disappearance.fleet`
(`disappearance.py:94-101`) : borner le numérateur à la fenêtre comme le dénominateur
(`absent_since >= window`). Le raisonnement est juste — le docstring `:83-92` assume
l'asymétrie sans voir qu'elle transforme un pic en stock. **Mais je l'ai rejoué sur la base,
et il ne suffit pas.**

| formulation | numérateur | dénominateur | part | verdict vs `GUARD_SHARE = 1/3` |
|---|---|---|---|---|
| code actuel (`disappearance.py:95-99`) | 509 | 819 | **62,1 %** | `held` |
| numérateur borné à la fenêtre | 429 | 739 | **58,1 %** | **`held`** |
| part sur toutes les fiches servies en 24 h | 429 | 876 | **49,0 %** | **`held`** |

Les trois dépassent le seuil. Le correctif d'une ligne laisse l'écriture suspendue.

### 2.1 Pourquoi : le garde-fou mesure un biais de sélection, pas un événement de flotte

`due()` trie par `Listing.last_seen` croissant (`revisit.py:134`) : il sert **délibérément**
les annonces les plus muettes. Le taux d'absence de l'échantillon qu'il produit n'a donc
aucun rapport avec le taux d'absence de la flotte. Mesuré sur les 876 fiches servies dans
les 24 h :

| groupe | fiches servies | absences constatées | part |
|---|---|---|---|
| silence > 48 h | 566 | **429** | **75,8 %** |
| revue vivante < 48 h | 310 | **0** | **0,0 %** |

Trois quarts des annonces les plus vieilles sont réellement parties. Un seuil calibré pour
« un échantillon quelconque de la flotte » appliqué à un échantillon choisi pour être
adverse restera fermé pour toujours.

**Et la thèse aggrave exactement cela.** Son point 1 — « le retard fait la priorité » —
affûte le biais : plus la file cible bien les annonces en retard, plus la part monte, plus
le garde-fou se ferme. La thèse optimise l'entrée d'un entonnoir dont la sortie se referme
quand l'entrée s'améliore.

### 2.2 Le témoin qui manque, et il ne coûte rien

Ce que le garde-fou veut attraper est écrit noir sur blanc à `disappearance.py:21-25` : une
refonte de gabarit ou une bascule anti-bot. Or ces deux événements ont une signature que le
renouvellement de stock n'a **jamais** : ils rendent la preuve `absent` de façon
indiscriminée, **y compris sur une annonce qu'une page de résultats a vue vivante hier**.
Un vrai départ de stock, par construction, ne peut arriver qu'après un silence.

Mesuré sur toute la base :

- **0** des 1 343 absences en cours a `absent_since - last_seen < 48 h`
- les 429 absences du jour ont **toutes** entre **18,4 et 19,2 jours** de silence avant la
  constatation (un seul seau de `width_bucket` sur 10, borne 18,4 / 19,2)

Le témoin est donc à zéro, et il est disponible dans la même table, sans jointure :

> **L'écriture se suspend quand la preuve d'absence contredit une vue récente
> indépendante** — c'est-à-dire quand le compte des absences à `absent_since - last_seen <
> 48 h` dépasse une poignée sur la fenêtre.

Propriétés, toutes vérifiées :

- **un `filter` de plus dans la même requête**, même table, même forme (~8 lignes dans
  `disappearance.fleet`)
- **auto-calibré** : le nombre vaut 0 aujourd'hui, donc le garde-fou s'ouvre et les
  **1 264 absences mûries** (au-delà de `CONFIRM_DELAY = 6 h`, dont 576 au-delà de 3 jours,
  la plus ancienne du 2026-09-19) peuvent s'écrire. Aucun seuil à deviner sur un corpus qui
  n'existe pas.
- **insensible à l'ordre de la file** : il ne mesure pas la population servie, il mesure le
  **taux de contradiction de la preuve**. Que la thèse trie par retard ou non, le témoin dit
  la même chose.
- **il se déclencherait vraiment** le matin d'une refonte de gabarit, ce que ni la part
  actuelle ni la part bornée ne savent plus faire, puisqu'elles sont déjà au-dessus du seuil
  sans aucune refonte.

Garder `GUARD_MIN = 30` comme plancher sur le nombre de fiches servies dans la fenêtre : un
matin à deux fiches ne conclut rien.

La preuve indépendante que la signature est saine, tirée du journal des runs : les
healthchecks « 0 panneau sur 5 » s'accompagnent systématiquement du titre de page
« Annonce introuvable » (runs du 09-24T16:58, 09-25T01:59, 07:59, 10:59, 16:58), et le
panneau est confirmé sur les fiches vivantes du même run — jusqu'à 19 fiches contrôlées à 1
dans le run de 10:59. L'extension marche, la preuve marche, les 429 absences sont vraies.

**Enjeu de date.** `docs/roadmap.md:44` croit encore que le blocage du lot E est « les
revisites ne tournent pas » : elles tournent, 740 à 825 fiches/jour mesurées. Le blocage est
le garde-fou, **51 disparitions écrites en tout** sur 106 254 lignes lbc, la dernière le
**2026-09-22 00:49**. La remesure du lot E est datée du 1er octobre (`roadmap.md:118-125`) :
cinq jours.

---

## 3. La proposition, lot par lot

### Lot 1 — La licence du robot · 0,25 j · **0 fichier de code**

Un seul geste : **la clé de la licence `crawler` (automated) dans le popup de l'extension du
Chrome qui crawle**, plus une ligne dans chacun des trois runbooks disant quelle licence ce
Chrome porte. Aucune ligne de code. La licence existe déjà (`mint_license.py --automated` /
`mark_automated.py`, cf. `operator.py:15-19`), avec 0 relevé à son nom.

Ce que le geste répare, chaque point mesuré ci-dessus :

1. **Le quota.** `quota.guard:23` sort immédiatement sur `license_.automated`
   (« Les licences automated n'en ont pas — le robot est la source de presque tout le
   trafic », `quota.py:6-7`). Les 18 211 observations/jour cessent d'être jugées comme un
   marchand. *Sans ce geste, le run de 23 h n'écrit aucun prix.*
2. **La boucle des 43 fiches.** `disappearance.observe:120-121` cesse de poser un marqueur
   sur chaque absence du robot.
3. **Les marqueurs levables.** `divergence.on_observation:24-30` aiguille vers `_verify`,
   donc `recheck.clear:127` devient atteignable, donc les 43 marqueurs se lèvent et la
   file cesse de resservir les mêmes identifiants.
4. **Le journal des écarts.** `divergence.on_absence` (`disappearance.py:141`) devient
   atteignable ; `divergences` peut porter une ligne (0 aujourd'hui) ; `/app/ecarts.html`
   cesse d'être un décor ; et les seuils 5 % / 1 000 km que `roadmap.md:90` demande de
   mesurer avant de les figer deviennent mesurables.

À dire franchement, deux effets de bord :

- `alerts_confirmed_only` (`config.py:99`, `alert_rules.py:99`) exige
  `License.automated IS TRUE OR license_key_hash IS NULL`. Activé **aujourd'hui** il ne
  retiendrait que 5,1 % des relevés et rendrait les alertes quasi muettes ; **après ce
  geste** il devient utilisable. La parade que `roadmap.md:73-77` met « en réserve » cesse
  d'être une arme chargée. Ne pas l'activer avant, ce qui est déjà la consigne.
- Les déclarations des **marchands** continuent d'aller dans `recheck.mark` : c'est voulu,
  c'est le sens de l'aiguillage.

**Ce geste est la pièce la moins chère de tout l'exercice** : zéro fichier de code pour
quatre pannes mesurées, dont une en cours depuis deux heures.

### Lot 2 — Le garde-fou avec son témoin · 0,25 j · 1 fichier, ~8 lignes

`disappearance.fleet` (`disappearance.py:94-101`), comme au §2.2 : remplacer la part
`gone / settled` par le compte des absences qui **contredisent une vue de moins de 48 h**,
avec `GUARD_MIN` conservé en plancher sur les fiches servies. Le docstring `:83-92`, qui
argumente aujourd'hui pour l'asymétrie, dit alors ce que le code fait.

Effet immédiat, mesuré : témoin à 0 → le garde-fou s'ouvre → les 1 264 absences mûries
peuvent s'écrire, et le lot E reçoit sa mesure du 1er octobre.

Un mot sur la salve : 1 264 écritures d'un coup, dont 576 au-delà de trois jours. Elles sont
vraies (18,4 à 19,2 jours de silence chacune), mais elles arriveront le même jour. Les
laisser passer d'un bloc est le comportement correct — `disappearance.py:143` écrit
`listing.disappeared_at = listing.absent_since`, donc **la date écrite est celle de la
première constatation**, pas celle du déblocage. L'historique n'est pas faussé par le
retard. C'est exactement la raison pour laquelle la règle 2 du docstring existe.

### Lot 3 — Les deux nombres que le marchand doit voir · 0,5 j · 2 fichiers · 0 migration

Le point 6 de la thèse ajoute deux seuils (30 j, 90 j), une colonne de persistance pour le
« une seule fois », et porte le compte des constantes temporelles de 7 à 9. Mesuré :

- **0 annonce** dépasse 30 jours de silence, **0** dépasse 90, sur les deux sites. Le plus
  vieux `last_seen` de la base est du **2026-09-06** : les seuils ne mordront pas avant le
  6 octobre et décembre. Du code qu'on ne peut ni voir agir ni régler.
- Deux des trois endroits que le point 6 nomme **le font déjà**, au même seuil ou plus
  serré : `sellers.py:29 ONLINE_WINDOW_DAYS = 30`, appliqué `:76` — exactement les 30 jours
  de la thèse, **déjà livré** ; `alert_rules.py:27 SEEN_WINDOW = 48 h`, appliqué `:54` —
  plus serré. Il ne reste que `/v1/market` (`market_query.py:97`, seul filtre
  `disappeared_at`).

Donc : **ne rien retirer, publier `last_seen`.** `market_query.py:90` le sélectionne déjà ;
`ItemOut` (`market_items.py:28-50`) ne le porte pas. Ajouter le champ et un libellé calculé
dans `market_items.item_of`, et ajouter à `SellerStatsOut` un compte « non vérifié depuis
N j ». **Zéro colonne, zéro constante, zéro migration**, et ça dit quelque chose de vrai
dès le premier jour au lieu de rien jusqu'au 6 octobre.

Pourquoi c'est plus utile que la version de la thèse, mesuré. La vraie falaise de fraîcheur
du produit est à **48 h**, pas à 30 jours, et elle est **invisible** : 38 681 annonces
alertables sur 122 791 vivantes (**31,5 %**). Par famille :

| famille | vivantes | alertables (< 48 h) | part |
|---|---|---|---|
| tesla model y *(la seule recherche enregistrée, balayée chaque jour)* | 770 | 746 | **96,9 %** |
| peugeot 207 | 4 186 | 1 446 | 34,5 % |
| renault clio | 7 857 | 2 269 | 28,9 % |
| **porsche 911** | **1 106** | **0** | **0,0 %** |

Un marchand qui suit la Porsche 911 ne recevra **jamais** une alerte sur 1 106 annonces, et
aucune ligne ne le lui dit. À l'inverse, la seule recherche enregistrée qui existe est à
96,9 % — **preuve que le balayage F2 fonctionne** et que l'écart de fraîcheur est une
question de budget de couverture, pas d'architecture de file.

**Et ce que je refuse explicitement : retirer quoi que ce soit du marché.** La péremption à
30 jours de la thèse, datée sur la distribution mesurée de `last_seen`, sort
**21 320 annonces lbc le 2026-10-06 et 17 484 le 10-07** — soit **38 804, 36,5 % du corpus
lbc vivant, sur deux jours consécutifs** — puis 16 565 des 16 588 La Centrale entre le 19 et
le 25 octobre. Ce n'est pas un dégradé, c'est une falaise datée, et elle tombe au moment
précis où le point 7 arrête le ratissage qui est la seule chose qui nourrisse ces annonces.
Griser et offrir un filtre coûte le même travail et ne peut pas produire ce jour-là.

### Lot 4 — Une échéance sur le shard, et un barème honnête · 0,25 j · 2 fichiers

Le point 1 de la thèse change l'ordre de la file de fiches. Mais `revisit._rank:99-107`
finit **déjà** sur `Listing.last_seen` croissant (`revisit.py:134`) et `RUNBOOK.md:111`
prend **déjà** les shards les plus anciens. La cause mesurée des annonces les plus rances
n'est pas l'ordre de la file : c'est que **la découverte n'a aucune cadence**.
`crawler/shards.json` : 89 shards, **tous** en `status: ready`, 38 avec un `last_crawled`,
51 jamais touchés, et huit encore à `last_crawled: 2026-09-06` — 19 jours. C'est exactement
l'âge des 429 absences constatées aujourd'hui (18,4 à 19,2 jours de silence).

Un champ `due_at` dans `shards.json` et une ligne de tri dans `RUNBOOK.md`. Pas une refonte.

Au même geste, la seule contradiction de budget qui coûte des fiches mesurées. Trois
fichiers donnent trois budgets : `RUNBOOK.md:101` écrit lui-même que « le budget de 25 min
ne couvre pas un shard de ~200 pages », `RUNBOOK-balayage.md:224` dit 30 minutes,
`RUNBOOK-revisites.md:157` dit 20. Et l'opérateur rabote le `limit` calculé à la main
**quatre runs sur quatre le 09-25** : `limit=50` au lieu de 64, `30` au lieu de 41, `55` au
lieu de 67, `20` au lieu de 41 — 25 à 50 % de la file non servie à chaque run. La session a
mesuré la cause elle-même au run de 16:58 : « pace reellement mesure sur ce run ~9,5 s/fiche
(100 fiches en 930 s) contre les 8 s du bareme ». Une ligne : porter le barème de
`RUNBOOK-revisites.md:108` de 8 s à **10 s/fiche**. Le calcul devient honnête, le rabotage à
la main s'arrête.

---

## 4. Ce que l'alternative ne fait pas, et pourquoi c'est acceptable

### 4.1 Pas de file unique triée par fraîcheur due

**Pourquoi c'est acceptable :** la hiérarchie serait calibrée sur un échantillon de un. La
base porte **1 recherche enregistrée** (`tesla model y`), **5 follows**, **11 tracked
families**, **1 compte**. Et le palier le plus fin de la thèse — « quelques heures » pour
les suivis et les familles suivies — pèse `follows ∪ tracked_families` = **31 503 annonces,
25,7 % du corpus vivant**. Un seul passage par pages de résultats coûterait ~900 ouvertures,
**plus de 70 % de la capacité mesurée** (1 077 pages le 09-24, 1 318 le 09-25), pour une
promesse énoncée en heures ; par fiches, 31 503 / 825 = **38 jours**.

La décision n'est pas fausse, elle est **inmesurable**. Elle attend le journal des cinq
marchands. Et le point 1 tient déjà pour l'essentiel dans `_rank` : si un besoin apparaît
avant, **une ligne** suffit — séparer `Follow` (5 annonces) de `TrackedFamily` (31 498) dans
`revisit._wanted`/`_rank`, le premier au rang 1, le second au rang 3. Pas de date due, pas
de prédicat d'appartenance, `sweep.py` intact.

### 4.2 Pas de « deux moyens choisis par le coût »

**Pourquoi c'est acceptable :** l'arbitrage a deux extrémités et le code n'en sert aucune.

- **En haut :** `sweep_split.cut` plafonne à `MAX_ENTRIES=8 × PAGE_CAP=20 × ADS_PER_PAGE=35
  = 5 600` annonces (`sweep_split.py:14-21`). Mesuré : **38 familles dépassent
  700 annonces** (le cap d'une seule coupe) et pèsent **63 269 annonces = 60 % du corpus
  lbc** ; Renault Clio en porte 6 933 > 5 600, donc `sweep.py:69` la classe `trop_large`.
  Le commentaire qui justifie `MAX_ENTRIES = 8` cite « Renault Clio, en porte 4 723 » :
  périmé de 47 %.
- **En bas :** **637 familles portent moins de 36 annonces** pour 5 824 annonces au total.
  Là, la page coûte plus cher que la fiche qu'elle remplace — et la fiche, en plus, tranche
  l'absence.

Une règle lisible remplace le calcul de coût : **page de résultats si la famille porte ≥ 36
annonces, fiche sinon.** Mesurable, une condition, aucune amortisation par famille.

**Et j'ai vérifié le correctif que deux contradicteurs proposent pour les grosses familles —
un troisième axe de découpage par département. Mesuré, il est pire que de ne rien faire.**
Les 10 familles `trop_large` découpées en (famille × `owner_type` × département) donnent
**1 609 cellules** ; avec la marge `+1` obligatoire de `sweep_split._pages`
(`sweep_split.py:24-29`, nécessaire à la découverte), cela fait **3 726 pages pour
32 435 annonces = 8,7 annonces par page**, contre **16,1 mesurées** pour les tranches de
prix existantes (`shards.json` : 6 596 pages cumulées pour 106 254 annonces). La page de
marge par cellule mange tout le gain, et la plus grosse cellule reste à 2 050 annonces,
donc l'axe ne borne même pas. Le bon levier est `price_rounds`, pas un axe de plus — et il
n'est pas urgent, puisque les tranches de prix couvrent ces familles aujourd'hui à 16,1/page.
`sweep_url.py:102-111` traduit déjà `regdate` et `locations` (relevés le 2026-09-22 sur une
URL fabriquée par le site) : le jour où il faudra, la traduction est prête. Ce n'est pas ce
jour-là.

### 4.3 Pas de fusion des runbooks, pas de page `/app/file.html` unique

**Pourquoi c'est acceptable :** la règle que le point 3 veut instaurer est **déjà écrite,
mot pour mot, aux deux endroits** — « Cette session ouvre des URL. Elle ne conclut rien. »
(`RUNBOOK-balayage.md:14` et `RUNBOOK-revisites.md:28`, plus `RUNBOOK-balayage.md:219`). Le
paramétrage est déjà côté serveur (`?limit=`, `?pages=`).

Et les deux décisions qui restent **ne sont pas déplaçables** : `N = max(data-pages,
ceil(total/35))` a besoin d'un nombre que seule la page du site porte
(`RUNBOOK-balayage.md:96-99`, `total` lu dans `__NEXT_DATA__`) — et le compte du serveur est
systématiquement bas, le journal du 2026-09-23T22:02 lit 667 contre 280 attendus, facteur
2,4 ; et la taille de tranche a besoin du budget horloge de la session. Le gain restant est
cosmétique (~85 lignes de JS). Les runbooks tournent, F2 a été vérifié en vrai : on n'y
touche que le barème du §Lot 4.

### 4.4 Pas de péremption, pas de quatre états, pas de pesage des sources

**Pourquoi c'est acceptable :** c'est déjà décidé ailleurs, plus finement, et **ce soir**.
`.superpowers/disparition-plan.md` (commit `f62465f`, 2026-09-25 22:19, 772 lignes) porte
les quatre états, les deux voix, la réversibilité, la migration 017 non destructive et le
filtrage par compte. Et son §2.4 conclut **l'inverse** du point 4 de la thèse : le robot
doit confirmer seul, « sinon `disappeared_at` devient une colonne morte », parce qu'il est
aujourd'hui la seule source.

Mesuré, il a raison : **0 annonce en base a deux sources distinctes**. 155 090 relevés sur
163 486 portent une seule licence, 8 396 n'en portent aucune, 1 compte, 1 recherche.
« Confirmé par deux comptes distincts » avec un effectif de 1 signifie **tout reste
« probable » indéfiniment** — et lu à la lettre, le point 4 rétrograderait les
51 disparitions écrites, laissant le produit sans aucune disparition ferme.

Le pesage des sources attend des sources. Le lot 1 fait du robot une source **identifiable**
(automated), ce qui est le préalable de tout pesage — et c'est tout ce qu'on peut faire de
mesuré aujourd'hui.

### 4.5 Pas de décision sur le ratissage ni sur La Centrale, mais un chiffre à poser

**Pourquoi c'est acceptable :** ce sont des décisions produit et juridiques, pas
d'architecture, et les retarder ne casse rien ce soir. Mais deux faits doivent figurer au
dossier avant qu'Alexis tranche, parce que la thèse les tient pour acquis :

- **La Centrale n'est pas « hors crawl »** : `crawler/shards-lacentrale.json` porte
  39 shards, le journal du 09-25 en montre l'activité jusqu'à 20:45:20, et
  **16 565 des 16 588 annonces lc ont été vues dans les 7 derniers jours**. Or
  `revisit.ADDRESS = {"lbc": _lbc}` (`revisit.py:74`) et `sweep_url.translate` ne fabrique
  que du leboncoin (`CATEGORY="2"`, `leboncoin.fr/recherche`) : dans le modèle de la thèse,
  **13,5 % du corpus n'a ni l'un ni l'autre des deux moyens**. Le jour où le ratissage
  s'arrête, La Centrale cesse d'être observée.
- **Le « tour du corpus en ~15 jours » n'a pas eu lieu** : 37 shards complets sur 89,
  51 jamais touchés, prix maximum atteint 4 000 € après 19 jours. Le chiffrage du point 8
  est faux dans les deux sens — 100 pages/jour contre **1 077 et 1 318 mesurées**, 400
  fiches/run contre **120 à 160** (les 13 derniers runs : 160 150 130 145 145 160 160 145
  150 130 155 120 125), 3 000 fiches/jour contre **740 et 825**, 71 600 annonces contre
  **106 203 lbc + 16 588 lc = 122 791**.

Mon lot 3 rend ces deux faits visibles dans le produit sans avoir à les trancher : une
annonce La Centrale non revue affiche son `last_seen`, un corpus limité au bas du marché se
lit sur les libellés. La décision se prend ensuite, sur le journal, et pas en même temps
qu'une refonte.

---

## 5. Chiffrage

| Lot | Jours | Fichiers de code | Fichiers de doc | Ce qu'il débloque, mesuré |
|---|---|---|---|---|
| 1 · licence du robot | 0,25 | **0** | 3 runbooks | quota (18 211/j contre 2 000, robot muet depuis 20:52:21), 43 rechecks indélébiles, 0 divergences, la boucle des 43 fiches |
| 2 · garde-fou + témoin | 0,25 | 1 (`disappearance.py`, ~8 l.) | — | 1 264 absences mûries, 51 disparitions écrites depuis le 09-22, le lot E du 1er octobre |
| 3 · les deux nombres | 0,5 | 2 (`market_items.py`, `sellers.py`) | — | 0 % d'alertable sur 1 106 Porsche 911, dit au lieu d'être tu ; pas de falaise le 6 octobre |
| 4 · échéance de shard + barème | 0,25 | 0 (`shards.json` = données) | 2 runbooks | 8 shards à 19 jours ; 25 à 50 % de file non servie à chaque run |
| **Total** | **1,25 j** | **3** | **4** | |

**Comparaison.** La thèse : 2 à 3 jours, ~115 lignes retirées, une route retirée, un prédicat
d'appartenance mesuré à 80 137 buffers par recherche, deux constantes temporelles qui
concernent 0 ligne, une colonne, une migration, et une amortisation page-contre-fiche qui
rend 2,3 annonces dues par ouverture à l'équilibre au lieu des 35 annoncées.

**Aucune migration, aucune colonne, aucune constante temporelle nouvelle** dans ma
proposition. Le compte des constantes reste à 7 (`revisit.py:61-71`, `coverage.py:24`,
`alert_rules.py:27`, `disappearance.py:60`).

---

## 6. L'ordre des lots, et pourquoi il est forcé

1. **Lot 1, ce soir.** Le run de 23 h n'écrira aucun prix sans lui, et chaque run qu'il
   traverse ajoute des absences qui deviennent des marqueurs indélébiles. C'est le seul lot
   daté à l'heure.
2. **Lot 2, demain matin.** Seule chose entre 1 264 absences mûries et `disappeared_at`, et
   la remesure du lot E est datée du 1er octobre (`roadmap.md:118-125`) : cinq jours. Après
   le lot 1, parce que le témoin du §2.2 se lit mieux quand le robot écrit à nouveau des
   observations vivantes.
3. **Lot 3.** Le seul que le marchand voie. Indépendant des deux premiers, donc parallélisable,
   mais il n'y a rien à dire de fraîcheur tant que la chaîne est arrêtée.
4. **Lot 4.** 19 jours de péremption de shard : le plus facile à énoncer, le plus lent à
   compter.

**Puis, et seulement alors :** une semaine de tour au rythme mesuré (≈1 100 pages et
≈800 fiches par jour) sous la licence automated, et la décision de la file unique prise sur
le journal des cinq marchands — pas sur un échantillon de un.

---

## 7. Ce que je retiens de la thèse

Trois choses tiennent et sont reprises ci-dessus :

1. **La division du travail du point 2** — la fiche ne sert qu'à ce qu'une carte ne dit pas,
   l'absence. C'est déjà la doctrine (`RUNBOOK-balayage.md:9-10`, `revisit.py:1-7`) et mon
   §4.2 la formule en une condition au lieu d'un calcul de coût.
2. **L'intuition du point 1** — le retard fait la priorité. `_rank` la porte déjà comme
   dernière clé ; si elle doit se raffiner, c'est une ligne (§4.1), pas une refonte.
3. **Le point 7 est la vraie décision**, et les quatre contradicteurs ont raison de le dire :
   c'est la seule chose qui fasse tenir l'arithmétique. Mais c'est une décision produit et
   juridique datée, pas une architecture — et elle se prend mieux avec les libellés du lot 3
   sous les yeux (§4.5).

Ce que je rejette : le chiffrage du point 8 (faux d'un ordre de grandeur dans les deux sens,
§4.5), la péremption du point 6 (falaise datée du 6 octobre, §3 lot 3), le pesage des
sources du point 4 (contredit par `disparition-plan.md` §2.4 et par un effectif de 1, §4.4),
et la file unique (§4.1).

---

## Annexe — mesures, toutes rejouées ce soir en lecture seule

`psql -d adscope` avec `SET default_transaction_read_only = on`, PostgreSQL 17.11.

**Corpus** — `listings` où `disappeared_at IS NULL` : lbc 106 203, lc 16 588, total 122 791.
Vues < 48 h : 31 617 + 7 064 = 38 681 (31,5 %). Vues < 10 j : 63 202 + 16 565.
Au-delà de 30 j : **0 et 0**. `min(last_seen)` : 2026-09-06 sur les deux sites.

**État de la chaîne** — `rechecks` 43 (tous `field='absence'`, `observed_at` entre 21:52:22
et 21:59:27 ce soir) · `divergences` **0** · `absent_since IS NOT NULL` **1 343**, dont
1 264 au-delà de 6 h et 576 au-delà de 3 j, la plus ancienne du 2026-09-19 ·
`disappeared_at IS NOT NULL` **51**, le dernier le 2026-09-22 00:49 · `saved_searches` 1 ·
`follows` 5 · `tracked_families` 11 · `licenses` 4 dont 1 automated.

**Licences × relevés** — `alexis` automated=**false** : 155 090 relevés, dernier
**2026-09-25 20:52:15** · hash nul : 8 396, dernier 2026-09-06 · `crawler` automated=true :
**0, jamais**.

**Quota** — `usage_days` sous le hash `alexis` : 18 211 le 09-25, 23 508 le 09-24, 6 291 le
09-23, contre `observations_per_day()` = **2 000** (`config.py:91`, variable absente du
processus et du plist). API PID 56610 démarrée **2026-09-25 20:52:21**, `runs = 6`.
Absences écrites après ce redémarrage : **43**, la dernière 21:55:09.

**Garde-fou de flotte** — fenêtre 24 h, 876 fiches servies. Actuel 509/819 = **62,1 %** ·
numérateur borné 429/739 = **58,1 %** · sur servies 429/876 = **49,0 %** · seuil
`GUARD_SHARE` = 33,3 %. Par fraîcheur au service : silence > 48 h → 429/566 = **75,8 %** ;
revue < 48 h → **0/310 = 0,0 %**. Absences contredisant une vue < 48 h, sur toute la base :
**0 sur 1 343**. Silence avant les 429 absences du jour : **18,4 à 19,2 jours**, un seul
seau.

**Absences par jour de début** — 09-19 : 107 · 09-21 : 89 · 09-22 : 380 · 09-23 : 2 ·
09-24 : 336 · 09-25 : 429.

**Familles** — 920 familles canoniques lbc vivantes pour 106 195 annonces. 38 au-delà de
700 → 63 269 (60 %). 637 sous 36 → 5 824. Les dix plus grosses : clio 6 933, 207 3 731,
206 3 624, mégane 3 508, c3 3 275, twingo 2 833, golf 2 771, c4 picasso 1 971, 308 1 923,
scénic 1 866.

**Axe département simulé** — les 10 familles `trop_large` en (famille × owner_type ×
département) : 1 609 cellules, plus grosse 2 050, **3 726 pages** (avec le `+1` de
`_pages`) pour 32 435 annonces = **8,7/page**. Contre `shards.json` : 6 596 pages pour
106 254 = **16,1/page**.

**Alertables par famille** (`last_seen ≥ now-48h`) — tesla model y 746/770 (96,9 %) ·
peugeot 207 1 446/4 186 (34,5 %) · renault clio 2 269/7 857 (28,9 %) · **porsche 911
0/1 106 (0,0 %)**. Population `follows ∪ tracked_families` : **31 503**.

**Falaise de la péremption à 30 j** (chaque vivante datée à `last_seen + 30 j`) —
2026-10-06 : 21 320 lbc · 10-07 : 17 484 lbc, soit **38 804 = 36,5 %** du corpus lbc sur
deux jours consécutifs ; puis 16 565 des 16 588 lc entre le 19 et le 25 octobre.

**Journal** — `crawler/logs/2026-09.log`, pages de résultats et fiches par jour : 09-19
211/0 · 09-20 584/128 · 09-21 783/450 · 09-22 1 456/2 210 · 09-23 248/310 · 09-24 1 077/740
· 09-25 **1 318/825**. `shards.json` : 89 shards, tous `status: ready`, 38 avec
`last_crawled`, 8 encore au 2026-09-06. `shards-lacentrale.json` : 39 shards, activité
jusqu'à 20:45:20 le 09-25.
