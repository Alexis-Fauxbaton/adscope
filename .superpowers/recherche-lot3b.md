# Recherche filtrée, lot 3b — les modèles que les sites n'ont pas

Mesuré et livré le 2026-09-20 sur `adscope`, **55 783 annonces** réelles (le
crawl a continué : 55 018 au lot 3a). Branche `feat/api`, **666 tests** Python
(46 neufs), **47 mutations** toutes tuées. Aucune migration : le lot n'écrit
que des colonnes qui existaient déjà. Base recanonisée, API relancée.

**Le verdict** : le modèle déduit passe de **142 à 1 006 annonces**. Les
« Autres » non précisées tombent de 4 712 à **3 848**, et sur celles qui ont
une version il n'en reste que **355**. Les 82 modèles créés, les mots de
carrosserie et les trois cas particuliers sont dans
`shared/vehicle-aliases.json`, chacun chiffré et daté.

**La porte est franchie** : précision **100 % hors désaccords légitimes** —
aucune déduction mesurée ne nomme un modèle que la version ne porte pas. Le
chiffre prudent du 3a (qui compte aussi comme fautes les cas où le site range
plus grossièrement que sa propre version) est passé de 99,27 % à **98,25 %**,
et **ce n'est pas ce lot qui l'a fait baisser** : à vocabulaire des seuls
sites, la même mesure rejouée aujourd'hui donne 98,28 %. §3 explique où sont
passés les 1,2 points, et ce n'est pas une régression de lecture.

**La somme de contrôle des champs observés n'a pas bougé d'un bit.**

---

## 1. Ce que le fichier partagé porte maintenant

`shared/vehicle-aliases.json` gagne quatre sections, et c'est là que vit tout
le jugement de ce lot. Le code, lui, ne connaît que des règles.

| section | ce qu'elle dit | taille |
|---|---|---|
| `modeles_crees` | 82 entrées, 29 marques : un modèle réel qu'aucun des deux sites ne porte dans sa colonne modèle, avec son effectif et un exemple de version | 140 lignes |
| `carrosseries` | 12 mots qui suivent un modèle sans en désigner un autre | 1 |
| `finitions` | un seul mot : `Base` | 1 |
| `alias_modeles` | 1 règle : « 812 Superfast » (leboncoin, 24) = « 812 » (La Centrale, 3) | 1 |

Les 82 entrées sortent de la liste des candidats
(`.superpowers/recherche-lot3b-candidats.md`) par application mécanique des
trois règles — **aucun nom n'a été inventé, aucune orthographe recomposée** :
l'écriture affichée est celle que les versions écrivent. Le script qui fait la
conversion est dans le scratchpad de la session (`decide3b.py`), et il se
rejoue.

*Note sur la liste source* : elle annonce 93 candidats et 984 annonces, mais
ses tables en portent 92, pour 975 annonces. J'ai pris ce qui est écrit dans
les tables.

### Règle 2 — ce que je fais des mots que tu m'as demandé d'arbitrer

| mot | décision | pourquoi |
|---|---|---|
| **Coupé, Cabriolet, Combi, Sportback, SW** | mot de carrosserie | le lot 3a les avait **déjà mesurés** (ils suivent au moins quatre couples marque/modèle). Le fichier les réécrit quand même, pour que la décision survive à un corpus qui bouge |
| **Spider, Roadster, Volante, Fastback, Shooting, Brake, GTC** | mot de carrosserie, **écrit à la main** | la mesure ne peut pas les voir : « Spider » ne suit que la 488, « Volante » que les Aston. C'est le §6b du lot 3a, et c'est toi qui l'as tranché |
| **Break** | mot de carrosserie, inchangé | mesuré au 3a (23 modèles le suivent). « Classe C Break » reste une Classe C, comme avant |
| **Sport, Tourer** | **volontairement absents** | « Range Rover Sport » et « Zafira Tourer » sont des modèles à part entière. Les admettre referait l'erreur Camaro |

Trois exemples pris dans la base : « GLE Coupé 350 de 194+136ch » → **GLE**,
« CLA Shooting Brake 200 d » → **CLA**, « Vito Combi 113 CDI » → **Vito**.

**Rien de tout cela ne touche un modèle que le site déclare lui-même** : la
règle ne joue que dans `infer_model`, et `infer_model` ne s'exécute que là où
la colonne modèle est vide ou vaut « Autres ». Les huit modèles déclarés qui
portent un mot de carrosserie restent des seaux à eux : voir §6.2, c'est ta
décision.

### Règle 3 — « Base » est une finition

« F8 Tributo Base » → **F8 Tributo**, « 600LT Base » → **600LT**, « GT Base » →
**GT** (McLaren). Un seul mot dans la liste, et il ne s'applique lui aussi qu'à
la déduction.

### Les trois cas

| cas | ce qui est posé | effectif |
|---|---|---|
| Citroën, tête « Picasso » seule | **Xsara Picasso**, si l'année ≤ 2010 | 118, **toutes de 2000 à 2009** — aucune n'est perdue par la condition |
| Smart, « Smart Coupé » / « Smart Cabriolet » | **Fortwo** (tête `Smart` → modèle `Fortwo`) | 13, plus 30 « Fortwo Coupé/Cabriolet » = **43** |
| Dodge, « 1973 Challenger Challenger » | **Challenger** | 10 (9 en 1973, 1 en 1972) |

L'année entre dans la signature : `infer_model(brand, version, known, year)`,
et **une année manquante ne remplit aucune condition** — on ne parie pas sur
l'âge d'une voiture qu'on ne connaît pas.

Le cas Dodge a demandé deux règles neuves, étroites et mesurées, décrites
au §2.

### L'alias entre sites — la famille 812

Ce que chaque site porte, mesuré :

| écriture | site | annonces | version observée |
|---|---|---|---|
| « 812 Superfast » | leboncoin | 24 | « 812 V12 6.5 800ch » |
| « 812 » | La Centrale | 3 | (La Centrale ne répète pas le modèle) |

**Aucune autre écriture de la famille en base** — pas de « 812 GTS », pas de
« 812 Competizione ». Le nom court l'emporte : c'est celui de la famille, celui
que La Centrale emploie, et celui que la version écrit des deux côtés. Après
fusion, le seau « 812 » porte **27 annonces**, et `?model=812 Superfast` comme
`?model=812` les rendent toutes les vingt-sept.

C'est le seul alias de modèle du lot. Il s'applique au modèle **déclaré** (donc
à `canon_model` et au vocabulaire), à la différence de la règle 2 — et
`?q=superfast` rend toujours ses 24 annonces, parce que les mots observés
restent dans `search_text`.

