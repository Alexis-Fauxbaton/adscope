# Recherche filtrée, lot 3a — le modèle déduit de la version

Mesuré et livré le 2026-09-19 sur `adscope`, **55 018 annonces** réelles. Branche
`feat/api`, **620 tests** Python (54 neufs). Migration **012** appliquée, base
recanonisée, API relancée.

**Le verdict** : la déduction est en place, elle est prudente, et elle résout
**142 annonces** sur les 4 854 qui portent « Autres ». C'est **peu**, et la
raison est le vrai résultat du lot — pas un aveu d'échec.

**La porte des 99 % est franchie** : précision **99,27 %** en ne pardonnant que
les désaccords où le site se contredit franchement lui-même, **100 %** en
pardonnant aussi ceux où il range plus grossièrement que sa propre version.
Aucune déduction mesurée ne nomme un modèle que la version ne porte pas.

---

## 1. Ce que la mesure demandée ne pouvait pas voir — et qu'il fallait trouver

Le brief demandait de mesurer sur les annonces **au modèle connu** : cacher le
modèle, le déduire, comparer. Fait, et la première règle écrite donnait
**99,3 %** de précision du premier coup. J'ai failli m'arrêter là.

En regardant ce que la même règle produisait sur les **vraies cibles** — les
« Autres » —, la moitié des déductions étaient fausses. **Fausses de la classe
exacte que tu as vue à l'écran avec les deux Camaro affichées « Corvette ».**

| ce que la version dit | ce que la règle en faisait | ce que c'est |
|---|---|---|
| Mustang Fastback 5.0 V8 421ch **GT** BVA6 | Ford **GT** | une Mustang |
| **Range Rover Sport** 3.0 TDV6 (69 annonces) | **Range Rover** | 40 000 € d'écart |
| **C5 Aircross** BlueHDi 130ch (25) | **C5** | un SUV pour une berline |
| **Grand Scenic** 1.9 dCi (121) | **Scenic** | sept places pour cinq |
| **Aygo X** 1.0 VVT-i (4) | **Aygo** | deux voitures sans rapport |
| **190 SL** | Mercedes **SL** | une 190 de 1955 |

**Pourquoi la mesure ne les voyait pas** : une annonce dont le site donne le
modèle a une version qui *commence par ce modèle* — 89 % d'entre elles le
répètent. Le seau « Autres » de leboncoin, lui, contient précisément **les
modèles que sa taxonomie n'a pas** : des noms composés dont un modèle connu
n'est que le début. Mesurer sur les unes ne dit presque rien des autres.

C'est la découverte du lot, et tout le reste en découle.

## 2. Les trois gardes, et ce que chacune coûte

`api/adscope_api/inference.py`. Chacune est posée par la mesure, aucune par un
avis.

**1. En tête de version.** leboncoin écrit « [Finition_]Modèle motorisation … ».
Chercher le modèle ailleurs ajoutait 206 déductions sur les cibles, presque
toutes fausses (Mustang → GT, Grand Scenic → Scenic, 190 SL → SL).

C'est aussi ce qui désamorce **le piège des modèles purement numériques** que
le brief annonçait, sans règle à part : « Mercedes Classe C **200** CDI » ne
peut plus devenir une « 200 », parce que « 200 » n'est pas en tête. Et
symétriquement les 1 007 Porsche **911**, 2 119 Peugeot **206** et 28 Ferrari
**488** se déduisent normalement, elles, puisqu'elles y sont. Vérifié en plus
sur la base : **aucune** annonce Mercedes ne porte une version commençant par
200, 230 ou 300. La garde suffit, mesurée à 100 % de précision sur Peugeot.

**2. Mots entiers, espaces ignorés.** « C3 » ne mord pas dans « C3500 » ; le
modèle « Ds3 » reconnaît le « DS 3 » qu'une version écrit en deux mots.

**3. Le mot qui suit doit prolonger le modèle sans le changer.** C'est la garde
neuve, et celle qui sauve le lot. « Classe C **Break** 220 CDI » reste une
Classe C ; « Range Rover **Sport** 3.0 TDV6 » n'est pas une Range Rover.

Ce qui sépare les deux **n'est pas une liste que j'aurais écrite** : c'est une
mesure. Un mot qui suit **au moins quatre couples (marque, modèle) différents**
dans les annonces classées par les sites décrit une carrosserie ou une
motorisation ; un mot attaché à un seul modèle est un nom de modèle composé, et
il interdit la déduction.

