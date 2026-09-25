# Challenge de la thèse « acquisition refondue » — angle simplicité réelle

Contradicteur, 2026-09-25. Dépôt en lecture seule, base `adscope` en
`default_transaction_read_only = on`. Aucune visite de leboncoin ni de La Centrale,
aucune clé lue. Thèse challengée :
`scratchpad/acquisition-these.md`.

---

## 0. Le compte, d'abord : ce que la thèse retire et ce qu'elle ajoute

**Surface d'acquisition existante, mesurée.**

| Objet | Compte |
|---|---|
| Code serveur | `revisit.py` 149 + `sweep.py` 97 + `sweep_split.py` 83 + `sweep_url.py` 114 + `coverage.py` 64 = **507 lignes** |
| Routes | **2** — `POST /v1/revisits` (`main.py:134`), `GET /v1/sweep` (`sweep.py:91`) |
| Pages opérateur | **2** — `web/revisites.html` (15 l.) + `web/js/revisits-page.js` (94 l.), `web/balayage.html` (15 l.) + `web/js/balayage-page.js` (86 l.) |
| Runbooks | `RUNBOOK.md` 174 + `RUNBOOK-balayage.md` 322 + `RUNBOOK-revisites.md` 203 = **699 lignes** |
| Règles de priorité | **6 rangs** (`revisit.py:99-107`) + 3 clés de tri (`revisit.py:134`) + 2 conditions d'éligibilité (`revisit.py:126-129`) |
| Constantes temporelles | **7** — `QUIET` 3 j, `SPACING` 7 j, `CONFIRM_DELAY` 6 h, `OLD` 31 j (`revisit.py:61-71`), `FRESH` 24 h (`coverage.py:24`), `SEEN_WINDOW` 48 h (`alert_rules.py:27`), `GUARD_WINDOW` 24 h (`disappearance.py:60`) |
| Colonnes d'état d'annonce | **6** — `first_seen`, `last_seen`, `last_revisit_at`, `next_detail_crawl`, `absent_since`, `disappeared_at` |