## 2. Ce que le code a gagné, et rien de plus

`api/adscope_api/inference.py` garde ses trois gardes du lot 3a. Deux règles
s'y ajoutent, chacune pour un cas nommé, chacune mesurée avant d'être écrite.

**Un millésime devant la version n'est pas un modèle.** 94 versions du corpus
commencent par un nombre de la forme 19xx/20xx. **81 sont des Peugeot 2008** —
dont le nom *est* ce nombre. Le saut ne joue donc **qu'après un échec** : la
recherche en tête passe d'abord, « 2008 » se reconnaît, et rien ne bouge. Les
13 autres (10 Dodge Challenger, 1 Ford « 1965 Mustang », 1 Chevrolet « 1967
Corvette » déjà classée par son site, 1 Camaro) sont ce que la règle sert.

Le garde-fou compte autant que la règle : **seul** un millésime autorise à
passer le premier mot. Sans cette condition, l'ancrage en tête du lot 3a
tomberait — « Exclusive C4 Picasso BlueHDi » redeviendrait une C4 Picasso
alors que rien ne dit qu'« Exclusive » est une finition. Un test le tient dans
les deux sens.

**Une version qui redit le modèle ne le change pas.** « 1973 Challenger
**Challenger** » : après le nom, le mot suivant est le nom. Mesuré sur tout le
corpus : **zéro autre cas** — aucune version ne redit un modèle déjà connu. La
règle ne peut donc rien casser d'existant. Et la garde du mot suivant se
réapplique après la redite : « Challenger Challenger Hellcat » ne déduit rien.

Le reste du lot est de la plomberie, et elle tient dans un module neuf :

| fichier | rôle | lignes |
|---|---|---|
| `model_catalog.py` | **neuf** — le fichier partagé lu : modèles créés, mots, alias, `with_catalog` | 112 |
| `version_heads.py` | **neuf** — la tête d'une version, pour le rapport de santé seul | 65 |
| `data_health_models.py` | **neuf** — les deux lignes neuves du rapport | 107 |
| `inference.py` | `KnownModels` gagne `renames` et `year_max` ; `infer_model` gagne l'année | 142 |
| `model_vocabulary.py` | `load` = ce que les sites classent **+** ce que le fichier crée | 127 |
| `taxonomy.py` | l'alias de modèle dans `canonical` ; l'année passée à la déduction | 139 |
| `naming.py` | la tête écrite autrement quitte la queue du libellé | 140 |
| `spelling.py` | l'orthographe d'un modèle créé vient du fichier | 137 |
| `data_health.py` · `_text.py` | les deux sections assemblées et mises en texte | 84 · 144 |

**Correction du 2026-09-20 :** cette affirmation était fausse — `inference.py`
et `model_catalog.py` avaient grossi jusqu'à 170 et 154 lignes (décision
d'Alexis du 2026-09-20 sur le mot purement numérique). Découpage mécanique,
sans changement de comportement : `inference.py` cède `head`/`span`/`_named`
(la garde du mot suivant / du nombre) à `model_matching.py` (106 → 79 lignes
côté inference), `model_catalog.py` cède `_model_aliases`/`_alias_heads` à
`model_aliases.py` (154 → 121 lignes). Les 685 tests passent sans qu'aucune
assertion change ; seuls des chemins d'import de tests peuvent bouger.

Le fichier partagé, lui, passe de 110 à 269 lignes : c'est une table de
données, et tu as demandé qu'elle porte l'effectif et un exemple pour chaque
modèle.

**Pas d'auto-renforcement, toujours** : le vocabulaire = modèles déclarés par
les sites **+** modèles du fichier. Jamais un modèle déduit. `load` lit les
colonnes observées, `with_catalog` lit le JSON, et rien ne relit `canon_model`.

Un détail visible à l'écran : sans une précaution, les 118 Picasso
s'affichaient « Citroën Xsara Picasso Base **Picasso** 2.0 HDi90 ». Le fichier
dit que la tête « Picasso » écrit le modèle « Xsara Picasso », et `naming` la
retire de la queue comme il retire le modèle. Rendu réel : « Citroën Xsara
Picasso Base 2.0 HDi90 ».

## 3. La précision, et pourquoi le chiffre prudent a bougé

Mesure du 3a rejouée : sur les annonces **au modèle connu** et à la version
pleine, on cache le modèle, on le déduit, on compare.

| | avant (vocabulaire des sites seuls) | **après** (fichier compris) |
|---|---|---|
| population | 17 905 | 17 905 |
| déductions | 14 045 (78,4 %) | **14 086 (78,7 %)** |
| justes | 13 746 | **13 782** |
| (1) le site range plus grossièrement que sa version | 242 | **246** |
| (2) les deux colonnes du site se contredisent | 57 | **58** |
| précision brute | 97,87 % | **97,84 %** |
| précision en comptant (1) comme faute | 98,28 % | **98,25 %** |
| **précision hors désaccords légitimes** | 100 % | **100 %** |

**Aucun des 304 désaccords n'est une lecture fausse** : dans tous, la version
nomme littéralement, en tête et en mots entiers, le modèle déduit. Ce sont les
deux colonnes du site qui divergent. C'est la conclusion du 3a, et elle tient.

**Où sont passés les 1,2 points depuis le 3a (99,27 % → 98,25 %) ?** Pas dans
ce lot : **la même mesure, sans le fichier, donne déjà 98,28 % aujourd'hui.**
Deux modèles sont entrés dans le vocabulaire *par le corpus* depuis le 19
septembre :

| n | ce que le site déclare | ce que sa version dit | d'où ça vient |
|---|---|---|---|
| **120** | Citroën « C4 Picasso » | « Grand C4 Picasso BlueHDi 150ch » | La Centrale classe 11 annonces en « Grand C4 Picasso » — le modèle franchit le seuil de trois, et 120 leboncoin se voient déduire le nom plus précis |
| **17** | Volkswagen « Golf » | « Golf Plus 1.6 FSI 115ch » | « Golf Plus » franchit le seuil de la même façon |

C'est **exactement** la nature des 94 « 206 → 206+ » que le 3a comptait déjà
dans cette catégorie : la version est plus précise que la colonne du site, et
le plus long est le nom réel de la voiture. Un Grand C4 Picasso a sept places.
Le corpus s'enrichit, cette catégorie grossit, et elle grossira encore.

