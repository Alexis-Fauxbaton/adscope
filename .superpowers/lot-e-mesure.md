# Lot E — Détection de republication (mesure, pas de code)

Mesure en lecture seule stricte sur la base Postgres locale `adscope` (URL lue dans
`api/adscope_api/config.py`, non reproduite ici). Chaque session `psql` a démarré par
`SET default_transaction_read_only = on;`. Aucune annonce visitée, aucune requête
authentifiée, aucune donnée personnelle de particulier reproduite ci-dessous — pour un
vendeur pro, seul l'identifiant est cité, jamais sa raison commerciale.

Champs relus dans `api/adscope_api/models.py`, `publication.py`, `disappearance.py`,
`revisit.py` avant de coder les requêtes :
- `published_at` : date exacte de première mise en ligne, déclarée par le site
  (`creationDate`/`firstOnlineDate` La Centrale, `first_publication_date` leboncoin) —
  fait autorité, ne recule ni n'avance à rebours. **Remplie à 100 % aujourd'hui**, sur
  les deux sites.
- `site_published_first` : repli inféré pour les sites qui ne donnent qu'un « il y a N
  jours » — inutilisé aujourd'hui (aucun des deux sites n'émet ce champ), donc
  `published_at` seul porte la date de mise en ligne de B dans toute cette mesure.
- `bumped_at` : republication *déclarée par le site sur la même fiche* (remontée) — un
  mécanisme différent de la question posée ici (nouvel identifiant `site_id`).
- `last_seen` : dernière observation vivante. `disappeared_at` : le site a dit deux
  fois, à ≥ 6 h d'écart (`CONFIRM_DELAY`), que l'annonce n'est plus là — porte la date
  de la *première* des deux constatations ; irréversible. `absent_since` : la première
  constatation seule, réversible tant que la seconde ne confirme pas.
- `fingerprint` : empreinte véhicule seule — écartée d'emblée par le constat antérieur
  (80 % des paires de même empreinte coexistent).
- `seller_id` : renseigné seulement pour un vendeur professionnel (le particulier reste
  vide, pas anonymisé).
- `canon_brand`/`canon_model` : forme canonique dérivée de marque/modèle/version.

## a. État du gisement

| | lbc | lc | total |
|---|---:|---:|---:|
| Annonces | 54 871 | 6 595 | 61 466 |
| `disappeared_at` non nul (disparition confirmée) | 11 | 0 | 11 |
| `absent_since` non nul, `disappeared_at` nul (en attente) | 96 | 0 | 96 |
| Signal d'absence (l'un ou l'autre) | 107 | 0 | 107 |

Le crawl couvre `first_seen` du 2026‑09‑06 au 2026‑09‑20 (14 jours), mais par à-coups :
29 680 + 13 753 + 3 115 annonces lbc arrivées les 6–8/09, un creux, puis 5 049 + 1 623
les 18–19/09 ; La Centrale n'arrive en volume que les 19–20/09 (1 304 + 5 267). La
fenêtre de silence avant revisite (`QUIET` = 3 j) et l'espacement entre deux ouvertures
(`SPACING` = 7 j) n'ont donc eu le temps de jouer qu'une fois.

**Rythme par jour : il n'y en a pas encore un à mesurer.** Les 107 signaux d'absence
(les 11 confirmées comme les 96 en attente) portent tous la **même date, 2026‑09‑19**,
en une seule salve — c'est le premier passage de revisite qui a atteint son échéance,
pas un régime établi. Impossible d'en tirer un débit quotidien fiable ; il faudra
plusieurs jours de revisites étalées pour ça.

Par type de vendeur, sur les 107 : 27 pro (4 confirmées + 23 en attente), 80 particulier
(7 confirmées + 73 en attente).

**Trou de donnée qui verrouille tout le reste : sur les 107 candidates « A » (les 11
confirmées et les 96 en attente), `department` est nul à 100 %** — alors qu'il est
rempli à 24 % sur l'ensemble de la base (14 628 / 61 466). Ces 107 fiches n'ont qu'une
observation (moyenne 1,02 à 1,78) : elles viennent du balayage de liste, jamais d'une
fiche détail où le département se lirait. Le critère 3 de la règle, tel qu'écrit,
élimine donc mécaniquement toutes les candidates actuelles — pas parce que la règle
est mauvaise, mais parce que le gisement ne lui donne rien à mordre pour l'instant.

## b. Entonnoir — variante confirmée (A : `disappeared_at` non nul, 11 candidates)

Paires (A, B) : même site, `site_id` différent, B parmi les 54 871 annonces lbc.