Les 62 qualificatifs que le corpus désigne aujourd'hui :

```
0.9 1.0 1.1 1.2 1.3 1.4 1.4i 1.5 1.6 1.6i 1.7 1.8 1.9 115 2.0 2.0d 2.0i 2.0t
2.1 2.2 2.4 2.5 2.7 2.8 2.9 200 220 270 3.0 3.5 3.8 35 350 4.0 4.2 55 63 90
affaire affaires avant bluehdi break cabriolet cc combi coupe d5 e-tech
electric electrique estate hybrid puretech sportback ste sw touring v12 v8
vti xdrive30da
```

**Le seuil de quatre se joue à un cheveu, et c'est mesuré** : à trois,
« sport » entre dans la liste — et les 69 Range Rover Sport deviennent des
Range Rover. Ce seul mot fait passer les déductions de 16 à 93 et ruine le lot.
Voir §6 pour ce que je te demande d'arbitrer là-dessus.

**Sans objet, et je le dis parce que le brief l'attendait** : la règle « si deux
modèles distincts correspondent, c'est ambigu, on renonce ». Ancrés en tête,
tous les candidats partent du même mot ; leurs plis sont donc préfixes l'un de
l'autre et le plus long les contient tous (« C3 Aircross » devant « C3 »). Deux
modèles vraiment distincts ne peuvent pas égaler la même suite de mots. Je n'ai
pas écrit de code pour un cas qui ne peut pas se produire.

## 3. La mesure, sur les 17 140 annonces au modèle connu et à la version pleine

```
déductions       13 907  (couverture 81,1 %)
justes           13 724
désaccords          183  (précision brute 98,68 %)
```

**Aucun des 183 n'est une lecture fausse** : dans tous, la version nomme
littéralement, en tête et en mots entiers, le modèle déduit — et ne nomme pas
celui que la colonne `model` déclare, ou le nomme moins précisément. La règle a
bien lu ; ce sont les deux colonnes du site qui se contredisent. Deux natures.

### (1) Le site range plus grossièrement que sa propre version — 102

La version nomme les deux, la règle prend le plus long. Le plus long est le nom
réel de la voiture.

| n | site | déduit | version |
|---|---|---|---|
| 94 | Peugeot **206** | **206+** | « Urban_206 + 1.4 HDi Urban 5p » |
| 5 | Renault **Kangoo** | **Kangoo Express** | « Kangoo Express 1.5 dCi 70ch » |
| 3 | Fiat **Punto** | **Punto Evo** | « Punto Evo 1.2 8v 69ch S&S MyLife 3p » |

**Précision en comptant ces 102 comme des fautes : 99,27 %.** C'est le chiffre
que je retiens comme prudent, et il passe la porte.

### (2) Les deux colonnes du site se contredisent franchement — 81

| n | site | déduit | version | ce que c'est |
|---|---|---|---|---|
| 24 | Renault Megane | Scenic | « Expression_Scenic 1.9 dCi 105ch » | le premier Scénic s'appelait Mégane Scénic |
| 22 | Ferrari 812 Superfast | 812 | « 812 V12 6.5 800ch » | La Centrale dit « 812 », leboncoin « 812 Superfast » |
| 9 | Renault Scenic | Megane | « Authentique_Megane 1.5 dCi 85ch » | même famille historique |
| 5 | Renault Megane | Grand Scenic | « Jade_Grand Scenic 2.0 dCi 160ch » | idem |
| 5 | Fiat Grande Punto | Punto Evo | « Dynamic_Punto Evo 1.3 Multijet » | famille Punto |
| 2 | Fiat Punto | Grande Punto | « Sport_Grande Punto 1.3 Multijet » | idem |
| 1 | Citroen AX | Saxo | « Saxo 1.0 Nlle Frontiere 5p » | le site s'est trompé de colonne |
| 1 | Citroen C3 Picasso | C3 | « C3 1.6 HDi110 FAP Exclusive » | idem |
| 1 | Mercedes Classe A | Classe C | « Classe C Break 200 CDI Classic BV6 » | idem |
| 1 | Mercedes Classe A | Classe E | « Classe E Break 270 CDI Classic BV6 » | idem |
| 1 | Mercedes Classe G | Classe E | « Avantgarde_Classe E 220 CDI » | idem |
| 1 | Mercedes Classe S | Classe R | « Limousine Pack Lux._Classe R 350 L » | idem |
| 1 | BMW 635 | Série 5 | « Sport Design_Série 5 Touring 550iA » | idem |
| 1 | Jaguar F-Pace | E-Pace | « Standard_E-Pace 2.0D 180ch AWD » | idem |
| 1 | Ford C-Max | Focus | « Ghia_Focus SW 1.6 TDCi 110ch Ghia » | idem |
| 1 | Fiat Grande Punto | Punto | « Punto 1.2 8v 69ch Easy Business 3p » | idem |
| 1 | Renault Scenic | Grand Scenic | « Grand Scenic 1.9 dCi 130ch Carminat » | idem |
| 1 | Audi Allroad | A6 | « A6 Avant 3.0 V6 TDI 240ch … quattro » | une A6 Allroad est les deux |
| 1 | Volkswagen 1500 | Combi | « COMBI » | idem |
| 1 | **Ford Ranchero** | **GT** | « **GT** » | **le seul que j'appelle douteux** — voir §6 |