**Et ces désaccords ne peuvent pas se produire en production** : la déduction
ne s'exécute que là où le site n'a donné aucun modèle. Cette mesure sert à
juger si la règle *lit* bien une version, pas à prédire des erreurs réelles.

### Un modèle créé vole-t-il des annonces à un modèle déclaré ? Cinq, les voici

| n | marque | le site déclare | la version dit, on déduit | ce que c'est |
|---|---|---|---|---|
| 2 | Land Rover | Range Rover | **Range Rover Sport** — « Range Rover Sport 3.0 P510e 510ch PHEV Autobiography » | le site range plus grossièrement que sa version (le cas que tu annonçais) |
| 1 | Citroën | C3 | **C3 Pluriel** — « Charleston_C3 Pluriel 1.4 HDi70 Charleston » | idem |
| 1 | Peugeot | Partner | **Partner Tepee** — « Confort_Partner Tepee 1.6 HDi75 Confort » | idem |
| 1 | Mercedes | Classe C | **GLC** — « GLC Coupé 63 AMG 476ch 4Matic+ 9G-Tronic » | **le site a tort** : un GLC Coupé n'est pas une Classe C |

Cinq sur 14 086 déductions. Aucune n'est une lecture fausse, et **aucune ne se
produit en production** : ces cinq annonces portent un modèle du site, donc la
déduction ne tourne pas sur elles.

## 4. « Autres » résolues, par marque

En base : **142 → 1 006**. Non précisées : **4 712 → 3 848**.

À donnée constante (tout mesuré aujourd'hui), le vocabulaire des seuls sites en
résoudrait 260 — le crawl a apporté des modèles La Centrale depuis le 3a. C'est
ce 260 que la colonne « avant » compare, pour n'attribuer au lot que ce qu'il a
fait.

| marque | « Autres » | avant | **après** | delta |
|---|---:|---:|---:|---:|
| Renault | 1 124 | 127 | **206** | +79 |
| Citroën | 855 | 119 | **187** | +68 |
| Mercedes | 372 | 5 | **114** | +109 |
| Land Rover | 123 | 1 | **78** | +77 |
| Aston Martin | 102 | 0 | **46** | +46 |
| Smart | 136 | 0 | **43** | +43 |
| BMW | 152 | 0 | **42** | +42 |
| Ford | 202 | 1 | **40** | +39 |
| Ferrari | 198 | 0 | **32** | +32 |
| Kia | 67 | 0 | **30** | +30 |
| Dacia | 30 | 0 | **22** | +22 |
| Audi | 80 | 0 | **18** | +18 |
| Maserati | 27 | 0 | **16** | +16 |
| Fiat | 75 | 2 | **16** | +14 |
| Opel | 61 | 2 | **15** | +13 |
| McLaren | 29 | 0 | **12** | +12 |
| Peugeot | 163 | 0 | **11** | +11 |
| Dodge | 71 | 0 | **10** | +10 |
| Seat | 38 | 0 | **10** | +10 |
| Nissan · Jaguar | 83 · 28 | 0 · 0 | **9 · 9** | +9 · +9 |
| Volkswagen · Hyundai | 112 · 16 | 0 · 0 | **8 · 8** | +8 · +8 |
| Toyota | 89 | 2 | **7** | +5 |

**Ferrari passe de 0 à 32 et Land Rover de 1 à 78** : c'était le cœur du
problème du 3a, et il est réglé. Mercedes gagne le plus en valeur absolue
(+109), parce que ses SUV modernes (GLE, GLC, GLA, CLA, CLE, Classe ML)
n'existent dans la colonne modèle d'aucun des deux sites.

### Ce qui reste, et pourquoi

| n | raison |
|---:|---|
| **3 493** | **aucune version du tout.** Aucune méthode fondée sur le texte ne peut rien pour elles — ni ce lot, ni le suivant |
| **174** | la tête **est** un modèle du vocabulaire, mais **la garde du mot suivant refuse**. Voir §6.1, c'est le premier point que je te demande |
| ~100 | tête vue moins de trois fois, ou marque elle-même inconnue (MG, Ineos, BYD, Xpeng : 21 annonces) |
| ~80 | la version ne nomme aucun modèle (« 2.0 HDi 110ch Pack ») ou reste illisible |

## 5. Appliqué à la base réelle

```
pg_dump -Fc adscope -f ~/adscope-backups/adscope-20260920-105156-avant-3b.dump   (4,2 Mo)
python scripts/recanonize.py --all → 888 annonces recanonisées, 2,0 s
python scripts/recanonize.py --all → 0 annonce (rejoué, rien à faire)
launchctl kickstart -k gui/501/fr.adscope.api
```

Aucune migration : `canon_model`, `canon_model_source` et `search_text`
existaient déjà.

**Somme de contrôle des champs observés** (`brand`, `model`, `version`,
`fingerprint`, `year`, `mileage`, sur les 55 783 annonces) :

```
avant  41984581fe3064c77af7db2269d6ff79
après  41984581fe3064c77af7db2269d6ff79
```

**Elle n'a pas bougé d'un bit.** L'empreinte véhicule est intacte, les
comparables aussi.

### Les recherches, sur la base recanonisée

Le brief interdit de frapper une licence : les comptes ci-dessous passent par
les **mêmes fonctions** que la route (`search.family`, `search.text`) sur la
base réelle, en lecture seule. L'API est relancée et répond (elle rend
« licence invalide » sans clé, c'est-à-dire qu'elle route).

| requête | total | temps |
|---|---:|---|
| `?brand=Mercedes&model=GLE` | **35** *(0 avant)* | 0,019 s |
| `?brand=Mercedes&model=GLE Coupé` | **0** — la règle 2 a fait son travail, ils sont dans GLE | 0,000 s |
| `?brand=Land Rover&model=Range Rover Sport` | **57** *(0 avant)* | 0,001 s |
| `?brand=Land Rover&model=Range Rover` | **134** — inchangé, rien n'est sorti du seau | 0,001 s |
| `?brand=Citroën&model=Xsara Picasso` | **118** *(0 avant)* | 0,001 s |
| `?brand=Smart&model=Fortwo` | **44** *(1 avant)* | 0,001 s |
| `?brand=Ferrari&model=812` · `?model=812 Superfast` | **27 · 27** — un seul seau, deux saisies | 0,000 s |
| `?brand=Dodge&model=Challenger` | **10** | 0,000 s |
| `?brand=Ford&model=Mustang` · `?brand=Kia&model=Cee'd` | 17 · 18 | 0,000 s |
| sans filtre | 55 783 | 0,004 s |

**Le texte de recherche n'a rien perdu**, mesuré annonce par annonce, avant
contre après :