| Étape | Ce qu'elle ajoute | Paires restantes |
|---|---|---:|
| — | Total des paires possibles (11 × ~54 870) | 603 570 |
| 1 | marque/modèle/année canon + carburant/boîte égaux quand renseignés | 775 |
| 2 | + kilométrage de B dans [A ; A+3000] | 12 |
| 3 | + même département (non nul) | **0** |
| 4 | + règle vendeur (pro↔pro même `seller_id`, pro↔particulier exclu) | 0 |
| 5 | + succession temporelle (mise en ligne de B dans [last_seen−2j ; disappeared_at+30j]) | 0 |
| 6 | + unicité (A a une seule B, B a une seule A) | **0** |

Le kilométrage (étape 2) fait l'essentiel du travail : 775 → 12. Le département
(étape 3) achève tout, faute de donnée.

*Pour situer ce que les critères 4 et 5 auraient fait s'ils avaient reçu des
candidates : en suspendant seulement le département (hors règle, à titre de
diagnostic), les 12 paires de l'étape 2 tombent à 3 après le vendeur puis à 1 seule
après la succession temporelle — signe que 4 et 5 sont sélectifs et fonctionnent, ce
n'est que le département qui manque.*

## c. Entonnoir — variante « en attente » (A : `absent_since` non nul, `disappeared_at` nul, 96 candidates)

Même construction ; borne haute de la succession remplacée par
`A.absent_since + 30 jours` (`A.disappeared_at` n'existe pas encore).

| Étape | Paires restantes |
|---|---:|
| Total | 5 267 520 |
| 1. marque/modèle/année/carburant/boîte | 2 287 |
| 2. + kilométrage | 81 |
| 3. + département | **0** |
| 4. + vendeur | 0 |
| 5. + succession | 0 |
| 6. + unicité | **0** |

Même verdict que b : le département est le seul verrou, et il est total.

## d. Taux de collision (précision des critères 1–4 + unicité)

Population : les 61 455 annonces sans `disappeared_at` (non disparues). Paires
(X, Y) même site, même marque/modèle/année, fenêtres `first_seen`–`last_seen` qui se
chevauchent (donc en ligne en même temps → par construction deux véhicules
différents), auxquelles on applique les critères 1 à 4 (carburant/boîte, kilométrage
±3000, département non nul égal, règle vendeur) puis l'unicité du critère 6.

- 104 paires brutes passent 1–4 ; 183 annonces distinctes y figurent.
- Après unicité (6) : **79 paires, 158 annonces impliquées** — l'unicité écarte à elle
  seule 25 annonces ambiguës (bon signe : c'est exactement ce qu'elle doit faire).
- **Taux global : 158 / 61 455 = 0,26 %**, soit environ 26 annonces à tort appariées
  pour 10 000.

Ventilation (sur les 158 annonces impliquées) :

| Segment | Impliquées | Population | Taux |
|---|---:|---:|---:|
| Kilométrage **rond** (multiple de 1000) | 124 | 41 358 | 0,30 % (30 / 10 000) |
| Kilométrage non rond | 34 | 20 094 | 0,17 % (17 / 10 000) |
| **Particulier** | 158 | 47 343 | 0,33 % (33 / 10 000) |
| **Professionnel** | 0 | 14 112 | 0 % |
| Particulier + km rond | 124 | 34 744 | 0,36 % (36 / 10 000) |
| Particulier + km non rond | 34 | 12 596 | 0,27 % (27 / 10 000) |

Deux faits nets :
- **Zéro collision côté pro** : le couplage pro↔pro par `seller_id` identique est un
  verrou fort, et pro↔particulier est exclu par construction — le segment pro est déjà
  sûr avec les seuls critères 1–4.
- Le risque est **entièrement côté particulier**, et légèrement plus élevé à
  kilométrage rond (0,36 %) qu'à kilométrage non rond (0,27 %) — le signal
  « kilométrage rond » du constat antérieur se confirme dans le sens attendu, mais
  l'écart est modeste (×1,3), pas le facteur dominant qu'on aurait pu craindre. À ce
  volume, les critères 1–4 + unicité suffisent déjà à tenir le taux de faux positifs
  sous 0,4 % même sur le segment le plus fragile ; rien dans cette mesure n'impose une
  empreinte de description dès maintenant.

## e. Distribution de l'écart (jours) entre la fin de vie de A et la mise en ligne de B

Faute de paires retenues par la règle complète, mesuré sur les candidates qui passent
les critères 1 (marque/modèle/année/carburant/boîte) et 2 (kilométrage) — département,
vendeur et succession laissés de côté exprès, pour juger le seuil sur une base plus
large (93 paires, confirmées + en attente cumulées). Écart = mise en ligne de B − `last_seen`
de A, en jours :

| Écart vs `last_seen` de A | Paires |
|---|---:|
| < −30 j (B déjà en ligne bien avant que A ne disparaisse) | 39 |
| −30 à −8 j | 30 |
| −7 à −1 j | 15 |
| 0 à +7 j | 7 |
| +8 à +30 j | 2 |
| > +30 j | 0 |

Sur ces 93 paires « même marque/modèle/année/km proche », **69 sur 93 (74 %) ont B déjà
en ligne plus d'une semaine avant que A ne disparaisse** — donc coexistantes, donc very
probablement deux véhicules distincts, pas une succession. Seules 24 paires (26 %) sont
dans une fenêtre compatible avec une republication ([−7j ; +30j]). Sur les 93, en
appliquant strictement les deux bornes de la règle (`≥ last_seen−2j` et
`≤ disappeared_at/absent_since+30j`), 17 survivent — c'est l'ordre de grandeur de ce
que la succession seule retiendrait si le département ne bloquait pas tout.

Rien dans cette distribution ne contredit le seuil de 30 jours : aucune paire
plausible ne dépasse +30 j, et la coupure entre « coexistantes » et « dans la fenêtre »
est nette (rien entre +8 et +30, rien après). Mais l'échantillon (93 paires, dont une
poignée seulement dans la fenêtre) est trop petit pour le régler plus finement que
« pas absurde ».

