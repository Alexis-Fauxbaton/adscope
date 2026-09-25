# Challenge produit et marchand — la refonte de l'acquisition

Contradicteur, 2026-09-25. Angle : le marchand payant et le CEO. Base `adscope` lue en lecture
seule stricte, code en lecture seule, aucune requête vers leboncoin, La Centrale ou l'API réelle.
Thèse challengée : `scratchpad/acquisition-these.md`.

**Verdict en trois lignes.**
La refonte est bien raisonnée mais elle répare le tri d'une file dont, au moment où j'écris, aucune
observation n'est plus acceptée : depuis le redémarrage de l'API à 20:52:21 aujourd'hui, 100 % des
relevés du robot sont refusés par le quota du lot Corpus, aucune disparition n'a été écrite depuis
le 2026-09-22, et la file resert en boucle les mêmes 43 fiches.
Deux à trois jours de refonte maintenant achèteraient un meilleur ordre de passage sur une chaîne
arrêtée en quatre endroits mesurés — dont aucun n'est un problème d'ordre de passage.
Avant les cinq marchands : ~1,5 jour de déblocage, listé en fin de rapport. La file unique, la
péremption et les quatre états attendent le journal des cinq marchands, qui seul dira quelles
fiches ils ouvrent.

---

## Ce que la base dit aujourd'hui

| Mesure | Valeur | Source |
|---|---|---|
| annonces lbc en base | 106 254 (106 203 en ligne) | `listings` |
| annonces lc | 16 588 | `listings` |
| non revues depuis 30 j | **0** | `listings`, plus vieux `last_seen` = 2026-09-06 |
| non revues depuis 10 j | 43 001 lbc (40,5 %) | `listings` |
| en ligne alertables (`last_seen` < 48 h) | 38 681 / 122 791 = **31,5 %** | `alert_rules.py:27` |
| disparitions écrites, au total | 51, dernière le **2026-09-22** | `listings.disappeared_at` |
| absences en attente de confirmation | **1 292**, la plus vieille du 2026-09-19 | `listings.absent_since` |
| `divergences` / `alerts_sent` / `digests` / `mails` | **0 / 0 / 0 / 0** | tables |
| relevés sous une licence `automated` | **0** sur 163 486 | `price_points` × `licenses` |
| dernier relevé accepté | **2026-09-25 20:52:15**, six secondes avant le redémarrage | `price_points` |

La thèse part de « 71 600 annonces dont 45 000 non revues depuis le 6 sept ». La base en porte
106 254 côté lbc. Tous les chiffrages de la thèse sont bâtis sur un corpus 48 % plus petit que le
vrai.

---

## Objection 1 — bloquante. La chaîne de disparition est en spirale d'arrêt, et la refonte l'aggrave

`~/Library/Logs/adscope-api.log` porte **959** lignes « écriture suspendue ». Le garde-fou de flotte
(`disappearance.py:63-64`, `GUARD_MIN = 30`, `GUARD_SHARE = 1/3`) mesure en ce moment
**509 disparitions pour 819 revisites abouties, soit 62,1 %** — presque le double du seuil. Toute
seconde constatation concordante rend `held` et n'écrit rien.