| requête | avant | après |
|---|---:|---:|
| `?q=gle coupé` | 20 | **20** |
| `?q=picasso` | 1 278 | **1 278** |
| `?q=smart coupe` | 31 | **31** |
| `?q=base` | 254 | **254** |
| `?q=superfast` | 24 | **24** |
| `?q=fortwo` | 31 | **44** *(gagné)* |
| `?q=xsara picasso` | 0 | **118** *(gagné)* |

Aucune perte nulle part : `search_text` ne fait qu'ajouter des mots.

---

# 6. À regarder par Alexis

## 6.1 Les 174 que la garde refuse — un mot de toi et j'en récupère 141

C'est le seul vrai reste exploitable. Une annonce dont la tête **est** un
modèle du fichier se fait refuser parce que le mot qui suit n'est pas un
qualificatif mesuré :

| n | marque | le modèle est là | mais le mot suivant est |
|---:|---|---|---|
| 16 | BMW | XM | « 4.4 » |
| 12 | Land Rover | Range Rover Sport | « 4.4 » |
| 10 | Ferrari | Purosangue | « 6.5 » |
| 9 | Mercedes | GLE | « 53e », « 53 » |
| 8 | Toyota | Corolla Verso | « 136 » |
| 7 | Mercedes | Classe ML | « 280 », « 500 » |
| 6 | Dacia | Spring | « 45ch », « 65ch » |
| 6 | Mini | Clubman Cooper | « 120ch » |
| … | | | |

Tous ces mots sont des **cylindrées, des puissances ou des codes de
motorisation**. J'ai mesuré ce que donnerait la règle « un mot purement
numérique est un qualificatif » :

```
+141 « Autres » résolues (1 006 → 1 147)
sur les annonces au modèle connu : 1 090 déductions de plus
    1 030 justes, 51 plus fines que le site, 9 contradictoires (0,8 %)
```

Les neuf sont des Mercedes et deux Renault où les deux colonnes du site se
contredisent déjà (« Classe G » déclarée, version « Classe A 160 Elegance »).

**C'est un jugement, pas une mesure — je ne l'écris pas seul.** Le 3a t'avait
déjà posé cette question pour les carrosseries (§6b), tu as répondu, et c'est
ce qui a fait ce lot. Un mot de toi et c'est une ligne dans le fichier.

## 6.2 Les modèles **déclarés** qui portent un mot de carrosserie — ta décision

La règle 2 ne les touche pas, comme tu l'as demandé. Les voici tous, avec ce
que porte le seau du modèle de base :

| n | marque / modèle déclaré | sites | le seau de base |
|---:|---|---|---|
| **33** | Peugeot / « Expert Combi » | leboncoin | « Expert » : **3** |
| **30** | Citroën / « Nemo Combi » | leboncoin | « Nemo » : **1** |
| 3 | Fiat / « 124 Spider » | leboncoin | « 124 » : 2 |
| 3 | Ferrari / « 458 Spider » | leboncoin | « 458 » : **25** |
| 2 | Toyota / « Proace Combi » | leboncoin | « Proace » : 0 |
| 1 | Mini / « Mini Cabriolet » | La Centrale | « Mini » : **391** |
| 1 | Ferrari / « SF90 Spider » | La Centrale | « SF90 Stradale » : 4 |
| 1 | Aixam / « E Coupé » | La Centrale | — |

**Les deux qui comptent** : « 458 Spider » (3) à côté de « 458 » (25), et
« Mini Cabriolet » (1) à côté de « Mini » (391). Les replier rendrait le filtre
complet ; les laisser garde la taxonomie du site telle quelle. « Expert
Combi » et « Nemo Combi » sont le cas inverse : le gros effectif est sur la
forme longue, et un Expert Combi (neuf places) n'est pas tout à fait un Expert
(fourgon) — je pencherais pour les laisser.

Dis-moi et c'est une ligne dans `alias_modeles`, la même mécanique que le 812.

## 6.3 Deux seaux pour une voiture — ce que je te signale

| n | ce qui coexiste | pourquoi |
|---|---|---|
| **118 + 14** | « Xsara Picasso » (déduit) et « Picasso » (déclaré par La Centrale, 14) | ton arbitrage porte sur la **tête de version**, donc sur la déduction. Les 14 La Centrale sont toutes de 2000 à 2009 — ce sont aussi des Xsara Picasso. Un `alias_modeles` les réunirait, mais il faudrait la condition d'année du côté déclaré aussi, ce que `canonical` ne sait pas faire aujourd'hui |
| **5 + 5** | Ferrari « F8 » (les F8 Spider) et « F8 Tributo » | j'ai appliqué les règles à la lettre : « Spider » est un mot de carrosserie (→ F8), « Tributo » n'en est pas un (→ F8 Tributo). Ferrari, elle, appelle la famille « F8 ». Une ligne d'alias les réunit |
| **18 + 6 + 6** | Kia « Cee'd », « Ceed », « Pro Cee'd » | Kia a renommé « cee'd » en « Ceed » en 2018. Les versions écrivent les deux. Je ne fusionne pas sur une hypothèse de calendrier |
| **3 + 1** | Opel « Grandland » (créé) et « Grandland X » (déclaré, 6) | Opel a vraiment retiré le X en 2021. Deux modèles, ou un ? |

## 6.4 Ce que je juge douteux, tout

- **« Zafira Tourer », « Série 2 Gran Tourer », « Série 2 ActiveTourer »** sont
  créés comme modèles distincts parce que la liste des candidats les marque
  « sûr » et que « Tourer » n'est pas dans la liste des carrosseries. Si tu
  décides un jour que « Tourer » en est un, ils se replient sur Zafira et
  Série 2 — et « Zafira Tourer » (6) rejoindrait « Zafira » (463).
- **« Mini Cooper » (3)** créé chez Mini, à côté du modèle « Mini » (391) que
  le site déclare. « Cooper » est un niveau de motorisation, pas un modèle ;
  mais sans ce nom composé, « Cooper_Mini Cooper 115ch » ne déduit rien du
  tout, parce que « Cooper » suit « Mini » et n'est pas un qualificatif. Même
  raisonnement pour « Clubman Cooper » (6) et « Clubman Cooper D » (5).
- **« S e-tron GT » (4)** chez Audi : c'est la finition S d'une e-tron GT. Le
  seau ne contiendra jamais une e-tron GT ordinaire. Observé tel quel,
  je le laisse tel quel.