## f. Échantillon de paires retenues

**La règle complète (critères 1 à 6) retient 0 paire** dans la base actuelle — cf. b et
c : le département, nul à 100 % sur les 107 candidates A, empêche toute retenue. Il n'y
a donc ni 20 paires ni aucune à présenter comme « retenue ».

À titre purement diagnostique (ces paires ne sont **pas** retenues par la règle,
département non vérifiable), les 5 seules paires qui passeraient les critères 1, 2, 4
et 5 si le département était ignoré :

| A `site_id` | B `site_id` | Marque/modèle | Année | Km A→B | Vendeur | `last_seen` A | Mise en ligne B | 1er/dernier prix A | 1er/dernier prix B | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| 3263931110 | 3264024438 | renault clio | 2008 | 137 000→140 000 | particulier/particulier | 06/09 02:08 | 06/09 02:01 | 2 900 € | 1 300 € | **Douteuse** — B en ligne *avant* le dernier `last_seen` de A (coexistence, pas succession) ; prix divisés par 2,2, incompatible avec la même auto revendue |
| 3252691329 | 3262795918 | vw golf | 2018 | 130 000→131 000 | particulier/particulier | 06/09 09:36 | 04/09 16:31 | 15 000 € | 15 000 € | **Douteuse** — B déjà en ligne 2 jours avant A, coexistence directe |
| 3258071053 | 3225973274 | vw golf | 2018 | 99 800→102 000 | particulier/particulier | 06/09 09:35 | 05/09 23:37 | 15 000 € | 15 000 € | **Douteuse** — idem, coexistence |
| 3261203212 | 3263103099 | vw golf | 2021 | 100 000→100 000 | particulier/particulier | 06/09 09:33 | 04/09 22:48 | 15 000 € | 15 000 € | **Douteuse** — kilométrage rond des deux côtés (100 000/100 000), exactement le profil de collision du constat antérieur ; coexistence |
| 3262620650 | 3262684396 | renault clio | 2020 | 78 000→80 100 | particulier/particulier | 06/09 09:32 | 04/09 14:11 | 15 000 € | 15 200 € | **Douteuse** — coexistence |

Les cinq sont rejetées par la règle (département manquant) et, à y regarder, méritent
de l'être pour une seconde raison : dans les cinq, B est déjà en ligne *avant* la
dernière observation vivante de A — ce sont des paires coexistantes, exactement ce que
la mesure d selon d) capture. Aucune republication certaine ni probable dans ce lot ;
aucune ne serait passée le filtre même département disponible, une fois le critère de
succession appliqué correctement (B publié avant que A ne parte n'est pas une
succession).

## g. Conclusion

1. La règle (critères 1–6) est structurellement saine : sur les paires réellement
   coexistantes (donc de faux positifs garantis), elle ne retient que 0,26 % des
   annonces — 0 % côté pro, 0,33 % côté particulier.
2. Mais elle n'a *jamais tiré* aujourd'hui : les 107 candidates A (confirmées + en
   attente) ont toutes `department` nul, alors que ce champ conditionne le critère 3 —
   verrou de donnée, pas défaut de règle.
3. Le gisement est trop jeune pour juger : 11 disparitions confirmées, toutes le même
   jour (2026‑09‑19), sur 14 jours de crawl irrégulier — aucun rythme quotidien à
   mesurer, La Centrale n'a quasi pas encore de recul.
4. Le kilométrage (critère 2) est le filtre le plus puissant : 775 → 12 candidates sur
   la variante confirmée, avant même le département.
5. L'écart temporel (e) valide le seuil de 30 jours sans le contredire : rien entre
   +8 et +30 jours, rien au‑delà ; mais 74 % des paires « même auto plausible » sont en
   réalité coexistantes (B en ligne avant que A ne parte), ce qui justifie de garder le
   critère de succession strict.