Ce n'est pas un pic passager, c'est un verrou qui se resserre. Les valeurs successives lues dans le
log : `95/95`, `123/218`, `249/440`, `258/453`, `372/627`, `407/679`, `441/1061`, `466/868`,
`544/892`. Le numérateur passe de 95 à 544 sans jamais redescendre sous le tiers. La cause est
l'asymétrie que `disappearance.fleet` assume explicitement dans sa docstring : le numérateur
(`absent_since IS NOT NULL`) n'est **pas** borné par la fenêtre, le dénominateur (`last_seen >=
now-24h`) l'est. Or la seule chose qui efface `absent_since` est une observation vivante — soit
exactement ce que le quota refuse depuis 20:52 (objection 3). Donc : l'écriture est suspendue → les
absences s'accumulent (1 292) → le ratio monte → l'écriture est suspendue plus fort. Le garde-fou
mesure désormais son propre arriéré.

**Et la refonte pousse dans le mauvais sens.** Point 1 de la thèse : trier par retard sur la
fraîcheur due. Le retard est précisément la variable qui corrèle avec « réellement partie ». Plus la
file est bien triée par retard, plus la population servie est biaisée vers les disparues, plus
`gone/settled` monte, plus le garde-fou tient. La thèse optimise l'entrée d'un entonnoir dont la
sortie se ferme quand l'entrée s'améliore.

**Alternative (0,5 j)** : borner le numérateur à la même fenêtre que le dénominateur
(`absent_since >= now - GUARD_WINDOW`), ce qui rend au garde-fou son sens — un *pic* — au lieu d'un
arriéré ; puis purger les 1 292 absences périmées. À faire avant toute refonte de file, sinon la
refonte est invisible pour le marchand.

## Objection 2 — bloquante. La file resert les mêmes fiches en boucle, et l'opérateur l'a constaté

`rechecks` porte **43 lignes, 43 fiches distinctes, toutes `field = 'absence'`**, toutes sous la
licence `alexis` (`automated = false`, hash `73cc90bd`).

`recheck.clear` n'a que deux appelants : `divergence._verify` (`divergence.py:127`) et
`divergence.on_absence` (`divergence.py:141`). Les deux sont gardés par `license_.automated`
(`divergence.py:27`, `disappearance.py:141`). Or **aucun relevé n'a jamais été écrit sous une
licence `automated`** : 155 090 des 163 486 `price_points` (94,9 %) portent le hash de `alexis`, les
8 396 autres (5,1 %) un hash nul. La licence `crawler` (`automated = true`) n'a produit aucune
ligne.

Conclusion mécanique : **aucun marqueur ne peut jamais être levé**. Et `revisit._rank`
(`revisit.py:102`) les place au rang 0, en passant outre `QUIET` *et* le bail de sept jours
(`revisit.py:126-128`). Ces 43 fiches tiennent donc la tête de la file, définitivement.

Le symptôme est déjà au journal, écrit par la session cowork elle-même, run du
2026-09-25T20:00:07 :

> OBSERVATION: les 25 URL servies en tranche 2 sont exactement des identifiants deja servis en
> tranche 1 du meme run et qui y etaient a 0 panneau

Sous la refonte, ces fiches deviennent « fraîcheur due à quelques heures » dans une file **unique** :
elles ne monopoliseront plus une file sur trois, mais la seule. La thèse supprime le cloisonnement
qui limite aujourd'hui les dégâts à la file de revisite.

**Alternative (0,5 j)** : une licence `automated` dédiée au crawl (voir objection 3) lève les 43
marqueurs et referme la boucle. Coût nul côté refonte.

## Objection 3 — bloquante. Depuis 20:52 aujourd'hui, le robot n'écrit plus rien sauf des absences

`require_operator` sert les files de machine. Quand l'appelant est le cookie de l'opérateur — le cas
de tous les runbooks depuis le 2026-09-18, qui interdisent `curl` avec une clé — la fonction rend
`of_account(session, row.account_id, now)` (`operator.py:55`) : **la licence du compte, non
automated**. Le robot crawle donc sous une clé de marchand, et hérite de tout ce qui protège contre
les marchands.

Chiffres :

- `quota.guard` (`main.py:68`) lit `usage_days` et refuse au-delà de `observations_per_day()` =
  **2 000** par défaut (`config.py:92`). `ADSCOPE_OBSERVATIONS_PER_DAY` **est absent** de
  `~/Library/LaunchAgents/fr.adscope.api.plist`.
- `usage_days` pour la licence `alexis` : **18 211** observations le 2026-09-25, **23 508** le 09-24.
  Soit 9 à 12 fois le quota.
- L'API a redémarré à **20:52:21** (`ps`, PID 56610). Le dernier `price_point` accepté date de
  **20:52:15**. Depuis : **0 relevé**.
- Mais 43 absences ont bien été écrites entre **21:52:22 et 21:59:27**, parce que
  `POST /v1/disappearances` (`main.py:140`) n'appelle **pas** `quota.guard`.

Donc en ce moment même le crawl tourne, ses relevés de prix et de fraîcheur sont tous rejetés, et
seules ses constatations d'absence passent — pour aller alimenter la boucle de l'objection 2 et
l'arriéré de l'objection 1. C'est un arrêt de production de quatre heures que rien ne signale :
uvicorn tourne en `--log-level warning`, un 429 ne s'écrit nulle part.

**Alternative (0,5 j)** : frapper une licence `automated` dédiée (`mint_license.py --automated`) et
la faire porter par `/app/revisites.html` et la page de balayage. Un seul geste répare les
objections 1, 2, 3 et 8 — et c'est le contraire d'une refonte, c'est une ligne de configuration.
Poser `ADSCOPE_OBSERVATIONS_PER_DAY` dans le plist est un pansement, pas le correctif : il laisserait
le robot jugé comme un marchand par `divergence.py`.

## Objection 4 — sérieuse. La péremption ne change rien aujourd'hui ; ce qui cache le marché est déjà là, à 48 h

Point 6 de la thèse : à 30 jours, une annonce sort du marché, des stats vendeur et des alertes.
Mesure : **0 annonce** n'atteint 30 jours. Le plus vieux `last_seen` de la base est du 2026-09-06, le
pire retard est de 19-20 jours. Le seuil des 30 jours ne mordra pas avant le 2026-10-06, celui des
90 jours pas avant décembre. Développé maintenant, c'est du code qu'on ne peut ni voir agir ni
régler.

Pendant ce temps, le seuil qui décide vraiment de ce que le marchand reçoit est déjà écrit et n'est
affiché nulle part : `alert_rules.SEEN_WINDOW = timedelta(hours=48)` (`alert_rules.py:27`, appliqué
en `:54`). Ce que ça donne dans le marché des familles suivies :

| Famille suivie | annonces | alertables (< 48 h) | en retard de 10 j |
|---|---|---|---|
| Renault Clio | 13 866 | 3 960 — **29 %** | 5 088 |
| Peugeot 207 | 3 731 | 1 380 — 37 % | 1 060 |
| Peugeot 206 | 3 624 | 869 — 24 % | 1 592 |
| Peugeot 307 | 1 859 | 350 — 19 % | 932 |
| **Porsche 911** | 1 102 | **0 — 0 %** | 274 |

Un marchand qui suit la Porsche 911 ne recevra **jamais** une alerte, sur 1 102 annonces, sans une
ligne d'explication. Sur les douze plus grosses familles de la base, la part alertable va de 23 % à
44 %. C'est-à-dire : deux tiers du marché sont muets, silencieusement.

L'état à construire n'est donc pas « non vérifiée depuis 30 jours », c'est « non vérifiée depuis
48 h, donc hors alerte », et il doit être **visible** — sur la fiche, dans le marché, et en tête du
digest. C'est une demi-journée, et pour le marchand payant ça vaut plus que tout le reste de la
refonte : il saura ce qu'adscope sait et ce qu'il ne sait pas, ce qui est exactement ce qu'on lui
vend.

## Objection 5 — sérieuse. Le chiffrage du point 8 est faux dans les deux sens, et la due date à 10 jours est inatteignable

Débit réel de fraîcheur sur le **stock existant** (relevés joints à `first_seen`, pour séparer
découverte et revue) :

| jour | re-vues du stock | nouvelles |
|---|---|---|
| 2026-09-22 | 7 283 | 14 955 |
| 2026-09-24 | 4 130 | 15 736 |
| 2026-09-25 | 4 288 | 10 884 |

Soit **~4 300 re-vues par jour**, 7 283 au meilleur jour. Honorer « dix jours pour le reste » sur
106 203 annonces lbc en ligne demande **10 620 re-vues par jour** : 2,5 fois le meilleur jour jamais
mesuré. Le tour du corpus par pages prend **106 203 / 4 288 ≈ 24,8 jours**, pas « ~15 ».

Dans l'autre sens, le canal fiche est **surestimé de 3×**. `crawler/logs/2026-09.log` cumule **4 663
fiches ouvertes en 48 runs** sur tout le mois. Le meilleur jour, aujourd'hui, fait 530 fiches en 4
runs (130 + 155 + 120 + 125). Et la session a mesuré son propre rythme au run de 16:58 : « pace
reellement mesure sur ce run ~9,5 s/fiche (100 fiches en 930 s) ». Les « 3 000 fiches/jour » de la
thèse valent donc **7 h 55 de Chrome ininterrompu**, contre un budget de 30 minutes par run.

C'est une objection produit, pas une querelle de chiffres : une due date annoncée que le crawl ne
peut pas tenir transforme chaque fiche en « non vérifiée depuis N jours ». La thèse promet un badge
qu'elle garantit d'allumer partout.

**Alternative (gratuite)** : calibrer la due date sur le débit mesuré — 10 jours seulement dans les
recherches enregistrées et les familles suivies, 25 à 30 jours ailleurs — et afficher le chiffre.

## Objection 6 — sérieuse. Ce qui a créé les annonces les plus rances n'est pas l'ordre de la file, c'est l'absence de repasse côté découverte

`crawler/shards.json` : **89 shards, 38 avec un `last_crawled`, les 89 en `status: ready`**. Huit
portent encore `last_crawled: 2026-09-06` et n'ont pas été repassés depuis 19 jours
(`lbc-c2-0-500-private`, `lbc-c2-500-800-private`, `lbc-c2-800-1000-private`,
`lbc-c2-1000-1200-private`, `lbc-c2-1300-1500-private`, `lbc-c2-60000-max-private`,
`lbc-c2-0-1000-pro`, `lbc-c2-1000-2000-pro`).

Mesure correspondante : **21 320 annonces en ligne** se trouvent dans le seau de retard 19-20 jours,
et 15 774 de plus dans celui de 18-19 jours. C'est la taille d'une passe unique jamais rejouée, pas
le résultat d'un mauvais tri.

Le point 7 de la thèse garde « un plan de shards avec sa progression » sans ajouter ce qui manque :
une date de fraîcheur due **sur le shard lui-même**. C'est un champ dans `shards.json` et un tri dans
le runbook — un quart de journée, pris sur rien.

## Objection 7 — mineure. La performance n'est pas un argument, et il ne faut pas s'en servir

Mesuré sur la base réelle (`EXPLAIN ANALYZE`) :

- La requête de la thèse — une file unique triée par retard sur la fraîcheur due, sur les 122 791
  annonces en ligne — coûte **74,7 ms** (Seq Scan + top-N heapsort ; il n'y a **pas** d'index sur
  `last_seen`).
- La requête existante `revisit.due` coûte **50,6 ms**.
- `sweep_split._count`, le COUNT que la récursion appelle jusqu'à 15 fois par recherche, coûte
  **1,2 ms** avec marque + modèle : Postgres élague bien les quatre jointures de prix, comme
  `market_query.py` l'affirme. À 50 marchands × 10 recherches × 15 counts, `/v1/sweep` coûterait
  ~1,8 s, huit fois par jour.

Rien ne casse à 5 marchands, rien ne casse à 50. La refonte ne peut donc se défendre que sur la
fraîcheur perçue — et sur cet axe, les objections 1 à 6 disent que le facteur limitant est ailleurs.
Le coût d'attendre, côté architecture, est nul.

## Objection 8 — mineure. Ce que la thèse veut « garder » n'a jamais produit une ligne, et ne peut pas

`divergences` : **0 ligne**. `alerts_sent`, `digests`, `mails` : **0** chacun. La page opérateur
`/app/ecarts.html` a été livrée aujourd'hui (754c3de) au-dessus d'une table vide que l'objection 2
rend structurellement inatteignable. La thèse la range dans « ce qu'on garde : tout le code de
constatation » — on garde un décor.

Pire, l'interrupteur de réserve. `alerts_confirmed_only` (`config.py:99`, exposé par
`ADSCOPE_ALERTS_CONFIRMED_ONLY`) exige `License.automated IS TRUE OR license_key_hash IS NULL`
(`alert_rules.py:99`). Activé aujourd'hui, il ne retiendrait que les 5,1 % de relevés à hash nul :
les alertes deviendraient quasi muettes. La roadmap le présente comme la parade « au premier écart
suspect » — c'est une arme chargée qui coupe le produit.

---

## Ce qui tient, après examen

- **Point 2 (la page de résultats comme moyen par défaut).** Confirmé par la mesure, et nettement :
  le canal pages a rendu 4 288 re-vues + 10 884 nouvelles le 09-25, le canal fiches ~530 ouvertures.
  Le rapport de 30× est réel. `sweep_url.translate` est solide et coûte 1,2 ms. Réserver la fiche à
  ce qu'une carte ne dit pas est le bon arbitrage, et il ne demande aucune refonte : c'est déjà le
  cas de fait.
- **Point 4 (deux comptes distincts pour confirmer, une source seule → « probable », réversible).**
  Juste, et c'est la seule sortie propre à l'arriéré de 1 292 absences : aujourd'hui le tout-ou-rien
  du garde-fou fait qu'on n'écrit *rien*, donc le marchand ne voit rien. Un état « probable »
  réversible aurait laissé passer l'information sans risquer la fausse date. À garder, et à faire
  après le déblocage.
- **Point 3 (un seul runbook), en partie seulement.** Le coût mesuré des trois runbooks est de
  **3 écarts au protocole journalisés sur 250 runs** (1,2 %), contre 49 déconnexions d'extension et
  56 timeouts `browser_batch` sur la même période. Le désordre du mois ne vient pas du nombre de
  runbooks, il vient du pilotage navigateur. Consolider est légitime, mais ce n'est pas ce qui
  rendra les runs fiables, et ça ne justifie pas seul deux à trois jours.

---

## L'ordre que je propose

**Avant les cinq marchands — ~1,5 jour, et ce n'est pas la refonte.**

1. *(0,5 j)* Une licence `automated` dédiée au crawl, portée par `/app/revisites.html` et la page de
   balayage. Répare les objections 2, 3 et 8 d'un seul geste : lève les 43 marqueurs, sort le robot
   du quota et du journal des écarts, rend le journal des écarts utilisable pour de vrais marchands.
2. *(0,5 j)* Borner le numérateur du garde-fou de flotte à `GUARD_WINDOW`, comme le dénominateur ;
   purger les 1 292 absences périmées. Sans ça, aucune disparition n'arrivera au marchand, quel que
   soit l'ordre de la file.
3. *(0,5 j)* Afficher « non vérifiée depuis 48 h → hors alerte » sur la fiche, dans le marché et en
   tête du digest. C'est la mesure qui fait le plus pour le marchand payant : 31,5 % du marché est
   alertable, 0 % pour la Porsche 911, et il ne le sait pas.
4. *(0,25 j)* Une date de fraîcheur due sur le shard, dans `shards.json`, pour que les 8 shards du
   2026-09-06 repassent.
5. *(0 j)* Recalibrer les due dates annoncées sur le débit mesuré (4 300 re-vues/jour), et ne pas
   promettre 10 jours hors périmètre suivi.

**Après un chiffre — la refonte.**
La file unique, la péremption 30/90 j, les quatre états, le runbook unique. À reprendre quand les
cinq marchands auront quatorze jours de journal, parce que le tri d'une file ne se mesure que sur les
fiches qu'on ouvre *et* qui sont lues, et que ce signal n'existe pas encore : `usage_days` ne porte
que la licence d'Alexis, `follows` en compte 5 et `saved_searches` **1**. Décider aujourd'hui de la
hiérarchie « quelques heures / un jour / dix jours » avec une recherche enregistrée en base, c'est
régler un tri sur un échantillon de un.

Et l'objection 7 donne le vrai coût d'attendre côté technique : 74,7 ms contre 50,6 ms. Rien ne
casse à 5 marchands, rien ne casse à 50. Ce qui casse, c'est ce qui casse déjà.