**Ce que la thèse retire réellement** (§ « Ce qu'on retire », lignes 44-46) :

- « Les trois files distinctes » → elle en retire **une sur trois**. Le point 7 garde
  la découverte à part, « un plan de shards avec sa progression » : `shards.json`
  reste (89 shards, 51 sans `last_crawled`, 2 avec `resume`, `page_cap`/`ads_per_page`/`shard_cap`).
- « Les runbooks séparés » → la § « Ce qu'on garde » (ligne 50) garde « les runbooks
  comme mode d'emploi de l'ouvre-page ». Les 699 lignes ne disparaissent pas, elles
  sont refilées.
- « Les marqueurs posés/levés à la main » → **rien n'est posé à la main.**
  `recheck.mark` est appelé automatiquement par `divergence.on_observation`
  (`divergence.py:27-30`) sur toute observation non-automated, et levé par
  `_verify` → `recheck.clear` (`divergence.py:127`). Il n'existe aucun geste manuel
  à retirer.
- « La distinction revisite/balayage côté serveur » → c'est le seul retrait vrai.
  Estimation honnête : `sweep._entries` tri + `_budget` (12 l., `sweep.py:77-88`),
  `revisit._rank` (9 l.), le gating `QUIET`/`SPACING` (8 l.), une route, et l'un des
  deux fichiers JS (86 l.). **≈ 115 lignes et 1 route.**

**Ce qu'elle ajoute**, et qui n'existe sous aucune forme aujourd'hui :

1. Le prédicat « cette annonce est dans une recherche enregistrée » (palier 1 jour,
   point 1). Aucun équivalent en base : `saved_searches` ne stocke qu'une chaîne
   (`brand=tesla&model=model+y`), qu'il faut passer par `MarketParams.from_query` →
   `market_query.core`. Coût mesuré : § 3 ci-dessous.
2. Le choix du moyen « par le coût » (point 2) : une amortisation par famille,
   N ouvertures de page contre k annonces en retard. Coût mesuré : § 2.
3. Quatre états (point 5) → au moins une colonne ou une contrainte de plus ;
   « changement à confirmer » n'est aujourd'hui qu'une ligne dans `rechecks`.
4. Péremption (point 6) → **2 constantes temporelles de plus (9 au lieu de 7)** et
   une colonne pour le « une seule fois » à 90 jours.
5. Le pesage des sources (point 4) → un comptage de comptes distincts par fait.

**Verdict du compte : retirer 115 lignes et une route, pour ajouter quatre
prédicats, deux constantes, une colonne et une amortisation par famille.
Ce n'est pas une simplification, c'est un déplacement.**

---

## 1. Objection bloquante — le chiffrage du point 8 est faux d'un ordre de grandeur, dans les deux sens

La thèse budgète **100 pages/jour ≈ 3 500 annonces/jour** et **~400 fiches par run
de revisite, 8 runs/jour**, pour un « tour du corpus par pages en ~15 jours ».

**Mesuré dans `crawler/logs/2026-09.log`** (cumuls par jour, lignes de shard
`lbc-c2-*`, lignes de balayage `https://www.leboncoin…`, lignes `revisites` hors
ligne BILAN recumulée) :

| Jour | pages crawl | pages balayage | fiches revisite | annonces distinctes vues (`price_points`) |
|---|---|---|---|---|
| 2026-09-22 | 1 348 | 11 | 1 400 | 24 545 |
| 2026-09-23 | 108 | 40 | 310 | 1 435 |
| 2026-09-24 | 860 | 116 | 740 | 24 045 |
| 2026-09-25 | 948 | 169 | 825 | 17 564 |

- **Les 100 pages/jour sont une régression de 10×**, pas un budget : le crawl seul
  en ouvre 860 à 1 348. Le balayage par recherche en ouvre déjà 116 à 169.
- **Le rendement réel d'une ouverture de page n'est pas 35 annonces.** Le 2026-09-25 :
  1 117 pages de résultats + 825 fiches = 1 942 ouvertures → 17 564 annonces
  distinctes, soit **9,0 par ouverture** (15,7 par page si on impute tout aux pages).
  Le 09-24 : 24,6 par page. Le doublon intra-journée mange 30 à 55 %.
  Donc 100 pages/jour ≈ **1 600 à 2 500 annonces distinctes/jour**, pas 3 500.
- **Le tour du corpus** : 106 203 annonces lbc vivantes en base (pas 71 600 — cf. § 6).
  À 100 pages/jour et 35/page : **30 jours**, pas 15. Au rendement mesuré :
  **42 à 66 jours**.
- **Les 400 fiches par run n'ont jamais eu lieu en automatique.** Les 16 derniers runs
  planifiés donnent 120, 125, 130, 130, 145, 145, 145, 150, 150, 155, 160, 160, 160 —
  **jamais 400**. La seule journée à 1 000+ fiches (09-22) est une passe interactive
  d'Alexis, 10 tranches de 100 entre 05:57 et 07:37, soit 6 s/fiche. Le runbook mesure
  8 s/fiche de bout en bout (`RUNBOOK-revisites.md:109`) et calcule
  `limit = min(100, (secondes restantes - 90) / 8)` sur un budget de 20 min
  (`RUNBOOK-revisites.md:108-110`) : **400 fiches en un run est arithmétiquement
  hors d'atteinte** (il faudrait 3 200 s = 53 min).
- **3 000 fiches/jour**, au meilleur rythme jamais mesuré (6 s), c'est **5 heures de
  navigation continue** dans le seul Chrome d'Alexis, au premier plan.

**Alternative.** Refaire le chiffrage sur le journal avant d'arbitrer quoi que ce
soit : le budget réel est ~1 100 pages + ~800 fiches par jour, et le rendement
9 annonces distinctes par ouverture. Tout arbitrage page-contre-fiche posé sur
« 35 contre 1 » est posé sur un facteur faux de 4×.

---

## 2. Objection bloquante — la « page de résultats par défaut » n'est pas ciblable, et le point 1 se contredit avec le point 2

Le point 2 dit : « toute annonce en retard est d'abord servie par la recherche qui la
contient, enregistrée ou non ». Mais `sweep_url.translate` compose une URL triée
**par prix** (`sweep_url.py:81` : `sort=price&order=asc&page=1`). Il n'existe aucun
moyen de demander à leboncoin « les 35 annonces de cette famille que je n'ai pas vues
depuis dix jours ». **Le retard est par annonce, le moyen est par famille.**

**Mesuré sur les 920 familles canoniques lbc vivantes :**

| Taille de famille | familles | annonces | pages (`ceil(n/35)+1`) | annonces par page |
|---|---|---|---|---|
| 1 | 105 | 105 | 210 | **0,5** |
| 2–5 | 204 | 681 | 408 | **1,7** |
| 6–35 | 328 | 5 038 | 656 | 7,7 |
| 36–700 | 245 | 37 102 | 1 444 | 25,7 |
| > 700 | 38 | 63 269 | 1 865 | 33,9 |
| **total** | **920** | **106 195** | **4 583** | **23,2** |

Le `+1` vient de `sweep_split._pages` (`sweep_split.py:24-29`), et il est nécessaire —
sans marge au-delà du connu, une recherche ne découvre jamais rien. Conséquence :
**toute famille coûte au minimum 2 ouvertures de page.** Les 105 familles à une seule
annonce coûtent 210 ouvertures pour 105 annonces : **deux fois plus cher que d'ouvrir
la fiche**, qui en plus répond sur l'absence. Les 309 familles de ≤ 5 annonces :
618 ouvertures pour 786 annonces.

**Et le ciblage empire à mesure que la thèse réussit.** Aujourd'hui, avec tout le
corpus en retard, servir les 43 001 annonces non revues depuis 10 jours coûte
4 388 ouvertures → 9,8 retardataires par page. Mais le régime que la thèse **veut**
est celui où seule une tranche est due : à l'équilibre du palier 10 jours, un dixième
du corpus est dû par jour, soit 10 620 annonces pour les mêmes 4 583 pages du cycle →
**2,3 annonces dues par ouverture de page**. Le point 2 promet 35.

Pire, mesuré : **353 familles portent entre 1 et 5 retardataires ; les servir par page
coûte 707 ouvertures pour 851 retardataires** (1,2 par ouverture). La fiche fait
mieux, et elle tranche l'absence.

**Et le plafond de `sweep_split` refuse la plus grosse famille.** `MAX_ENTRIES = 8` ×
`PAGE_CAP = 20` = 160 pages ≈ 5 600 annonces (`sweep_split.py:17-21`). Renault Clio en
porte 6 933 → `cut` rend `None` → `sweep.py:69` la classe `trop_large` et la saute.
**6 933 annonces (6,5 % du corpus) que le moyen « par défaut » de la thèse ne peut pas
servir du tout**, et c'est justement une famille suivie par une licence.

**Alternative.** Garder les deux moyens séparés avec une règle lisible en une ligne,
plutôt qu'un calcul de coût : *page de résultats si la famille porte ≥ 36 annonces,
fiche sinon*. Le seuil est mesurable (le tableau ci-dessus), il tient en une
condition, et il n'a pas besoin d'une amortisation par famille que personne ne relira.

---

## 3. Objection sérieuse — la « date due unique » déplace la complexité dans un prédicat coûteux, et son palier le plus fin couvre 30 % de la base

**a) Les trois paliers ne partagent pas la base : un en tient 30 %, un autre 0,7 %.**