6. Priorité n°1 avant toute mise en production : faire remonter `department` (ou son
   dérivé `postal_code`) sur les fiches vues par le balayage de liste, pas seulement
   par la fiche détail — sans ça, la règle ne produira jamais rien.
7. Priorité n°2 : laisser tourner le crawler et les revisites plusieurs semaines, pas
   quelques jours, pour accumuler des `disappeared_at` répartis dans le temps.
8. Rien ne justifie aujourd'hui d'ajouter un signal d'empreinte de description : le
   taux de collision mesuré, même sur le segment à risque (particulier, km rond),
   reste sous 0,4 %.
9. Le segment pro est déjà fiable avec les seuls critères 1–4 (0 collision mesurée) ;
   inutile d'y durcir quoi que ce soit.
10. Verdict : la méthode tient, mais elle est aujourd'hui **non éprouvée en pratique**
    — 0 paire produite, faute de données, pas faute de logique. Refaire cette mesure
    dans 3–4 semaines, une fois `department` réparé et le gisement de disparitions
    dix fois plus large, avant de trancher définitivement.

---

## Contre-vérification (2026-09-20)

Relecture de chaque requête de l'annexe contre `api/adscope_api/models.py`,
`disappearance.py`, `publication.py`, `revisit.py`, puis ré-exécution en
lecture seule (`SET default_transaction_read_only = on;`) de toutes les
requêtes portant un chiffre cité dans le corps du rapport (a, b, c, d, e, la
variante diagnostique de b, l'échantillon f et ses prix).

**Tous les chiffres cités se reproduisent à l'identique** : 61 466 annonces
(54 871 lbc / 6 595 lc), 11 `disappeared_at` / 96 `absent_since` seul, tous le
2026‑09‑19, `department` nul sur les 107 candidates ; entonnoir b
603 570 → 775 → 12 → 0 → 0 → 0 ; entonnoir c 5 267 520 → 2 287 → 81 → 0 → 0 → 0 ;
variante diagnostique (département suspendu) 775 → 12 → 3 → 1 ; taux de
collision 104 paires brutes → 79 uniques, 158 annonces impliquées, 124 km
rond / 34 non rond, 0 pro / 158 particulier, sur dénominateurs 61 455 / 41 358
/ 20 094 / 14 112 / 47 343 ; distribution des écarts 93 paires réparties
39/30/15/7/2/0, dont 17 dans la fenêtre stricte de succession ; les 5 lignes
et les 10 prix de l'échantillon f. Aucune erreur de logique trouvée dans les
requêtes : le `b.id > a.id` de la requête d empêche bien le double comptage
A/B et B/A qu'on redoutait ; la CTE `deg`/`uniq_pairs` calcule correctement
l'unicité (degré = nombre de candidats, pas nombre d'observations) ; le
traitement des nuls (`canon_brand`/`canon_model` via l'égalité qui rend NULL
donc faux, `year`/`department` via `IS NOT NULL` explicite, `fuel`/`gearbox`
via l'échappatoire « l'un des deux NULL ») correspond exactement à la règle
demandée ; le fuseau de session est `Europe/Paris`, cohérent avec les
horodatages affichés, sans effet sur les `date()` utilisés en a.

Vérification supplémentaire faite pour la section d : sur les 79 paires de
collision retenues, **aucune n'implique une annonce « en attente »**
(`absent_since` non nul, `disappeared_at` nul) — la réserve que l'auteur
notait lui-même dans ses "concerns" (population incluant potentiellement des
annonces au statut incertain) n'a donc eu aucun effet sur le chiffre 0,26 % :
requête `WHERE a_abs IS NOT NULL OR b_abs IS NOT NULL` sur les 79 paires
→ 0 ligne.

**Deux corrections apportées :**

1. **Erreur mineure, sans effet sur les taux affichés** — tableau de la
   section d : la population « Particulier + km non rond » était donnée à
   12 599, la valeur exacte est **12 596** (47 343 particuliers = 34 744 km
   rond + 12 596 km non rond + 3 avec `mileage` nul, oubliés dans le calcul
   initial). Le taux affiché (0,27 %) est inchangé au centième près
   (34/12 596 = 0,270 % contre 34/12 599 = 0,270 %). Tableau corrigé
   ci-dessus.