- **« Trafic Combi » → Trafic (5)** et **« Fiorino Combi » → Fiorino (2)** :
  la réserve du 3a tient. Un Trafic Combi est un monospace neuf places, le
  Trafic de leboncoin est surtout un fourgon. Même nom, deux usages, deux prix.
- Le libellé d'une Dodge se lit **« Dodge Challenger 1973 »** : le millésime
  reste dans la version, puisqu'il y est. Ce n'est pas faux, c'est inhabituel.

## 6.5 Quarante déductions tirées au hasard parmi les nouvelles

| marque | année | version observée | modèle déduit | libellé rendu |
|---|---|---|---|---|
| Mercedes | 2020 | CLA Shooting Brake 45 AMG S 421ch 4Matic+ 8G-DCT | cla | Mercedes CLA Shooting Brake 45 AMG S 421ch 4Matic+ 8G-DCT |
| Renault | 2007 | Grand Scenic 1.9 dCi 130ch Dynamique 7 places | grand scenic | Renault Grand Scenic 1.9 dCi 130ch Dynamique 7 places |
| Dacia | 2026 | Bigster 1.2 hybrid-G 150ch Journey 4x4 | bigster | Dacia Bigster 1.2 hybrid-G 150ch Journey 4x4 |
| Renault | 2011 | Grand Scenic 1.5 dCi 110ch FAP Authentique 7 places | grand scenic | Renault Grand Scenic 1.5 dCi 110ch FAP Authentique 7 places |
| Citroën | 2001 | Picasso 2.0 HDi90 | **xsara picasso** | Citroën Xsara Picasso 2.0 HDi90 |
| Renault | 2021 | Grand Scenic 1.3 TCe 140ch Intens - 21 | grand scenic | Renault Grand Scenic 1.3 TCe 140ch Intens - 21 |
| Ford | 2023 | Ranger 3.0 EcoBoost V6 292ch Double Cabine Raptor BVA10 | ranger | Ford Ranger 3.0 EcoBoost V6 292ch Double Cabine Raptor BVA10 |
| BMW | 2019 | M2 Coupé 3.0 410ch Competition | **m2** | BMW M2 Coupé 3.0 410ch Competition |
| Peugeot | 2013 | Outdoor_Partner Tepee 1.6 HDi92 FAP Outdoor | partner tepee | Peugeot Partner Tepee 1.6 HDi92 FAP Outdoor |
| Renault | 2011 | Grand Scenic 1.6 dCi 130ch energy Exception eco² 5 places | grand scenic | Renault Grand Scenic 1.6 dCi 130ch energy Exception eco² |
| Opel | 2012 | Zafira Tourer 1.4 Turbo 120ch Enjoy Start&Stop | zafira tourer | Opel Zafira Tourer 1.4 Turbo 120ch Enjoy Start&Stop |
| Aston Martin | 2022 | DBS Volante V12 5.2 725ch Superleggera BVA8 | **dbs** | Aston Martin DBS Volante V12 5.2 725ch Superleggera BVA8 |
| Maserati | 2025 | MC20 Cielo 3.0 V6 Biturbo 630ch | mc20 cielo | Maserati MC20 Cielo 3.0 V6 Biturbo 630ch |
| Toyota | 2022 | Aygo X 1.0 VVT-i 72ch Collection S-CVT | aygo x | Toyota Aygo X 1.0 VVT-i 72ch Collection S-CVT |
| Jeep | 2026 | Avenger Electrique 156ch 115kW Black Edition | avenger | Jeep Avenger Electrique 156ch 115kW Black Edition |
| Audi | 2026 | RS3 Sportback 2.5 TFSI 400ch quattro Compétition Limited | **rs3** | Audi RS3 Sportback 2.5 TFSI 400ch quattro Compétition Limited |
| Citroën | 2007 | Picasso 1.6 HDi92 | xsara picasso | Citroën Xsara Picasso 1.6 HDi92 |
| Citroën | 2007 | Picasso 1.6 HDi92 | xsara picasso | Citroën Xsara Picasso 1.6 HDi92 |
| Citroën | 2008 | Base_Picasso 1.6 HDi110 FAP | xsara picasso | Citroën Xsara Picasso Base 1.6 HDi110 FAP |
| Maserati | 2025 | MC20 Cielo 3.0 V6 Biturbo 630ch | mc20 cielo | Maserati MC20 Cielo 3.0 V6 Biturbo 630ch |
| Aston Martin | 2010 | DBS Volante V12 5.9 Touchtronic2 | dbs | Aston Martin DBS Volante V12 5.9 Touchtronic2 |
| Citroën | 2004 | Picasso 2.0 HDi90 Exclusive | xsara picasso | Citroën Xsara Picasso 2.0 HDi90 Exclusive |
| **Dodge** | 2019 | **1972 Challenger Challenger** | **challenger** | Dodge Challenger 1972 |
| BMW | 2015 | Série 2 Coupé 218dA 143ch M Sport | **serie 2** | BMW Série 2 Coupé 218dA 143ch M Sport |
| Mercedes | 2014 | Business_GLA 200 d Business 4Matic 7G-DCT | gla | Mercedes GLA 200 d Business 4Matic 7G-DCT |
| Renault | 2008 | Expression_Grand Modus 1.5 dCi 70ch Expression | grand modus | Renault Grand Modus 1.5 dCi 70ch Expression |
| Renault | 2007 | Grand Scenic 2.0 dCi 150ch Dynamique 5 places | grand scenic | Renault Grand Scenic 2.0 dCi 150ch Dynamique 5 places |
| Citroën | 2004 | Picasso 1.6 HDi110 Pack | xsara picasso | Citroën Xsara Picasso 1.6 HDi110 Pack |
| Seat | 2008 | Preference II_Altea XL 1.9 TDI105 Preference | altea xl | Seat Altea XL Preference II 1.9 TDI105 Preference |
| Citroën | 2006 | Collection_Picasso 1.6 HDi110 Collection | xsara picasso | Citroën Xsara Picasso 1.6 HDi110 Collection |
| Land Rover | 2016 | Range Rover Evoque 2.0 TD4 150 Business Mark III | range rover evoque | Land Rover Range Rover Evoque 2.0 TD4 150 Business Mark III |
| Citroën | 2002 | Picasso 2.0 HDi90 Exclusive | xsara picasso | Citroën Xsara Picasso 2.0 HDi90 Exclusive |
| Dacia | 2025 | Jogger 1.0 TCe 110ch Extreme 7 places -24 | jogger | Dacia Jogger 1.0 TCe 110ch Extreme 7 places -24 |
| Land Rover | 2025 | Range Rover Sport 3.0 P460e 460ch PHEV Dynamic HSE | range rover sport | Land Rover Range Rover Sport 3.0 P460e 460ch PHEV Dynamic HSE |
| Mercedes | 2017 | CLA 200 d Fascination 4Matic 7G-DCT | cla | Mercedes CLA 200 d Fascination 4Matic 7G-DCT |
| Citroën | 2003 | C3 Pluriel 1.4 | c3 pluriel | Citroën C3 Pluriel 1.4 |
| Citroën | 2003 | Base_C3 Pluriel 1.6 16v SensoDrive | c3 pluriel | Citroën C3 Pluriel Base 1.6 16v SensoDrive |
| Renault | 2007 | Grand Scenic 1.5 dCi 105ch FAP Expression 7 places | grand scenic | Renault Grand Scenic 1.5 dCi 105ch FAP Expression 7 places |
| Citroën | 2005 | Picasso 1.6 HDi110 FAP | xsara picasso | Citroën Xsara Picasso 1.6 HDi110 FAP |
| Aston Martin | 2024 | DBX 4.0 V8 biturbo 707ch BVA9 | dbx | Aston Martin DBX 4.0 V8 biturbo 707ch BVA9 |