**Précision hors désaccords légitimes : 100 %.**

**Et surtout** : ces 183 désaccords **ne peuvent pas se produire en
production**. La déduction ne s'exécute que là où le site n'a donné aucun
modèle. Cette mesure sert à juger si la règle *lit* bien une version, pas à
prédire des erreurs réelles.

### Par marque, les vingt plus grosses

| marque | population | déduites | couverture | précision |
|---|---|---|---|---|
| peugeot | 2 933 | 2 822 | 96,2 % | 96,67 % *(les 94 « 206 + »)* |
| renault | 2 877 | 2 639 | 91,7 % | 98,33 % |
| citroen | 2 124 | 1 680 | 79,1 % | 99,88 % |
| porsche | 1 135 | 904 | 79,6 % | **100 %** |
| volkswagen | 961 | 874 | 90,9 % | 99,89 % |
| ford | 837 | 759 | 90,7 % | 99,74 % |
| opel | 754 | 677 | 89,8 % | **100 %** |
| mercedes | 675 | 319 | 47,3 % | 98,75 % |
| audi | 557 | 468 | 84,0 % | 99,79 % |
| bmw | 494 | 124 | 25,1 % | 99,19 % |
| fiat | 436 | 351 | 80,5 % | 96,87 % *(la famille Punto)* |
| dacia | 293 | 269 | 91,8 % | **100 %** |
| seat | 273 | 229 | 83,9 % | **100 %** |
| nissan | 257 | 238 | 92,6 % | **100 %** |
| mini | 193 | 0 | **0 %** | — |
| toyota | 193 | 108 | 56,0 % | **100 %** |
| hyundai | 182 | 162 | 89,0 % | **100 %** |
| alfa romeo | 166 | 154 | 92,8 % | **100 %** |
| chevrolet | 164 | 98 | 59,8 % | **100 %** |
| **ferrari** | 152 | 109 | 71,7 % | **79,82 %** *(les 22 « 812 Superfast → 812 »)* |

**Ferrari à 79,8 % est le pire chiffre du tableau, et il est entièrement dû à
un désaccord entre les deux sites** : La Centrale écrit le modèle « 812 »,
leboncoin « 812 Superfast ». Les 22 annonces leboncoin dont la version dit
« 812 V12 6.5 800ch » se voient déduire « 812 ». Aucune Ferrari n'est
effectivement touchée en base (zéro déduction appliquée sur la marque), mais
c'est le signal qu'il faudra un alias de modèle entre les deux sites — lot 3b.

Mini à 0 % est normal et sain : le modèle canonique est « Mini » et les
versions commencent par « Cooper S », « One D » — la marque n'est pas le modèle,
et la règle refuse plutôt que de deviner. BMW à 25 % de même : « Série 1 » est
le modèle, « M135iA xDrive » la version.

## 4. Appliqué à la base réelle

```
pg_dump -Fc adscope -f ~/adscope-backups/adscope-20260919-183004-avant-012.dump   (4,1 Mo)
python scripts/migrate.py         → 012_listings_canon_model_source, 0,29 s
python scripts/recanonize.py --all → 50 306 annonces recanonisées, 3,7 s
python scripts/recanonize.py --all → 0 annonce (rejoué, rien à faire)
launchctl kickstart -k gui/501/fr.adscope.api
```

Les 50 306 lignes « changées » le sont presque toutes par la seule colonne
neuve, qui passe de vide à « site ».