2. **Correction substantielle** — le rapport attribue l'absence de recul de
   La Centrale (section a, et points 3 et 7 de la conclusion) à sa jeunesse
   dans le crawl (« n'arrive en volume que les 19–20/09 »). C'est vrai mais
   incomplet : **La Centrale ne produira jamais de `disappeared_at` ni
   `absent_since` avec le code actuel, quel que soit le temps laissé au
   crawler.** `revisit.py` définit `ADDRESS = {"lbc": _lbc}` — seul `lbc` a un
   constructeur d'adresse de revisite ; `due()` retourne une liste vide pour
   `site="lc"` (`build = ADDRESS.get(site); if build is None: return []`),
   donc aucune fiche La Centrale n'est jamais mise en file de revisite, et
   `disappearance.observe()` — le seul point d'écriture de `absent_since`/
   `disappeared_at` — n'est donc jamais appelé pour ce site. Le commentaire de
   `revisit.py` le dit explicitement : « La Centrale n'y figure pas : sa
   signature d'absence n'a pas été confirmée sur une vraie disparition ». Ce
   n'est donc pas un verrou temporel (attendre) mais un **second verrou de
   code**, au même rang que le département manquant, et qui touche 6 595
   annonces (10,7 % du gisement). Le point 7 de la conclusion (« laisser
   tourner le crawler... plusieurs semaines ») ne vaut que pour lbc ; sans
   développement (activer une adresse de revisite pour lc, hors périmètre de
   cette mesure), la mesure restera à jamais lbc-seule.

**Tentative de réfutation de l'échantillon (f).** Le rapport ne retient et
n'étiquette aucune paire « certaine » ou « probable » — les 5 lignes
présentées sont déjà toutes verdict « douteuse », donc il n'y a rien à
réfuter à ce niveau. Pour aller plus loin que le rapport, les champs `fuel`,
`gearbox` et `version` (non utilisés dans la requête diagnostique de f) ont
été relus pour les 10 annonces citées : `fuel` et `gearbox` sont NULL des
deux côtés dans les 5 paires (le critère 1 les a laissées passer par
l'échappatoire « l'un des deux NULL », pas par une vraie égalité de carburant
ou de boîte). Le texte libre `version`, lui, contredit directement deux des
cinq paires :
- VW Golf 2018 (`3258071053`→`3225973274`) : A n'a pas de `version`
  enregistrée, B porte « Confortline_Golf 1.6 TDI 115ch FAP Confortline
  DSG7 5p » — un diesel à boîte auto. Rien ne prouve que A soit ce véhicule,
  mais rien ne l'exclut non plus (A n'a qu'une observation, sans détail) ;
  au mieux neutre, pas une confirmation.
- Renault Clio 2020 (`3262620650`→`3262684396`) : A porte « RS Line_Clio 1.3
  TCe 130ch FAP RS Line EDC » (essence, boîte auto EDC), B porte « Clio 1.6
  E-Tech 140ch Intens » (motorisation hybride, finition différente) — deux
  moteurs et deux finitions incompatibles. Ce n'est **pas** la même voiture,
  indépendamment de la coexistence déjà relevée par le rapport.

Ces deux lectures renforcent le verdict « douteuse » déjà posé par le
rapport ; elles ne le contredisent pas et ne promeuvent aucune paire vers
« probable » ou « certaine ». La paire VW Golf 2021 (`3261203212`→
`3263103099`) a, à l'inverse, une `version` strictement identique des deux
côtés (« Golf 1.5 TSI ACT OPF 130ch Life ») — mais `first_seen = last_seen`
pour les deux annonces, à une minute d'écart le 06/09 au matin : ce sont deux
fiches vues une seule fois, dans le même passage de balayage de liste, donc
par construction deux annonces distinctes visibles simultanément, pas une
succession. Le verdict « douteuse » du rapport tient pour les 5 paires.

**Verdict sur la fiabilité de la règle** : les chiffres tiennent, le calcul
du taux de collision est sain (79/61 455 paires, 0,26 %, méthodologie
correcte), et l'analyse du gisement dans le corps du rapport est honnête sur
son point faible principal (le département). Mais deux verrous de données
bloquent la mesure aujourd'hui, pas un seul : le département manquant sur
les candidates (déjà identifié) et l'absence structurelle de revisite pour
La Centrale (ajouté ici). Tant que ces deux verrous ne sont pas levés, la
règle reste **non éprouvée sur un cas réel** — le taux de collision dit
qu'elle ne produira probablement pas beaucoup de faux positifs le jour où
elle aura des candidates à examiner, mais ça reste une mesure de précision
indirecte, pas un test sur une vraie republication.

---

## Annexe — requêtes SQL

Chaque session commence par `SET default_transaction_read_only = on;` (omis ci-dessous
pour la lisibilité, toujours exécuté en tête de chaque connexion réelle).

### a. Gisement

```sql
SELECT count(*) AS total_listings FROM listings;
SELECT site, count(*) FROM listings GROUP BY 1;
SELECT min(first_seen), max(last_seen) FROM listings;
SELECT min(disappeared_at), max(disappeared_at) FROM listings WHERE disappeared_at IS NOT NULL;

SELECT site,
       count(*) FILTER (WHERE disappeared_at IS NOT NULL) AS disparues,
       count(*) FILTER (WHERE absent_since IS NOT NULL AND disappeared_at IS NULL) AS en_attente,
       count(*) AS total
FROM listings GROUP BY 1 ORDER BY 1;

SELECT date(disappeared_at) AS jour, site, count(*)
FROM listings WHERE disappeared_at IS NOT NULL
GROUP BY 1,2 ORDER BY 1,2;

SELECT date(absent_since) AS jour, site, count(*)
FROM listings WHERE absent_since IS NOT NULL
GROUP BY 1,2 ORDER BY 1,2;

SELECT seller_type,
       count(*) FILTER (WHERE disappeared_at IS NOT NULL) AS disparues,
       count(*) FILTER (WHERE absent_since IS NOT NULL AND disappeared_at IS NULL) AS en_attente
FROM listings GROUP BY 1;

-- remplissage des champs utiles à la règle
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE canon_brand IS NOT NULL) AS canon_brand,
  count(*) FILTER (WHERE canon_model IS NOT NULL) AS canon_model,
  count(*) FILTER (WHERE year IS NOT NULL) AS year,
  count(*) FILTER (WHERE mileage IS NOT NULL) AS mileage,
  count(*) FILTER (WHERE department IS NOT NULL) AS department,
  count(*) FILTER (WHERE fuel IS NOT NULL) AS fuel,
  count(*) FILTER (WHERE gearbox IS NOT NULL) AS gearbox
FROM listings;

SELECT date(first_seen) AS jour, site, count(*) FROM listings GROUP BY 1,2 ORDER BY 1,2;
```

### b/c. Entonnoir (variante confirmée, puis « en attente » en substituant
`absent_since`/`disappeared_at IS NULL` à `disappeared_at IS NOT NULL`, et
`A.absent_since` à `A.disappeared_at` dans la borne haute de succession)