Mesuré :

| Palier de la thèse | population lbc vivante |
|---|---|
| « quelques heures » — marquée à vérifier (`rechecks`) | **43** |
| « quelques heures » — disparition probable (`absent_since`) | **1 292** |
| « quelques heures » — suivie (`follows` ∪ `tracked_families`, comme `revisit._wanted`) | **31 501** |
| « un jour » — dans une recherche enregistrée | **770** (la seule recherche en base : `brand=tesla&model=model+y`) |
| « dix jours » — le reste | **~72 600** |
| total | **106 203** |

Le palier « quelques heures » pèse donc **32 836 annonces, 31 % du corpus** — parce que
`revisit._wanted()` (`revisit.py:80-88`) inclut `TrackedFamily`, et que les 11 lignes de
`tracked_families` désignent 10 grosses familles (Clio 6 933, 207 3 731, 206 3 624,
Mégane 3 507, C3 3 275, Twingo 2 833, Golf 2 771, Scénic 1 866, 307 1 859, 911 1 102).
Servir ce palier par pages de famille coûte **915 ouvertures** (199+108+105+102+95+82+81+55+55+33)
— soit **82 % de la capacité mesurée de 1 117 pages/jour, pour un seul passage par
jour**, quand la promesse est « quelques heures ». Facteur 4 à 8.
Et il ne reste alors ~200 pages/jour pour les 72 600 annonces du palier 10 jours :
2 900 pages de cycle → **14 jours**. Les deux promesses tombent ensemble.