## 6.6 Les deux lignes neuves du rapport de santé, sur la base réelle

Sortie réelle de `python scripts/data_health.py` après recanonisation :

```
Têtes de version fréquentes parmi les « Autres » non résolues (>= 5 annonces
— un modèle à ajouter au fichier partagé, ou, s'il y est déjà, ce que la
garde du mot suivant refuse) :
  - bmw / xm (16 annonces) — ex. « XM 4.4 V8 748ch (585+197) Label Red »
  - land rover / range rover sport (12) — ex. « Range Rover Sport 4.4 P635 635ch MHEV SV Edition Two »
  - ferrari / purosangue (10) — ex. « Purosangue 6.5 V12 725ch »
  - mercedes / gle (9) — ex. « GLE 53e AMG 449ch+170ch Hybride 4Matic+ »
  - toyota / corolla verso (8) — ex. « Corolla Verso 136 D-4D Luna 7 places »
  - mercedes / classe ml (7) — ex. « Pack Luxury_Classe ML 500 Pack Luxe »
  - dacia / spring (6) · mercedes / cla (6) · mercedes / glc (6)
  - mini / clubman cooper (6) · bmw / serie 2 activetourer (5)
  - mini / clubman cooper d (5)

Modèles dont un site dit le début de ce que l'autre dit en entier
(candidats à un alias de modèle) :
  - peugeot : expert (lc 3) / expert combi (lbc 33)
  - citroen : nemo (lc 1) / nemo combi (lbc 30)
  - land rover : discovery (lbc 25) / discovery sport (lc 1)
  - ford : tourneo (lbc 10) / tourneo connect (lc 1)
  - hyundai : ioniq (lbc 4) / ioniq 5 (lc 1)
```

**Deux choses à lire là-dedans.** D'abord, la paire « ferrari : 812 / 812
superfast » a **disparu** de la seconde liste : l'alias l'a résolue, et la
ligne se nettoie toute seule. Ensuite, la première liste ne propose plus aucun
modèle absent du fichier — **les douze lignes qui restent sont toutes des
modèles qui y sont déjà** : c'est la garde du §6.1 qui les refuse, et c'est
la mesure de ce qu'un mot de toi rapporterait.

Et la ligne du 3a monte comme promis : *« modèle déduit de la version : 20,7 %
des annonces sans modèle du site (1 006), 3 848 restent non précisées »* —
contre 2,9 % et 142 au lot précédent.

---

## 7. Tests — 666, dont 46 neufs, et 47 mutations

`cd api && ./.venv/bin/pytest tests/ -q` → **666 passés** (620 avant ce lot).

| fichier | tests |
|---|---|
| `tests/test_model_catalog.py` (neuf) | 11 |
| `tests/test_version_heads.py` (neuf) | 8 |
| `tests/test_inference.py` | +9 |
| `tests/test_data_health.py` | +8 |
| `tests/test_data_health_text.py` | +4 |
| `tests/test_taxonomy.py` | +3 |
| `tests/test_model_vocabulary.py` | +1 |
| `tests/test_naming.py`, `test_spelling.py` | +1 chacun |

**Chaque test nomme la ligne de production qui le fait rougir, et je l'ai
prouvé en la cassant.** 47 mutations, une ligne à la fois, remises en place
après coup, suite entière rejouée à chaque fois. Le harnais est dans le
scratchpad (`mutate3b.py`), il se rejoue en une commande.

**Quatre sont restées vertes au premier passage**, et une cinquième a été
tuée par le mauvais fichier. Toutes corrigées :

1. `load` privé de `with_catalog` — aucun test ne vérifiait que le fichier
   atteint la **production**. Sans lui, tout le lot restait sur l'étagère et
   666 tests restaient verts. C'était le trou le plus grave.
2. `compute` privé des deux sections neuves — le rapport les calculait sans
   les assembler. Deux mutations, un seul test manquant.
3. `_POWER` retiré de `version_heads` — le test passait quand même, parce que
   `_ENGINE_CODE` reconnaît « 45ch » aussi. La seule différence observable est
   en **première** place, où `_ENGINE_CODE` se garde : « 55ch Pulse » (une
   Smart réelle) ne nomme aucun modèle. Test réécrit là-dessus.
4. `_DECIMAL` retiré — mon exemple choisissait « 1.6 BlueHDi », où le sigle
   moteur fermait la tête de toute façon. Réécrit sur « C5 Aircross 1.6 130ch
   Feel », où la cylindrée est la seule frontière.

Les 47 mutations : `resolved` sans renommage, sans condition d'année,
toujours bloquante, acceptant une année manquante ; le millésime non sauté,
sauté sans condition, sauté avant la tête ; la redite non absorbée, et la
garde levée après elle ; `with_catalog` ne versant pas les modèles créés,
écrasant ceux des sites, perdant le renommage, le posant à l'identique,
perdant la limite d'année, perdant les mots du fichier, oubliant la section
des finitions ; `written_heads` muet ; les alias de modèle non lus, non
appliqués ; `load` sans catalogue ; l'année non passée à la déduction ; le
modèle observé retiré du texte de recherche ; `naming` ne retirant pas l'autre
écriture ; `spelling` ignorant l'orthographe des modèles créés ; les six
frontières de `version_heads`, sa tête vide rendue comme un mot, sa version
illisible rendue quand même, son préfixe de finition compté ; le rapport
proposant des têtes rares, ne les comptant pas, reproposant des annonces déjà
résolues ou de marque inconnue, comparant les préfixes en sous-chaîne,
acceptant des sites non disjoints, comptant les modèles déduits comme
déclarés ; les deux sections retirées de `compute` ; et les quatre lignes de
texte, chacune dans ses deux branches.