```sql
WITH pairs AS (
  SELECT
    a.id AS a_id, b.id AS b_id,
    a.site AS site, a.site_id AS a_site_id, b.site_id AS b_site_id,
    (a.canon_brand = b.canon_brand
     AND a.canon_model = b.canon_model
     AND a.year IS NOT NULL AND b.year IS NOT NULL AND a.year = b.year
     AND (a.fuel IS NULL OR b.fuel IS NULL OR a.fuel = b.fuel)
     AND (a.gearbox IS NULL OR b.gearbox IS NULL OR a.gearbox = b.gearbox)
    ) AS c1,
    (b.mileage IS NOT NULL AND a.mileage IS NOT NULL
     AND b.mileage BETWEEN a.mileage AND a.mileage + 3000) AS c2,
    (a.department IS NOT NULL AND b.department IS NOT NULL
     AND a.department = b.department) AS c3,
    (NOT (a.seller_type = 'pro' AND b.seller_type <> 'pro')
     AND NOT (b.seller_type = 'pro' AND a.seller_type <> 'pro')
     AND (a.seller_type <> 'pro' OR b.seller_type <> 'pro' OR a.seller_id = b.seller_id)
    ) AS c4,
    (a.disappeared_at IS NOT NULL
     AND COALESCE(b.published_at, b.site_published_first::timestamptz)
         >= a.last_seen - interval '2 days'
     AND COALESCE(b.published_at, b.site_published_first::timestamptz)
         <= a.disappeared_at + interval '30 days'
    ) AS c5
  FROM listings a
  JOIN listings b ON b.site = a.site AND b.site_id <> a.site_id
  WHERE a.disappeared_at IS NOT NULL   -- variante c : a.absent_since IS NOT NULL AND a.disappeared_at IS NULL
)
SELECT
  count(*) AS total_paires,
  count(*) FILTER (WHERE c1) AS apres_1,
  count(*) FILTER (WHERE c1 AND c2) AS apres_2,
  count(*) FILTER (WHERE c1 AND c2 AND c3) AS apres_3,
  count(*) FILTER (WHERE c1 AND c2 AND c3 AND c4) AS apres_4,
  count(*) FILTER (WHERE c1 AND c2 AND c3 AND c4 AND c5) AS apres_5
FROM pairs;
```

Variante diagnostique (département suspendu) utilisée pour situer 4 et 5 :