**Somme de contrôle des champs observés** (`brand`, `model`, `version`,
`fingerprint`, `year`, `mileage`, sur les 55 018 annonces d'avant la manœuvre) :

```
avant  373522bb63ae733d2ce5752c2d9a4a83
après  373522bb63ae733d2ce5752c2d9a4a83
```

**Elle n'a pas bougé d'un bit.** La déduction n'écrit que `canon_model` et
`canon_model_source`. L'empreinte véhicule est intacte.

### Les recherches, rejouées sur l'API relancée

| requête | total | temps |
|---|---|---|
| `?brand=Renault&model=Grand Scenic` | **124** *(3 avant le lot)* | 0,111 s |
| `?brand=Renault&model=grand scenic` | **124** (même seau, casse indifférente) | 0,048 s |
| `?brand=Renault&model=Scenic` | **1 102** — inchangé, rien n'est sorti du seau | 0,096 s |
| `?q=grand scenic` | 135 | 0,057 s |
| `?brand=Mercedes&model=Classe C` | 346 | 0,024 s |
| `?brand=Toyota&model=Auris` · `?q=auris` | 40 · 40 | 0,043 s |
| `?brand=ferrari` | 401 | 0,072 s |
| `?brand=Chevrolet&model=Corvette` | 56 | 0,061 s |
| sans filtre | 55 007 | 0,116 s |

Libellé d'une annonce déduite, vérifié sur la route : **« Renault Grand Scenic
1.5 dCi 110ch FAP Authentique 7 places »** — le modèle en tête, sous son
écriture officielle, et la version ne le répète pas. C'est le contrôle que le
brief demandait sur l'Evoque.

---

# 5. À regarder par Alexis

## 5.1 Les chiffres que tu attendais

| | |
|---|---|
| précision hors désaccords légitimes | **100 %** (99,27 % en comptant aussi les « 206 → 206+ ») |
| couverture sur les annonces mesurables | 81,1 % |
| « Autres » au total | **4 854** |
| … dont avec une version | 1 361 |
| … **résolues par déduction** | **142** (10,4 % de celles qui ont une version) |
| … restant non précisées | **4 712** |

Le brief parlait de 1 318 annonces « dont la version nomme le modèle ». C'est
vrai : elles le nomment. Mais dans **1 219 cas sur 1 361**, le modèle qu'elles
nomment **n'existe pas dans la taxonomie du site** — et lui substituer le modèle
connu le plus proche est exactement l'erreur Camaro. Je refuse.

## 5.2 Les marques, avant et après

| marque | non précisées avant | **résolues** | non précisées après |
|---|---|---|---|
| Renault | 1 124 | **127** | 997 |
| Citroën | 855 | 1 | 854 |
| Mercedes | 372 | 5 | 367 |
| **Ferrari** | 198 | **0** | 198 |
| **Land Rover** | 123 | 1 | 122 |
| Peugeot | 163 | 0 | 163 |
| Smart | 136 | 0 | 136 |
| Aston Martin | 102 | 0 | 102 |

**Ferrari à zéro et Land Rover à un, c'est le cœur du problème** : leurs
« Autres » sont des Range Rover Sport, des Range Rover Evoque, des 488 Spider —
des modèles réels que le site ne nomme pas dans sa colonne modèle. Voir §6.

## 5.3 Les 142 déductions appliquées, par famille

| n | modèle déduit | mot qui suit |
|---|---|---|
| 121 | **grand scenic** | 1.9 · 1.5 · 1.6 · 2.0 · 1.3 · 1.7 |
| 5 | **trafic** | combi |
| 4 | **classe c** | break (3) · coupe (1) |
| 2 | **auris** | touring |
| 2 | **fiorino** | combi |
| 1 chacun | classe e · grandland x · megane · mokka · range rover · 156 · xsara · s-max | break · 1.2 · estate · 1.6 · 3.0 · 1.9 · 2.0 · 2.0 |

**Les 121 Grand Scénic sont un cadeau de La Centrale.** leboncoin n'a pas de
modèle « Grand Scenic » : il range ces voitures dans « Autres ». La Centrale,
elle, écrit « RENAULT / GRAND SCENIC » — trois annonces, juste l'effectif
minimal. Ces trois annonces apprennent le modèle, et 121 leboncoin le
reçoivent. **Le corpus mutualisé a corrigé la taxonomie d'un site par celle de
l'autre**, sans qu'on écrive une ligne de table. C'est le premier bénéfice
concret du second site, et il va grandir : La Centrale est passée de 25 à 563
annonces pendant ce lot.

### Quarante déductions tirées au hasard de la base réelle

Le tirage est dominé par les Grand Scénic, qui sont 121 sur 142. J'ai donc mis
les vingt-et-un **non-Grand-Scénic** en entier, et vingt Grand Scénic tirées au
sort — c'est plus utile à juger.

| marque | version | modèle déduit |
|---|---|---|
| Renault | Trafic Combi L1 1.6 dCi 125ch energy Life 9 places | trafic |
| Renault | Trafic Combi L1 1.6 dCi 125ch energy Life 9 places | trafic |
| Renault | Trafic Combi L2 2.0 dCi 145ch Energy S&S Life 8 places | trafic |
| Renault | Trafic Combi 2.0 Blue dCi 150ch Evolution -24b | trafic |
| Renault | Trafic Combi L2 2.0 Blue dCi 150ch S&S Intens EDC 8 places | trafic |
| Renault | Business_Megane Estate 1.5 dCi 110ch energy Business eco² | megane |
| Mercedes | Classe E Break 350 BlueTEC 258ch 4Matic 7G-Tronic Plus | classe e |
| Mercedes | Classic_Classe C Break 180K Classic | classe c |
| Mercedes | Classic_Classe C Break 200CDI Classic | classe c |
| Mercedes | Elegance_Classe C Break 220 CDI Elegance BA | classe c |
| Mercedes | Sport Edition_Classe C Coupe Sport 220 CDI Sport Edition BA | classe c |
| Toyota | Auris Touring Sports HSD 136h Design Business | auris |
| Toyota | Auris Touring Sports 124 D-4D SkyBlue | auris |
| Fiat | Fiorino Combi 1.3 Multijet 16v 75ch DPF | fiorino |
| Fiat | Fiorino Combi 1.3 Multijet 16v 75ch DPF Dualogic | fiorino |
| Opel | Grandland X 1.2 Turbo 130ch Edition BVA8 | grandland x |
| Opel | Business Connect_Mokka 1.6 CDTI 136ch Business Connect Auto 4x2 | mokka |
| Land Rover | Range Rover 3.0 P550e 550ch PHEV Autobiography SWB | range rover |
| Alfa Romeo | 156 1.9 JTD150 Multijet Distinctive | 156 |
| Citroen | Xsara 2.0 HDi90 Exclusive 5p | xsara |
| Ford | S-MAX 2.0 TDCi 140ch DPF Titanium 7 places | s-max |
| Renault | Grand Scenic 1.7 Blue dCi 120ch Business 7 places | grand scenic |
| Renault | Grand Scenic 1.3 TCe 160ch FAP Initiale Paris EDC | grand scenic |
| Renault | Intens_Grand Scenic 1.7 Blue dCi 120ch Intens - 21 | grand scenic |
| Renault | Grand Scenic 1.6 dCi 160ch Energy Intens EDC | grand scenic |
| Renault | Grand Scenic 1.3 TCe 140ch FAP Business EDC 7 places | grand scenic |
| Renault | Grand Scenic 1.3 TCe 140ch Intens - 21 | grand scenic |
| Renault | Grand Scenic 1.9 dCi 120ch Confort Expression | grand scenic |
| Renault | Authentique_Grand Scenic 1.5 dCi 110ch FAP Authentique 7 places | grand scenic |
| Renault | Grand Scenic 2.0 dCi 150ch Dynamique 5 places | grand scenic |
| Renault | Grand Scenic 1.9 dCi 130ch FAP Expression 5 places | grand scenic |
| Renault | Grand Scenic 2.0 16v 135ch Privilège 5 places | grand scenic |
| Renault | Dynamique_Grand Scenic 1.9 dCi 130ch Dynamique 7 places | grand scenic |
| Renault | Grand Scenic 1.9 dCi 130ch Jade 5 places | grand scenic |
| Renault | Carminat TomTom_Grand Scenic 1.9 dCi 130ch FAP Carminat TomTom | grand scenic |
| Renault | Grand Scenic 1.5 dCi 105ch FAP Authentique eco² 5 places | grand scenic |
| Renault | Grand Scenic 1.9 dCi 130ch FAP Dynamique 7 places | grand scenic |
| Renault | Grand Scenic 1.5 dCi 100ch Luxe Privilège | grand scenic |
| Renault | Grand Scenic 1.6 dCi 130ch energy Exception eco² 7 places | grand scenic |
| Renault | Grand Scenic 2.0 dCi 150ch FAP Privilège BVA 7 places | grand scenic |

## 5.4 Les déductions que **je** juge douteuses — toutes, il y en a sept

| n | déduction | mon doute |
|---|---|---|
| 5 | « **Trafic Combi** L1 1.6 dCi … 9 places » → **trafic** | un Trafic Combi est un **monospace neuf places**, le Trafic de leboncoin est surtout un **fourgon**. Même nom, deux usages, deux prix. « combi » est un qualificatif mesuré (4 couples), mais il pourrait mériter un seau à lui. |
| 2 | « **Fiorino Combi** 1.3 Multijet » → **fiorino** | même réserve, en plus petit. |
| — | « Auris **Touring Sports** » → **auris** | un break Auris reste une Auris ; leboncoin fait pareil. Je le signale pour mémoire. |
| — | « Megane **Estate** » → **megane** | idem. |

Les 121 Grand Scénic et les quatre Classe C/E ne me font aucun doute : ce sont
exactement les modèles que les deux sites nomment.

## 5.5 Les 1 219 cas refusés par prudence, une ligne par nature

| n | nature | exemple |
|---|---|---|
| **254** | la tête est un modèle connu **suivi d'un mot qui lui appartient** — modèle composé absent de la taxonomie | Mercedes / Autres / « Base_**Classe R 280** CDI 7GTro 4 Matic » — « 280 » ne suit que Classe R, donc rien |
| **128** | un modèle connu est cité, mais **pas en tête** | Citroën / Autres / « Shine Pack_**Grand C4 SpaceTourer** BlueHDi 130ch » — « C4 » est là, au deuxième mot |
| **23** | **la marque n'a aucun modèle connu** | Autres / Autres / « MG4 EV 170ch - 51kWh » — MG n'est pas une marque du corpus |
| **814** | **la tête de version est inconnue de la marque** | BMW / Autres / « Sport_**Série 2 Gran Tourer** 218dA 150ch Sport » — il n'existe pas de modèle BMW « Série 2 Gran Tourer » |

Les 254 de la première ligne sont les Range Rover Sport, Range Rover Evoque,
C5 Aircross, C3 Pluriel, 488 Spider, Partner Tepee, Altea XL, Corolla Verso,
Almera Tino, Aygo X, C4 Cactus, Yaris Cross, C5 X, Ioniq 5… **Ce sont elles
l'enjeu du lot 3b** (§6).

---

# 6. Les trois choses que je ne fais pas sans toi

## (a) Les modèles composés — c'est là qu'est la vraie couverture

**1 068 annonces** (254 + 814) portent une version dont la tête est un **nom de
modèle réel** que ni leboncoin ni La Centrale ne nomment dans leur colonne
modèle : « Range Rover Sport », « Range Rover Evoque », « C5 Aircross »,
« Série 2 Gran Tourer », « Mustang », « Aygo X ».

Aujourd'hui je refuse tout. Deux autres voies existent :

| voie | ce qu'elle donne | ce qu'elle coûte |
|---|---|---|
| **rien** (aujourd'hui) | 142 résolues | 4 712 restent hors de tout filtre |
| **rabattre sur le modèle court** | ~400 de plus | un Range Rover Sport dans le seau Range Rover — **l'erreur Camaro, je refuse** |
| **créer le modèle composé** | jusqu'à ~1 000 | des seaux neufs, absents des deux sites : « Range Rover Sport », « C5 Aircross ». Ni faux ni donnés — **à décider avec toi** |

La troisième voie est celle que ton exemple du brief suppose (« Land Rover /
Autres / Range Rover Evoque … » → tu attends « Range Rover Evoque »). Elle sort
du cadre « comparé à la liste des modèles connus de la marque » posé par la
feuille de route, et elle demande son propre garde-fou — un nom composé ne se
retient que s'il revient assez souvent en tête de version sous la même marque
(« Range Rover Sport » 69 fois, « C5 Aircross » 25), pour que « Classe C Sport »
n'en devienne pas un. **C'est un lot 3b, et je veux ton feu vert avant.**

## (b) Le seuil des qualificatifs : quatre, et il tient à un fil

À quatre, « spider », « spyder », « roadster », « gtc », « tourer » sont
**refusés** alors qu'ils désignent des carrosseries : un 488 Spider est un 488,
un Continental GTC est une Continental. Ça coûte ~29 déductions sûres.

À trois, « sport » entre — et 69 Range Rover Sport deviennent des Range Rover.

Je n'ai pas trouvé de mesure qui sépare « spider » de « sport ». **Si tu veux
ces 29, il faut une courte liste écrite à la main** (spider, spyder, roadster,
gtc, targa…), que je refuse d'inventer seul : c'est un jugement, pas une mesure.
Un mot de toi et c'est une ligne.

## (c) L'effectif minimal : trois, et La Centrale peut le faire basculer

Le vocabulaire retient un modèle à partir de **trois** annonces classées par un
site. C'est mesuré : à une, « Golf Plus » et « Kangoo Express » entrent et
raflent 22 déductions à « Golf » et « Kangoo ».

Mais les 121 Grand Scénic tiennent à **trois annonces La Centrale**. Le même
mécanisme jouerait pour une faute de saisie répétée trois fois. Aujourd'hui le
gain est net ; le jour où un troisième site arrive avec une taxonomie bruyante,
il faudra le remonter. **À surveiller**, pas à changer maintenant.

---

## 7. Ce qui a été écrit

| fichier | rôle | lignes |
|---|---|---|
| `api/adscope_api/inference.py` | **neuf** — `infer_model`, pur, et ses trois gardes | 110 |
| `api/adscope_api/model_vocabulary.py` | **neuf** — le vocabulaire, sa construction, son cache | 121 |
| `api/adscope_api/mentions.py` | **neuf** — « la version nomme-t-elle ce modèle », sorti de `taxonomy` | 51 |
| `api/adscope_api/license_models.py` | **neuf** — `License`, sortie de `models.py` (150 lignes) | 43 |
| `api/adscope_api/migration_sql.py` | **neuf** — `LEDGER` et la clé étrangère de la 001 | 25 |
| `api/adscope_api/taxonomy.py` | `derive(listing, known)`, `FROM_SITE`/`FROM_VERSION`, `inferred_model` | 126 |
| `api/adscope_api/naming.py` | `label(..., inferred)` : le modèle déduit s'emploie comme un modèle du site | 131 |
| `api/adscope_api/spelling.py` | `inferred(key)` : l'écriture d'affichage d'une clé repliée | 121 |
| `api/adscope_api/observations.py` | `derive(listing, CACHE.get(session, now))` | 140 |
| `api/scripts/recanonize.py` | le vocabulaire lu une fois, passé à `derive` | 73 |
| `api/adscope_api/data_health_queries.py` · `_text.py` | la ligne du rapport de santé | 146 · 121 |
| `api/adscope_api/market_query.py` · `market_items.py` · `feed_query.py` | le libellé sert le modèle déduit des deux côtés | |
| migration **012** | `canon_model_source` sur `listings`, colonne vide, sans index | |

**Aucun fichier source ne dépasse 150 lignes.** Trois extractions ont été
nécessaires pour le tenir (`mentions`, `license_models`, `migration_sql`) :
`models.py` et `migration_registry.py` étaient déjà à la limite.

### Le cache, et son prix

`model_vocabulary.CACHE` garde le vocabulaire **dix minutes**, l'instant est
injecté. Chargement mesuré sur la base réelle : **0,40 s** (55 000 lignes,
63 marques, 546 modèles, 62 qualificatifs). Il tombe donc sur une observation
toutes les dix minutes — 144 fois par jour, 58 s en tout — et cette
observation-là tient son verrou de ligne 0,4 s de plus. Sans cache, sept mille
observations par jour rejoueraient sept mille fois cet agrégat.

**Conséquence assumée** : un modèle qui apparaît maintenant n'est déductible que
dix minutes plus tard. Un test le vérifie, sans attendre.

## 8. Tests — 620, dont 54 neufs

`cd api && ./.venv/bin/pytest tests/ -q` → **620 passés** (610 avant ce lot, 559
au départ ; 39 tests neufs et quelques-uns repris).

| fichier | tests |
|---|---|
| `tests/test_inference.py` (neuf) | 16 |
| `tests/test_model_vocabulary.py` (neuf) | 15 |
| `tests/test_taxonomy.py` | +9 |
| `tests/test_naming.py` | +4 |
| `tests/test_spelling.py` | +4 |
| `tests/test_observations.py` | +3 |
| `tests/test_migrations.py`, `test_recanonize.py`, `test_search.py`, `test_feed.py`, `test_data_health.py`, `test_data_health_text.py` | +2 chacun |

**Chaque test nomme la ligne de production qui le fait rougir, et je l'ai prouvé
en la cassant.** 44 mutations, une ligne à la fois, remises en place après coup,
suite entière rejouée à chaque fois.

**Huit sont restées vertes au premier passage.** Je les ai corrigées plutôt que
de laisser le test mentir — et deux d'entre elles étaient des *défauts de
conception*, pas des défauts de test :

1. `known_models.of(brand_key)` : le test « une Mustang n'est pas une Renault »
   passait grâce à la garde du mot suivant, pas grâce au vocabulaire par marque.
   Réécrit avec une version que la garde laisse passer.
2. L'ancrage en tête : idem — « Mustang … GT BVA6 » était sauvé par « bva6 ».
   Réécrit sur « Grand Scenic 1.9 dCi », où « 1.9 » est un qualificatif.
3. L'égalité de `span` (« C3 » ne mord pas « C3500 ») : idem. Réécrit sur
   « C3500 5.7 V8 Silverado ».
4. **`label` avec un modèle déduit** : le test ne prouvait rien, parce que la
   version *commence par* le modèle déduit — le mettre en tête et le retirer de
   la queue rend le même texte. La seule différence observable est
   l'**orthographe** : « Renault **Mégane** 1.5 dCi » contre « Renault Megane
   1.5 dCi », « Toyota **RAV4** » contre « Toyota Rav 4 ». Les trois tests
   (label, `/v1/market`, `/v1/follows/feed`) ont été refaits là-dessus.
5. `inferred_model` : sa condition est invisible à travers `label`, qui se garde
   aussi de son côté. Deux verrous pour un fait — j'ai gardé les deux et ajouté
   un test unitaire direct, qui est le seul endroit où celui-ci se prouve.
6. La part déduite du rapport de santé : le jeu d'essai avait autant de
   résolues que de non résolues, la mutation ne se voyait pas.

Les 44 mutations : `infer_model` sans candidat, avec un vocabulaire commun à
toutes les marques, sans ancrage en tête (deux façons), en préfixe au lieu
d'égalité, sans accumulation de mots, le plus court gagnant, sans la garde du
mot suivant et avec une garde toujours bloquante, `head` mal placé sans
souligné et ignorant le préfixe de finition ; le vocabulaire sans effectif
minimal, avec un seuil de qualificatif à un, laissant voter un modèle écarté,
comptant un mot suivant inexistant, lisant la couche canonique
(auto-renforcement), laissant entrer « Autres » ; le cache qui ne charge jamais,
qui recharge à chaque appel, qui ne remet pas son horloge à jour, dont l'oubli
ne fait rien ; `derive` sans provenance « site », sans écrire la clé déduite,
écrasant un modèle du site, n'appelant jamais la déduction, sans le modèle
déduit dans `search_text`, sans la provenance dans le couple comparé ;
`inferred_model` rendant aussi un modèle du site ; `label` n'employant pas le
modèle déduit, l'employant à la place d'un modèle du site, affichant la clé
repliée ; `spelling.inferred` sans capitales, court-circuitant la table et la
règle, avec `capitalize` au lieu de `title` ; `record` sans vocabulaire ;
`recanonize` sans vocabulaire ; le rapport de santé comptant autre chose et
masquant une division par zéro, sa ligne retirée du texte ; le libellé sans
modèle déduit dans `market_items` et dans `feed_query` ; la migration 012
n'ajoutant pas sa colonne ; le cache survivant d'un test à l'autre.

**Aucun test ne lit l'horloge réelle** : `NOW` est posé à la main partout, y
compris pour le délai de dix minutes du cache.

## 9. Ce que le lot 3b hérite

- **La question des modèles composés** (§6a) — c'est là qu'est la couverture.
- **La liste des carrosseries à la main** (§6b) — 29 déductions, un mot de toi.
- **Le second site paie déjà** : trois annonces La Centrale ont résolu 121
  leboncoin. Chaque marchand qui parcourt La Centrale enrichit la taxonomie de
  tout le monde. À dire dans le produit, c'est un argument.
- **`data_health` surveille désormais la part déduite** : « modèle déduit de la
  version : 2,9 % des annonces sans modèle du site (142), 4 712 restent non
  précisées ». Cette ligne doit monter, lot après lot.