**Aucun test ne lit l'horloge réelle** : `NOW` est posé à la main partout.
`infer_model` n'a pas d'horloge du tout — l'année vient de l'annonce.

## 8. Ce que le lot suivant hérite

- **Les 174 que la garde refuse** (§6.1) — 141 annonces, un mot de toi.
- **Les modèles déclarés à mot de carrosserie** (§6.2) — ta décision.
- **Les marques inconnues** : MG, Ineos, BYD, Xpeng, et des répliques Cobra que
  leboncoin range en « Autres / Autres ». 21 annonces aujourd'hui, et ça
  montera : c'est un lot « vocabulaire de marques », pas de modèles.
- **3 493 annonces sans aucune version.** Aucun travail sur le texte ne les
  atteindra. Si elles comptent, il faut les relire sur le site.
- **La boucle est fermée** : le rapport de santé propose maintenant lui-même
  les modèles à ajouter au fichier, et les alias entre sites à écrire. La
  liste de 93 candidats qui a fait ce lot s'est écrite à la main une fois ;
  elle se réécrira toute seule à chaque passage du rapport.

---

# Décisions d'Alexis du 2026-09-20

Appliqué sur `adscope`, **55 783 annonces**, branche `feat/api`. **685 tests**
Python (19 neufs), la restriction et chaque alias prouvés en cassant la ligne
de production qui les porte. Aucune migration. Base recanonisée, API relancée
par label (`fr.adscope.api`).

**La somme de contrôle des champs observés n'a pas bougé d'un bit** —
`brand, model, version, fingerprint, year, mileage`, 55 783 lignes :
`a3c9076be62bb0831fdc4cd02a5c0b37` avant comme après.

## Décision 1 — un mot purement numérique après un modèle du fichier

**Remesuré avec la restriction que tu as posée** (« seulement pour les
modèles du fichier », pas le vocabulaire appris des sites), en comparant le
code d'avant et d'après sur le même instantané de base :

| | avant | après | delta |
|---|---:|---:|---:|
| « Autres » résolues (total) | 1 006 | **1 086** | **+80** |
| déductions sur le modèle connu (population 17 905) | 14 086 | 14 089 | +3 |
| justes | 13 782 | 13 782 | 0 |
| contradictoires | 304 | 307 | **+3** |
| précision hors désaccords légitimes | 100 % | **100 %** | — |

**+80, pas +141** : la restriction au « purement numérique » (regex
`^\d+([.,]\d+)?$`) laisse dehors les codes moteur qui mêlent lettres et
chiffres (« 53e », « 218da », « 45ch », « 120ch »), qui comptaient dans la
mesure large du lot précédent. +79 viennent de la règle elle-même ; +1 vient
d'un effet de bord corrigé en cours de route (§ »ce que j'ai dû corriger »).

**Les 3 contradictions, toutes** — zéro n'est une lecture fausse, les trois
sont des annonces où **les deux colonnes du site se contredisent déjà** (le
modèle déclaré n'est pas celui que la version nomme, indépendamment de toute
règle numérique) :

| marque | modèle déclaré | version | modèle que la règle lit |
|---|---|---|---|
| Mercedes | Classe B | Sensation_GLA 180 Sensation | GLA |
| Mercedes | Classe A | Classic_Classe ML 320 Classic | Classe ML |
| Mercedes | Classe E | Pack Luxury_Classe ML 420 CDI Pack Luxe | Classe ML |

**La porte des 99 % tient**, largement : la précision hors désaccords
légitimes reste 100 %, et les 3 contradictions sont la même catégorie déjà
comptée dans les 304 de la mesure d'origine (deux colonnes d'un site qui ne
s'accordent pas), jamais une faute de la règle.

**Les deux pièges tenus par un test** (`tests/test_inference.py`) :
- un modèle lui-même numérique (« 512 ») ne se perd pas parce que le mot qui
  le suit est, lui aussi, un chiffre — `512 5.0 M` reste `512` ;
- le plus long gagne toujours même quand le mot qui suit le plus court est
  numérique — « Série 2 » et « Série 2 ActiveTourer » ne se mélangent pas,
  parce que la sélection du plus long précède la garde numérique dans
  `_named`.

Implémentation : `KnownModels.numeric_heads` (nouveau champ), alimenté
uniquement par les têtes de `modeles_crees` dans `model_catalog.with_catalog`
— jamais par le vocabulaire mesuré des sites, ni par un alias de modèle. Vingt
nouvelles déductions tirées au hasard parmi les 80 :

| marque | année | version | modèle déduit |
|---|---|---|---|
| Toyota | 2007 | Sol_Corolla Verso 136 D-4D Sol 5 places | corolla verso |
| Mercedes | 2020 | GLC 300 e 211+122ch AMG Line 4Matic 9G-Tronic Euro6d-T-EVAP-ISC | glc |
| Ferrari | 2024 | Purosangue 6.5 V12 725ch | purosangue |
| BMW | 2023 | XM 4.4 V8 653ch | xm |
| Porsche | 1962 | 356B 356 B 1600 Super 90 | 356b |
| Mercedes | 2026 | GLE 53 AMG HYBRID 449ch+184ch 4Matic+ 9G-Speedshift TCT | gle |
| Land Rover | 2026 | Range Rover Sport 4.4 P635 635ch MHEV SV Edition Two | range rover sport |
| BMW | 2023 | XM 4.4 V8 653ch | xm |
| Toyota | 2008 | Corolla Verso 136 D-4D Sol 7 places | corolla verso |
| Mercedes | 2006 | Pack Luxury_Classe ML 500 Pack Luxe | classe ml |
| Mercedes | 2006 | Pack Luxury_Classe ML 500 Pack Luxe | classe ml |
| Land Rover | 2024 | Range Rover Sport 4.4 P635 635ch MHEV Dynamic SV Edition One Flux Silver Gloss | range rover sport |
| Land Rover | 2019 | Range Rover Sport 5.0 V8 S/C 575ch SVR Mark VIII | range rover sport |
| Land Rover | 2023 | Range Rover Sport 4.4 P530 530ch First Edition | range rover sport |
| BMW | 2023 | XM 4.4 V8 748ch (585+197) Label Red | xm |
| Ferrari | 2025 | Purosangue 6.5 V12 725ch | purosangue |
| Mercedes | 2011 | Classe ML 300 CDI BE Grand Edition | classe ml |
| Mercedes | 2015 | CLA 180 Fascination | cla |
| Mercedes | 2022 | GLC 400 e Hybrid 381ch AMG Line 4Matic 9G-Tronic | glc |
| Ferrari | 1992 | 512 5.0 M | 512 |