```sql
WITH pairs AS (
  SELECT
    a.id AS a_id, b.id AS b_id, a.site_id AS a_site_id, b.site_id AS b_site_id,
    (a.canon_brand = b.canon_brand AND a.canon_model = b.canon_model
     AND a.year IS NOT NULL AND b.year IS NOT NULL AND a.year = b.year
     AND (a.fuel IS NULL OR b.fuel IS NULL OR a.fuel = b.fuel)
     AND (a.gearbox IS NULL OR b.gearbox IS NULL OR a.gearbox = b.gearbox)) AS c1,
    (b.mileage IS NOT NULL AND a.mileage IS NOT NULL
     AND b.mileage BETWEEN a.mileage AND a.mileage + 3000) AS c2,
    (NOT (a.seller_type = 'pro' AND b.seller_type <> 'pro')
     AND NOT (b.seller_type = 'pro' AND a.seller_type <> 'pro')
     AND (a.seller_type <> 'pro' OR b.seller_type <> 'pro' OR a.seller_id = b.seller_id)) AS c4,
    (COALESCE(b.published_at, b.site_published_first::timestamptz) >= a.last_seen - interval '2 days'
     AND COALESCE(b.published_at, b.site_published_first::timestamptz) <= a.disappeared_at + interval '30 days') AS c5
  FROM listings a
  JOIN listings b ON b.site = a.site AND b.site_id <> a.site_id
  WHERE a.disappeared_at IS NOT NULL
)
SELECT count(*) FILTER (WHERE c1) AS apres_1,
       count(*) FILTER (WHERE c1 AND c2) AS apres_2,
       count(*) FILTER (WHERE c1 AND c2 AND c4) AS apres_2_4,
       count(*) FILTER (WHERE c1 AND c2 AND c4 AND c5) AS apres_2_4_5
FROM pairs;
```

### d. Taux de collision

```sql
WITH cand AS (
  SELECT id, site, site_id, canon_brand, canon_model, year, fuel, gearbox,
         mileage, department, seller_type, seller_id, first_seen, last_seen
  FROM listings
  WHERE disappeared_at IS NULL
),
pairs AS (
  SELECT a.id AS a_id, b.id AS b_id,
         a.mileage AS a_mileage, b.mileage AS b_mileage,
         a.seller_type AS a_stype, b.seller_type AS b_stype
  FROM cand a
  JOIN cand b ON b.site = a.site AND b.canon_brand = a.canon_brand
    AND b.canon_model = a.canon_model AND b.year = a.year
    AND b.id > a.id
  WHERE a.first_seen <= b.last_seen AND b.first_seen <= a.last_seen
    AND (a.fuel IS NULL OR b.fuel IS NULL OR a.fuel = b.fuel)
    AND (a.gearbox IS NULL OR b.gearbox IS NULL OR a.gearbox = b.gearbox)
    AND a.department IS NOT NULL AND b.department IS NOT NULL AND a.department = b.department
    AND a.mileage IS NOT NULL AND b.mileage IS NOT NULL
    AND abs(a.mileage - b.mileage) <= 3000
    AND NOT (a.seller_type = 'pro' AND b.seller_type <> 'pro')
    AND NOT (b.seller_type = 'pro' AND a.seller_type <> 'pro')
    AND (a.seller_type <> 'pro' OR b.seller_type <> 'pro' OR a.seller_id = b.seller_id)
),
touch AS (SELECT a_id AS id FROM pairs UNION ALL SELECT b_id FROM pairs),
deg AS (SELECT id, count(*) AS deg FROM touch GROUP BY 1),
uniq_pairs AS (
  SELECT p.* FROM pairs p
  JOIN deg da ON da.id = p.a_id
  JOIN deg db ON db.id = p.b_id
  WHERE da.deg = 1 AND db.deg = 1
),
uniq_touch AS (
  SELECT a_id AS id, a_mileage AS mileage, a_stype AS stype FROM uniq_pairs
  UNION ALL
  SELECT b_id, b_mileage, b_stype FROM uniq_pairs
)
SELECT
  (SELECT count(*) FROM pairs) AS paires_brutes,
  (SELECT count(*) FROM uniq_pairs) AS paires_uniques,
  (SELECT count(*) FROM uniq_touch) AS annonces_impliquees,
  (SELECT count(*) FROM uniq_touch WHERE mileage % 1000 = 0) AS impliquees_km_rond,
  (SELECT count(*) FROM uniq_touch WHERE mileage % 1000 <> 0) AS impliquees_km_non_rond,
  (SELECT count(*) FROM uniq_touch WHERE stype='pro') AS impliquees_pro,
  (SELECT count(*) FROM uniq_touch WHERE stype='private') AS impliquees_private;

-- dénominateurs
SELECT count(*) AS total_candidats FROM listings WHERE disappeared_at IS NULL;
SELECT
  count(*) FILTER (WHERE mileage IS NOT NULL AND mileage % 1000 = 0) AS km_rond,
  count(*) FILTER (WHERE mileage IS NOT NULL AND mileage % 1000 <> 0) AS km_non_rond,
  count(*) FILTER (WHERE seller_type='pro') AS pros,
  count(*) FILTER (WHERE seller_type='private') AS particuliers
FROM listings WHERE disappeared_at IS NULL;
SELECT count(*) FROM listings
WHERE disappeared_at IS NULL AND seller_type='private' AND mileage IS NOT NULL AND mileage % 1000 = 0;
```