Par fiches, c'est pire : 32 836 fiches au débit mesuré de 825/jour = **40 jours** pour
un palier promis en heures.

**b) Le prédicat « dans une recherche enregistrée » est le seul vraiment nouveau, et
c'est le plus cher.** Mesuré par `EXPLAIN (ANALYZE, BUFFERS)` sur la base réelle :

- Le tri actuel de `revisit.due()` en entier (6 rangs, 3 clés, 70 971 lignes
  éligibles, `LIMIT 100`) : **81 ms, 3 617 buffers**. Les trois `EXISTS` sont des
  seq scans sur 43, 5 et 11 lignes.
- Une seule recherche enregistrée avec une borne de prix — le filtre de marchand le
  plus courant — ne peut plus laisser Postgres élaguer la jointure `last_price` de
  `market_query.core` : **60 ms et 80 137 buffers** (`renault/clio` + prix 2000-8000),
  **87 ms et 418 829 buffers** sans filtre de famille (département seul).
  La sous-requête `DISTINCT ON` balaie les 163 486 `price_points` à chaque fois.

Le point 8 promet « ça tient jusqu'à 50 marchands ». À 5 recherches par marchand, le
prédicat d'appartenance coûte **250 × 70 ms ≈ 17 s** et ~160 Go de trafic de buffers
**par demande de file**. Aujourd'hui `sweep.py` paie déjà ce prix, mais une fois par
matin et sous budget de pages ; la thèse le met dans le **tri de la file entière**.

**c) Et quand tout est en retard, le tri dégénère en `ORDER BY last_seen`.**
43 001 annonces (40 % du corpus) dépassent déjà 10 jours de silence, 38 804 n'ont pas
été revues depuis le 7 septembre. Dans ce régime — qui est le régime réel, cf. § 1 —
« le retard fait la priorité » rend exactement l'ordre que `revisit.due` applique déjà
comme dernière clé (`revisit.py:134`, `Listing.last_seen`) et que la rotation des shards
applique déjà (`RUNBOOK.md:111`, « les 3 shards `status=ready` les plus anciens »).
**Le calcul de priorité produit, pour la majorité des lignes, la sortie qu'on a
gratuitement.**

**Alternative — une seule condition.** Le vrai défaut du tri actuel est un rang qui
tient 31 % de la base. Corriger cela est **une ligne** dans `revisit._rank`
(`revisit.py:99-107`) : séparer `Follow` (4 annonces) de `TrackedFamily`, le premier au
rang 1, le second au rang 3. On obtient la hiérarchie que la thèse cherche, sans date
due, sans nouveau prédicat, sans toucher `sweep.py`.

---

## 4. Objection bloquante — le point 4 (« deux comptes distincts ») gèlerait tout en « probable », parce qu'il n'y a qu'un compte qui observe