## Décision 2 — quatre alias de modèle

Vérifiés sur la donnée avant d'être posés, comme demandé.

| alias | vérification | condition | effectif avant | effectif après fusion |
|---|---|---|---|---|
| Citroën « Picasso » → Xsara Picasso | les 14 déclarés par La Centrale sont tous datés 2000-2009, versions « 2.0 HDI », « 1.6 HDI 110 »… aucune trace C4 (BlueHDi, PureTech) | année ≤ 2010 | 14 (déclaré) + 118 (déduit) | **132** |
| Ferrari « F8 Tributo » + « F8 » → F8 | même famille, mêmes années (2020-2022) ; « Tributo » devient une finition (comme « Base »), le mot reste visible dans le libellé | aucune | 5 + 5 (déduits, aucun des deux n'est déclaré par un site) | **10** |
| Kia « Cee'd »/« Ceed »/« Pro Cee'd » → Ceed | Cee'd 2007-2014, Ceed 2019-2025, Pro Cee'd (coupé) 2007-2010 — Kia a renommé l'écriture officielle en 2018, l'écriture courante l'emporte ; « XCeed » (crossover, 6 annonces) est un **modèle différent**, non touché | aucune | 18+6+6 (déduits) + 1 « CEE D » (déclaré, 2007) | **31** |
| Opel « Grandland X » → Grandland | les 6 déclarés vont de 2018 à 2020, les 3 déduits de 2020 à 2026 — même voiture, Opel a retiré le X en 2021, aucun chevauchement contradictoire | aucune | 6 (déclaré) + 3 (déduit) | **9**, +1 « Autres » restauré (§ ci-dessous) = **10** |

**Le compte des modèles déclarés inchangés, avant/après** : 1 117 paires
(marque, modèle déclaré) distinctes en base. **Exactement 3 changent de clé
canonique** — Citroën/PICASSO, Kia/CEE D, Opel/Grandland X — les 1 114 autres
sont identiques bit à bit, vérifié en rejouant `taxonomy.key` de l'ancien code
et du nouveau sur les mêmes 1 117 paires.

**La recherche ne perd rien**, mesuré annonce par annonce sur les 55 783,
avant/après :

| requête | avant | après |
|---|---:|---:|
| `q=f8 tributo` | 5 | **5** |
| `q=pro cee'd` | 6 | **6** |
| `q=grandland x` | 7 | **7** |
| `q=picasso` | 1 278 | **1 278** |
| `q=xsara picasso` | 118 | **132** *(gagné)* |

## Ce que j'ai dû corriger en cours de route

`model_vocabulary.load` bâtit le vocabulaire de la déduction sur
`taxonomy.key`, qui applique déjà les alias — et un alias sans condition
d'année (Grandland X) se serait donc appliqué **avant** le comptage des
têtes, effaçant la tête à deux mots « grandland x » du vocabulaire (le mot
« x » seul ne suit jamais assez de modèles pour être un qualificatif mesuré).
Une annonce « Autres » dont la version commence par « Grandland X » aurait
perdu sa déduction — pas une donnée fausse, une régression silencieuse d'une
annonce. `model_catalog._alias_heads` réinjecte la tête déclarée de chaque
alias dans le vocabulaire de la déduction, exactement comme `modeles_crees`
le fait déjà pour ses propres têtes — jamais dans `numeric_heads`, la
décision 1 ne vaut que pour le fichier. Deux tests le tiennent
(`test_an_alias_heads_multi_word_head_survives_its_own_alias`,
`test_an_alias_head_never_gets_the_numeric_word_exception`), et c'est pour ça
que le compte final est 1 086 (+80) et non 1 085 (+79).

## « Autres » résolues, avant/après

| | avant (lot 3b) | après (ces décisions) |
|---|---:|---:|
| modèle déduit (`canon_model_source = 'version'`) | 1 006 | **1 086** |
| non précisées (`canon_model = 'autres'`) | 3 848 | **3 768** |

## Appliqué à la base réelle

```
pg_dump -Fc adscope -f ~/adscope-backups/adscope-20260920-180317-avant-decisions-lot3b.dump
python scripts/recanonize.py --all → 131 annonces recanonisées, < 1 s
python scripts/recanonize.py --all → 0 annonce (rejoué, rien à faire)
launchctl kickstart -k gui/501/fr.adscope.api
```

Somme de contrôle des champs observés (`brand`, `model`, `version`,
`fingerprint`, `year`, `mileage`, 55 783 annonces, `ORDER BY id`) :

```
avant  a3c9076be62bb0831fdc4cd02a5c0b37
après  a3c9076be62bb0831fdc4cd02a5c0b37
```

**Elle n'a pas bougé d'un bit.**

## Tests — 685, dont 19 neufs

`cd api && ./.venv/bin/pytest tests/ -q` → **685 passés** (666 avant ces
décisions). Chaque test nouveau nomme la ligne de production qui le fait
rougir, prouvé en la cassant à la main (le gate numérique dans `_named`, la
condition d'année dans `canonical`, `numeric_heads` et `_alias_heads` dans
`with_catalog`) puis restaurée. Aucun ne lit l'horloge.

| fichier | tests neufs |
|---|---:|
| `tests/test_inference.py` | 5 (décision 1, dont les deux pièges) |
| `tests/test_model_catalog.py` | 8 (décision 1 + la fusion Kia/F8 réelle + `_alias_heads`) |
| `tests/test_taxonomy.py` | 5 (l'alias Picasso sous condition d'année) |
| `tests/test_naming.py`, `test_spelling.py` | 1 chacun |

## Fichiers touchés

`api/adscope_api/inference.py` (garde numérique restreinte au fichier),
`model_catalog.py` (`numeric_heads`, `_alias_heads`, alias sous condition
d'année), `taxonomy.py` (`canonical`/`key`/`search_text` prennent `year`),
`naming.py` + `market_items.py` + `feed_query.py` (le libellé aussi),
`shared/vehicle-aliases.json` (3 alias neufs, « Tributo » en finition, fusion
Kia). Aucun fichier ne dépasse 150 lignes.