### e. Écart temporel

```sql
WITH a_all AS (
  SELECT id, site, site_id, canon_brand, canon_model, year, fuel, gearbox, mileage,
         last_seen, COALESCE(disappeared_at, absent_since) AS repere_fin
  FROM listings
  WHERE disappeared_at IS NOT NULL OR absent_since IS NOT NULL
),
pairs AS (
  SELECT a.id AS a_id, b.id AS b_id,
         a.last_seen AS a_last_seen, a.repere_fin,
         COALESCE(b.published_at, b.site_published_first::timestamptz) AS b_pub
  FROM a_all a
  JOIN listings b ON b.site = a.site AND b.site_id <> a.site_id
  WHERE a.canon_brand = b.canon_brand AND a.canon_model = b.canon_model
    AND a.year IS NOT NULL AND b.year IS NOT NULL AND a.year = b.year
    AND (a.fuel IS NULL OR b.fuel IS NULL OR a.fuel = b.fuel)
    AND (a.gearbox IS NULL OR b.gearbox IS NULL OR a.gearbox = b.gearbox)
    AND a.mileage IS NOT NULL AND b.mileage IS NOT NULL
    AND b.mileage BETWEEN a.mileage AND a.mileage + 3000
)
SELECT
  count(*) FILTER (WHERE j < -30) AS moins_30,
  count(*) FILTER (WHERE j BETWEEN -30 AND -8) AS m30_m8,
  count(*) FILTER (WHERE j BETWEEN -7 AND -1) AS m7_m1,
  count(*) FILTER (WHERE j BETWEEN 0 AND 7) AS p0_p7,
  count(*) FILTER (WHERE j BETWEEN 8 AND 30) AS p8_p30,
  count(*) FILTER (WHERE j > 30) AS plus_30
FROM (SELECT round(extract(epoch FROM (b_pub - a_last_seen))/86400) AS j FROM pairs) e;
```

### f. Échantillon (paires diagnostiques, département suspendu)

```sql
WITH a_all AS (
  SELECT id, site, site_id, canon_brand, canon_model, year, fuel, gearbox, mileage,
         seller_type, seller_id, last_seen,
         COALESCE(disappeared_at, absent_since) AS repere_fin
  FROM listings
  WHERE disappeared_at IS NOT NULL OR absent_since IS NOT NULL
)
SELECT a.site, a.site_id AS a_site_id, b.site_id AS b_site_id,
       a.canon_brand, a.canon_model, a.year, a.mileage AS a_mileage, b.mileage AS b_mileage,
       a.seller_type AS a_stype, b.seller_type AS b_stype,
       a.last_seen AS a_last_seen, a.repere_fin,
       COALESCE(b.published_at, b.site_published_first::timestamptz) AS b_pub
FROM a_all a
JOIN listings b ON b.site = a.site AND b.site_id <> a.site_id
WHERE a.canon_brand = b.canon_brand AND a.canon_model = b.canon_model
  AND a.year IS NOT NULL AND b.year IS NOT NULL AND a.year = b.year
  AND (a.fuel IS NULL OR b.fuel IS NULL OR a.fuel = b.fuel)
  AND (a.gearbox IS NULL OR b.gearbox IS NULL OR a.gearbox = b.gearbox)
  AND a.mileage IS NOT NULL AND b.mileage IS NOT NULL
  AND b.mileage BETWEEN a.mileage AND a.mileage + 3000
  AND NOT (a.seller_type = 'pro' AND b.seller_type <> 'pro')
  AND NOT (b.seller_type = 'pro' AND a.seller_type <> 'pro')
  AND (a.seller_type <> 'pro' OR b.seller_type <> 'pro' OR a.seller_id = b.seller_id)
  AND COALESCE(b.published_at, b.site_published_first::timestamptz) >= a.last_seen - interval '2 days'
  AND COALESCE(b.published_at, b.site_published_first::timestamptz) <= a.repere_fin + interval '30 days';

-- prix (premier / dernier) des annonces citées, jointes sur price_points
SELECT l.site_id, l.first_seen, l.last_seen, l.version,
       (array_agg(pp.price ORDER BY pp.observed_at ASC))[1] AS premier_prix,
       (array_agg(pp.price ORDER BY pp.observed_at DESC))[1] AS dernier_prix
FROM listings l LEFT JOIN price_points pp ON pp.listing_id = l.id
WHERE l.site = 'lbc' AND l.site_id IN ( /* les 10 site_id du tableau f */ )
GROUP BY l.id, l.site_id, l.first_seen, l.last_seen, l.version
ORDER BY l.site_id;
```