Mesuré sur `licenses` × `price_points` :

| label | `automated` | relevés (tout l'historique) | dernier relevé |
|---|---|---|---|
| `alexis` | **false** | **155 090** | 2026-09-25 |
| `alexis` | false | 0 | — |
| `crawler` | **true** | **0** | jamais |
| `verif` | false | 0 | — |

Sur les 7 derniers jours, **101 958 relevés, tous portés par une seule licence, non
automated**. La licence `crawler` (la seule `automated = true`) n'a **jamais** posté un
relevé.

Deux conséquences, immédiates et mesurables :

1. **Le point 4 est inapplicable.** « Un fait est confirmé par deux comptes distincts
   (robot inclus, il compte un) » : il y a **un** compte. Sous cette règle, 100 % des
   faits restent à l'état « probable », réversible, journalisé — indéfiniment.
   Le point 5 (« quatre états ») décrirait alors un automate à un seul état atteignable.
2. **Le lot Corpus est déjà mort pour cette raison, et la refonte ne le voit pas.**
   `divergence.on_observation` (`divergence.py:24-30`) aiguille sur `license_.automated` :
   comme il est faux, **chaque** relevé du crawler part dans `recheck.mark` au lieu de
   `_verify`. De même `disappearance.observe:120-121` appelle `recheck.mark_absence` sur
   chaque absence constatée par le crawler. Or seul `_verify` appelle `recheck.clear`.
   Mesuré : `rechecks` = **43 lignes, toutes `field = 'absence'`, toutes datées du
   2026-09-25** ; `divergences` = **0 ligne**. Le journal des écarts n'a jamais écrit,
   et ne peut pas écrire.

**Alternative — zéro ligne de code.** Faire tourner le crawl sous la licence
`crawler` (`automated = true`), ou basculer le drapeau de la licence qui l'exécute.
C'est un `UPDATE` d'une colonne. Cela débloque `_verify`, `recheck.clear` et le journal
des écarts en entier — soit tout le point 3 du lot Corpus (`docs/roadmap.md:79-84`) —
sans rien refondre. **À faire avant de discuter du pesage des sources**, sinon la
mesure des seuils (5 %, 1 000 km, `roadmap.md:90`) ne pourra jamais se faire.

---

## 5. Objection bloquante — le vrai blocage d'aujourd'hui est un interblocage du garde-fou de flotte, et la thèse ne le touche pas

`disappearance.fleet` (`disappearance.py:94-101`) mesure, sur la fenêtre de 24 h :
`gone` = annonces servies avec `absent_since IS NOT NULL`, `settled` = servies avec
`absent_since` **ou** `last_seen` dans la fenêtre. Écriture suspendue si
`settled ≥ 30` et `gone > settled / 3`.

**État mesuré à l'instant :**

```
gone = 509   settled = 819   servies_24h = 876   →  62,1 %  >  GUARD_SHARE (33,3 %)
```

**`observe` rend donc `held` sur chaque seconde constatation, en ce moment.** Et :

- 1 292 absences en cours, dont **1 213 au-delà de `CONFIRM_DELAY`** (6 h) et
  **525 au-delà de 3 jours**, la plus ancienne du 2026-09-19 ;
- **51 `disappeared_at` écrits** en tout, sur 106 254 lignes lbc.

Le mécanisme est en interblocage, et le docstring l'explique sans le voir
(`disappearance.py:83-92`) : le numérateur `gone` n'est **pas** borné dans le temps —
une absence y reste jusqu'à ce qu'elle soit revue vivante ou écrite comme disparue —
alors que le dénominateur `seen` l'est. Chaque nouvelle absence relève donc le ratio
de façon permanente, **et elle ne peut pas être écrite tant que le ratio est haut.**
Le garde-fou s'endort sur lui-même : plus il retient, plus il retient.

C'est la cause directe de ce que la feuille de route note comme le blocage du lot E
(`docs/roadmap.md:44`, `:174-175` : « les revisites ne tournent pas régulièrement…
Zéro absence, zéro `disappeared_at` »). Les revisites, elles, tournent maintenant
(3 538 fiches déjà revisitées, 740 à 825 par jour). **Le blocage a changé de nature et
personne ne l'a vu** — et aucun des huit points de la thèse ne le mentionne.

**Alternative — une condition.** Borner le numérateur par la même fenêtre :
`gone = Listing.absent_since >= window` dans `disappearance.fleet`. Le garde-fou
mesure alors un pic (ce qu'il prétend mesurer) et non un stock. C'est **une ligne**,
et c'est ce qui débloque le lot E, que la roadmap désigne comme l'attente réelle.

---

## 6. Objection sérieuse — la péremption du point 6 ajoute deux seuils qui ne concernent aucune ligne, par-dessus deux fenêtres qui font déjà le travail

Point 6 : « non revue depuis 30 jours → sort du marché, des stats vendeur et des
alertes… 90 jours → une revisite fiche pour trancher, une seule fois ».

Mesuré sur les 106 203 annonces lbc vivantes :

- au-delà de 30 jours de silence : **0**
- au-delà de 90 jours : **0**
- silence maximal : **19 j 20 h**
- début du corpus (`min(first_seen)`) : **2026-09-06**

Les deux seuils ne concernent **aucune ligne** et ne pourront pas être calibrés avant
novembre au plus tôt. Ils portent le compte de constantes temporelles de 7 à 9, et le
« une seule fois » à 90 jours exige une colonne de persistance de plus.

Et pour les deux endroits qui comptent, le travail est **déjà fait par des fenêtres
plus serrées** :

- les alertes : `alert_rules.SEEN_WINDOW = 48 h` (`alert_rules.py:27`, appliqué en
  `alert_rules.py:53-56`) **exclut déjà 74 586 des 106 203 annonces** (70 %) ;
- la couverture : `coverage.FRESH = 24 h` (`coverage.py:24`) ne compte comme fraîches
  que **19 620 annonces** (18 %).

Un seuil à 30 jours par-dessus un seuil à 48 h est strictement dominé : il ne retirera
jamais une ligne que les 48 h n'ont pas déjà retirée.

**Alternative.** Ne rien ajouter pour le marché et les alertes (déjà couvert).
Si l'intention est l'affichage — l'état « non vérifiée depuis N jours » —, c'est un
libellé calculé dans `market_items.item_of` à partir de `last_seen`, qui est déjà dans
le `select` de `market_query.core` (`market_query.py:90`). **Zéro colonne, zéro
constante, zéro migration.**

---

## 7. Objection sérieuse — « l'ouvre-page qui ne décide rien » décrit l'existant, et les deux décisions qui restent ne sont pas déplaçables

Point 3 : « Le serveur compose, l'ouvre-page consomme… La session cowork ne décide
rien. »

**La règle existe déjà, mot pour mot, deux fois :**
`RUNBOOK-revisites.md:28` et `RUNBOOK-balayage.md:14`, toutes deux :
« **Cette session ouvre des URL. Elle ne conclut rien.** »

Ce que la session décide **encore**, et qui ne peut pas passer côté serveur :

1. `N = max(data-pages, ceil(total / 35))` plafonné à 20 (`RUNBOOK-balayage.md:96-99`).
   `total` se lit dans `__NEXT_DATA__` de la page : **le serveur ne l'a pas.** Son
   propre compte est systématiquement bas — mesuré au premier run, 669 lues contre
   101 puis 187 attendues (`RUNBOOK-balayage.md:93-95`). Un serveur qui ne visite pas
   ne peut pas composer ce nombre ; c'est précisément la raison d'être du runbook
   (« Traduction, non vérifiée », `RUNBOOK-balayage.md:30-39`).
2. `limit = min(100, (secondes restantes - 90) / 8)` (`RUNBOOK-revisites.md:108-110`) :
   dépend du budget horloge de la session, que le serveur ne connaît pas.

Et le reste **est déjà paramétré côté serveur** : `?limit=` et `?pages=` sont lus par
`revisits-page.js:12` (`parseLimit`) et `balayage-page.js:11` (`parsePages`). Le point 3
est donc à moitié livré, et l'autre moitié est impossible par construction.

**Gain mesuré de « une seule page `/app/file.html` » :** les deux pages sont déjà
structurellement identiques (`peindre`/`vueBouton`/`vueFile`/`demanderFile`,
94 et 86 lignes). Les fusionner économise **~85 lignes de JavaScript** et laisse en
place la seule différence qui compte, écrite en commentaire des deux côtés :
`balayage-page.js:5-6` « `GET`, rien n'est consommé : pas de file à garder en
`sessionStorage`… contrairement à `revisits-page.js` ». Une page unique doit porter
les deux sémantiques de consommation dans une condition — la complexité ne disparaît
pas, elle devient un `if`.

---

## 8. Objection sérieuse — la thèse fusionne les deux files les moins semblables et garde séparées les deux plus semblables

C'est l'objection de structure, et elle donne l'alternative à 80 %.

**Les deux files que la thèse garde séparées** (point 7 : découverte à part) sont
celles qui se ressemblent le plus :

| | crawl par tranches (`RUNBOOK.md`) | balayage par recherche (`RUNBOOK-balayage.md`) |
|---|---|---|
| moyen | page de résultats | page de résultats |
| healthcheck | compte de badges `[class*="adscope-"]` page 1 (`RUNBOOK.md:130-133`) | **le même** (`RUNBOOK-balayage.md:52-56`) |
| consomme | non (`shards.json` réécrit, mais dérivable de `last_seen` par tranche) | non (`sweep.py:8-11`) |
| journal | `crawler/logs/YYYY-MM.log` | **le même fichier, même format** |
| lots de navigation | 8 pages max (`RUNBOOK.md:40`) | **la même contrainte** (`RUNBOOK-balayage.md:99-102`) |
| URL | `price={min}-{max}&owner_type=…&sort=price&order=asc` | `price={min}-{max}&owner_type=…&sort=price&order=asc` + `u_car_brand/u_car_model` |

Les deux ouvrent la **même forme d'URL**, avec le même tri, la même pagination, le
même témoin, le même journal. `sweep_split.cut` (`sweep_split.py:53-83`) reprend même
explicitement « l'ordre de `crawler/RUNBOOK.md` — `owner_type` en premier axe, la
tranche de prix ensuite » (`sweep_split.py:1-7`). **Ce sont deux instances du même
mécanisme paramétré différemment.**

**La file que la thèse fusionne** est la seule qui diffère sur les trois axes qui
comptent :

- elle **consomme** un bail de 7 jours (`revisit.SPACING`, `revisit.py:62-67`) ;
- son healthcheck est **inversé** : une fiche sans badge est légitime, et confondre
  les deux ferait passer une extension éteinte pour un site plein d'annonces
  disparues (`RUNBOOK-revisites.md:52-59`) — le runbook a dû écrire une règle
  spéciale après quatre runs arrêtés à tort et ~380 fiches gelées pour rien
  (`RUNBOOK-balayage.md:187-192`) ;
- c'est **le seul moyen qui réponde sur l'absence** — la thèse le concède elle-même
  au point 2.

**Alternative — la plus petite modification qui obtient 80 % du bénéfice.**
Fusionner **le crawl par tranches et le balayage par recherche**, pas la revisite :

1. Une route `GET /v1/pages` qui rend des URL de résultats ordonnées par ancienneté
   du périmètre, où un « périmètre » est soit une tranche de prix, soit une
   recherche traduite. Le code existe en entier : `sweep_url.translate` compose,
   `sweep_split.cut` découpe déjà selon l'ordre du crawl, `coverage.coverage_of`
   ordonne, `sweep._budget` plafonne.
2. `shards.json` disparaît réellement : une tranche de prix est un `MarketParams`
   comme un autre, sa fraîcheur se lit sur `last_seen` comme celle d'une recherche
   (`coverage.py:37-44`) — le fichier d'état, son `resume`, ses 51 `last_crawled`
   nuls et son `.bak` s'en vont. **C'est le seul retrait d'état durable de tout
   l'exercice, et la thèse ne le fait pas.**
3. Un runbook de moins pour de vrai : `RUNBOOK.md` et `RUNBOOK-balayage.md` partagent
   déjà témoin, journal, lots de 8 et règle navigateur. `RUNBOOK-revisites.md` reste,
   parce que son healthcheck et son bail ne se mélangent pas.

Bénéfice : une route, une page, un runbook, un fichier d'état en moins — sans date due,
sans prédicat d'appartenance, sans nouvelle colonne, sans amortisation par famille.

---

## 9. Ce qui tient, après examen

Trois choses, à garder si la refonte est écartée.

1. **La date due subsume le bail, et c'est plus propre.** `revisit.SPACING` porte
   aujourd'hui trois rôles dans un seul nombre, assumés en commentaire
   (`revisit.py:62-67` : bail, espacement de deux mesures, frein anti-bot). Une
   échéance repoussée par toute observation dit la même chose plus honnêtement, et
   elle supprime le mode de panne le plus coûteux du runbook actuel : « une tranche
   demandée puis abandonnée est perdue pour une semaine »
   (`RUNBOOK-revisites.md:123`), qui a gelé ~380 fiches pour rien entre le 09-20 et
   le 09-22. **Point retenu — mais il s'obtient en remplaçant `next_detail_crawl`
   par une échéance, sans toucher aux files.**
2. **« Toute observation repousse l'échéance » est déjà vrai et déjà écrit.**
   `revisit.py:9-14` : `QUIET` porte sur `last_seen`, donc une page de résultats
   repousse la revisite « sans que rien n'ait à l'écrire ». Cette moitié du point 1
   est livrée — ce qui est une raison de plus de ne pas refondre pour l'obtenir.
3. **La division du travail du point 2 est la bonne** : la fiche ne sert qu'à ce
   qu'une carte ne dit pas, l'absence. C'est déjà la doctrine
   (`RUNBOOK-balayage.md:9-10`, `revisit.py:1-7`). La thèse a raison de la nommer ;
   elle a tort de l'accompagner d'un « moyen par défaut » que § 2 mesure à 2,3
   annonces dues par ouverture.

---

## Verdict, en trois lignes

**La thèse ne simplifie pas : elle retire ~115 lignes et une route, et ajoute un
prédicat d'appartenance mesuré à 80 137 buffers par recherche, deux constantes
temporelles qui ne concernent aucune ligne, une colonne, et une amortisation
page-contre-fiche qui rend 2,3 annonces dues par ouverture à l'équilibre au lieu
des 35 annoncées.**

**Son chiffrage est faux d'un ordre de grandeur dans les deux sens — 100 pages/jour
contre 860 à 1 348 mesurées, 400 fiches par run contre 120 à 160, 71 600 annonces
contre 106 254 — et ses deux paliers fins sont inatteignables : le palier « quelques
heures » pèse 31 % du corpus et mangerait 82 % de la capacité de pages pour un seul
passage par jour.**

**Surtout, elle ne touche aucun des deux blocages réels, tous deux corrigeables en
une ligne : le crawl tourne sous une licence `automated = false`, ce qui fait que
`divergences` porte 0 ligne et 43 `rechecks` sont figés ; et le garde-fou de flotte est
à 62,1 % contre un seuil de 33,3 %, donc en interblocage, avec 1 213 absences dépassées
et 51 disparitions écrites seulement. À faire d'abord : ces deux lignes, puis une
condition dans `revisit._rank` pour sortir `TrackedFamily` du rang 1, puis fusionner
le crawl et le balayage — les deux files qui se ressemblent — et laisser la revisite
tranquille.**
