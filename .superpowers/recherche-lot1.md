# Recherche filtrée, lot 1 — taxonomie, libellé, recherche texte

Côté API et données. Mesuré et livré le 2026-09-19 sur `adscope`, 52 925 annonces
réelles (51 712 le 18, le balayage tourne). Branche `feat/api`, tests 390 côté
Python, 61 côté web (le lot `web/` est tenu en parallèle).

**Ce qui est fait** : les champs observés ne bougent pas, une couche canonique
s'ajoute à côté, chaque item porte un `label` composé par l'API, et `?q=` cherche
sans casse, sans accents, mots dans le désordre.

**Le bug du constat est mort** : `?brand=ferrari` rendait 0 annonce le 18, il en
rend 390 aujourd'hui, comme `?brand=Ferrari`.

---

## 1. Mesure — le désordre, en nombres

Requêtes dans `/private/tmp/.../mesure.sql`, reproduites ici en abrégé. Le pli
d'un libellé (minuscules, sans accents) s'écrit en SQL avec `lower(translate(...))` ;
pas d'extension `unaccent` sur cette base.

### Variantes de casse et d'accents d'une même marque

Dix marques s'écrivent de deux façons. La Centrale (24 annonces) écrit en
capitales, leboncoin (52 901) en capitale initiale — d'où le déséquilibre.

```sql
SELECT lower(translate(brand, 'àâäéèêëïîôöûüç', 'aaaeeeeiioouuc')) AS pli,
       array_agg(DISTINCT brand), count(*)
  FROM listings WHERE brand IS NOT NULL GROUP BY 1 HAVING count(DISTINCT brand) > 1;
```

| pli | écritures | annonces |
|---|---|---|
| renault | Renault (10 590) · RENAULT (8) | 10 598 |
| peugeot | Peugeot · PEUGEOT (2) | 9 302 |
| citroen | Citroen · CITROEN (3) | 7 182 |
| volkswagen | Volkswagen · VOLKSWAGEN (2) | 3 381 |
| ford | Ford · FORD (2) | 2 577 |
| mercedes | Mercedes · MERCEDES (2) | 1 974 |
| audi | Audi · AUDI (1) | 1 544 |
| bmw | Bmw · BMW (1) | 1 431 |
| mini | Mini · MINI (1) | 461 |
| land rover | Land Rover · LAND ROVER (1) | 359 |

Côté **modèles**, 15 plis sur 709 portent deux écritures : `clio` (Clio 3 485 /
CLIO 2), `c4 picasso` (918 / 1), `coupe` (Coupe 41 / Coupé 3), `gt` (GT 42 /
Gt 8), `tt` (Tt 25 / TT 1)…

### Marques dont le modèle est majoritairement « Autres »

```sql
SELECT brand, count(*), count(*) FILTER (WHERE model = 'Autres')
  FROM listings GROUP BY 1 HAVING count(*) FILTER (WHERE model='Autres')*2 > count(*);
```

| marque | total | « Autres » | part |
|---|---|---|---|
| Ferrari | 390 | 198 | 51 % |
| Autres | 277 | 277 | 100 % |
| Smart | 168 | 134 | 80 % |
| Aston Martin | 145 | 102 | 70 % |
| Dodge | 106 | 71 | 67 % |
| Maserati | 48 | 27 | 56 % |
| **Corvette** | **23** | **23** | **100 %** |
| Lotus | 17 | 10 | 59 % |
| Cupra | 9 | 9 | 100 % |

Au total **4 753 annonces (9,0 %) sans modèle**, dont **277 sans marque non plus**
— et ces 277 sont exactement celles dont la marque est « Autres » : le seau
sans marque n'a jamais de modèle.

### Marques qui existent aussi comme modèle d'une autre marque

```sql
SELECT b.brand, b.n, m.brand, m.model, m.n
  FROM (SELECT brand, count(*) n FROM listings GROUP BY 1) b
  JOIN (SELECT brand, model, count(*) n FROM listings GROUP BY 1,2) m
    ON lower(b.brand) = lower(m.model) AND lower(m.brand) <> lower(b.brand);
```

Trois cas seulement, « Autres » mis à part (qui apparaît comme modèle de 69
marques, 4 476 annonces) :

| marque | annonces sous la marque | classée aussi sous | annonces |
|---|---|---|---|
| **Corvette** | **23** | Chevrolet / Corvette | **34** |
| Mini | 460 | Austin / Mini | 13 |
| Mini | 460 | Rover / Mini | 2 |

### Versions qui répètent la marque et/ou le modèle

```sql
SELECT count(*), count(*) FILTER (WHERE version ~* ('(^|[^[:alnum:]])'||model||'([^[:alnum:]]|$)')),
                        count(*) FILTER (WHERE version ~* ('(^|[^[:alnum:]])'||brand||'([^[:alnum:]]|$)'))
  FROM listings WHERE version IS NOT NULL AND model IS NOT NULL AND brand IS NOT NULL;
```

- **17 451 annonces portent une version** (35 474 n'en ont pas, aucune n'est vide).
- **15 523 (89,0 %) répètent le modèle** — « Chevrolet Corvette **Corvette** 6.2 V8… »
- **301 (1,7 %) répètent la marque**.
- Sur les **10 189 triplets distincts** : 8 841 répètent le modèle, 195 la marque.
- **3 350 versions (19 %) collent la finition au modèle par un souligné** :
  « Exclusive**_**C4 Picasso BlueHDi 150ch Exclusive S&S ». C'est le séparateur
  de mots de leboncoin, et il fallait le traiter comme tel.

### Couples (marque, modèle) rares — le bruit de saisie

**798 couples** au total ; **210 (26 %) n'ont qu'une ou deux annonces**, soit
**287 annonces (0,5 %)**. Le bruit est dans la queue, jamais dans le corps : un
filtre en cascade avec compteurs (lot 4) le rendra visible sans qu'on l'efface.

---

## 2. À regarder par Alexis

### 2.1 La liste d'alias — deux entrées, et c'est tout

`shared/vehicle-aliases.json`, section `alias`. Le critère est strict : on
n'aliase que lorsque **la taxonomie du site se contredit elle-même**, preuve
chiffrée à l'appui.

| alias | vers | annonces déplacées | après fusion | pourquoi |
|---|---|---|---|---|
| marque **Corvette** | marque **Chevrolet**, modèle **Corvette** | **23** | 57 sous Chevrolet / Corvette | leboncoin classe la même voiture des deux façons : « Chevrolet / Corvette » (34) et « Corvette / Autres » (23). Corvette n'a jamais été une marque. |
| marque **Buic** | marque **Buick** | **2** | 3 sous Buick | la base porte « Buic » (2) et « Buick » (1) comme deux marques. « Buic » n'existe chez aucun constructeur. |

**Réserve sur Corvette, à connaître** : le seau « Corvette / Autres » de
leboncoin sert de fourre-tout aux sportives Chevrolet. 21 des 23 n'ont aucune
version ; les 2 autres sont des **Camaro** (« 1969 Camaro Camaro SS » et
« Base_Camaro Coupé 6.2 V8 453ch 8AT »). Elles gagnent la bonne marque et un
modèle faux. Le lot 3 (modèle déduit du titre) les reprendra.

### 2.2 Les cas douteux que je n'ai **pas** aliasés

| cas | effectifs | pourquoi je m'abstiens |
|---|---|---|
| **Abarth** ≠ Fiat | 12 / 1 382 | pour un marchand ce sont deux marques, et les sites les distinguent. Aucune annonce Abarth n'est classée sous Fiat. |
| **Cupra** ≠ Seat | 9 / 826 | idem. Cupra est une marque depuis 2018. |
| **Ds** ≠ Citroen | 69 / 7 179 | idem. La base porte « Ds » comme marque à part entière. |
| **Alpine** ≠ Renault | 35 / 10 590 | idem. |
| **Mini** reste une marque | 460 | Austin / Mini (13) et Rover / Mini (2) sont les Mini historiques, badgées Austin et Rover. Les fondre dans la marque Mini mélangerait une anglaise de 1965 et une BMW de 2019. Une **contradiction du site**, oui, mais pas une que je sais trancher sans toi. |
| **Corvette → Chevrolet** est le seul alias de marque « véritable » | 23 | tous les autres candidats sont des marques que les sites distinguent délibérément. |
| modèle « Coupe » / « Coupé » | 41 / 3 | mêmes voitures, mais le pli les réunit déjà : pas besoin d'alias. |
| « Autres » | 4 753 modèles, 277 marques | ce n'est pas une erreur de classement, c'est un aveu du site. Il reste tel quel en base, il ne s'affiche jamais, et le lot 3 s'en occupe. |

### 2.3 La casse des modèles — ce que j'ai choisi, et pourquoi

**L'orthographe canonique est la plus fréquente du corpus, jamais une typographie
inventée.**

Mettre une capitale à chaque mot était tentant : leboncoin écrit en capitale
initiale pour 99,9 % des annonces. Mais ça aurait rendu :

| vrai modèle | ce que le « title case » en ferait | annonces |
|---|---|---|
| AMG GT | Amg Gt | 66 |
| GTC4Lusso | Gtc4Lusso | 20 |
| XCeed | Xceed | 6 |
| SQ5 / SQ7 | Sq5 / Sq7 | 3 |
| CX-30 / CX-3 | Cx-30 / Cx-3 | 2 |

Donc : le fichier retient l'écriture dominante par pli. Il dit « **GT** » parce
que 42 annonces l'écrivent ainsi contre 8 « Gt », mais « **Tt** » parce que 25
l'emportent sur 1 « TT ». C'est la donnée qui tranche, pas moi.

**Un pli que le fichier ne connaît pas se rend tel qu'observé.** D'où la réponse
à ta question : **`(Citroen, Ds3, null)` → « Citroen Ds3 »**. Sans tréma, sans
capitales : c'est ce que la base porte, et je n'invente pas « Citroën DS3 » que
personne n'a écrit. La recherche, elle, trouve `citroën ds3` comme `citroen ds3`.

Conséquence à connaître : les **marques** sont toutes dans le fichier (82 plis,
liste fermée, le site la servira en filtre), les **modèles** n'y figurent que
lorsque le corpus en porte plusieurs écritures (15 sur 709). Une marque encore
jamais vue en capitales arriverait donc dans son propre seau — `recanonize.py`
se rejoue, c'est une ligne de fichier et une commande.

### 2.4 Vingt libellés, avant et après — tirés de la base réelle

« Avant » = ce qu'un client compose naïvement, `marque modèle version`.

| avant | après |
|---|---|
| Chevrolet Corvette 1967 Corvette Corvette 300 ch | **Chevrolet Corvette 1967 300 ch** |
| Fiat Panda 1.2 8v 60ch Natural Power Panda Panda | **Fiat Panda 1.2 8v 60ch Natural Power** |
| Corvette Autres | **Chevrolet Corvette** |
| Chevrolet Corvette | **Chevrolet Corvette** |
| Mini Mini Mini Cooper S 192ch Exquisite BVA7 | **Mini Cooper S 192ch Exquisite BVA7** |
| Autres Autres | **Véhicule non précisé** |
| Ferrari Autres | **Ferrari** |
| Land Rover Autres Range Rover Evoque 2.0 D 150ch R-Dynamic | **Land Rover Range Rover Evoque 2.0 D 150ch R-Dynamic** |
| RENAULT CLIO IV (2) 1.5 DCI 110 ENERGY INTENS | **Renault Clio IV (2) 1.5 DCI 110 ENERGY INTENS** |
| Citroen Ds3 | **Citroen Ds3** |
| Citroen C4 Picasso Exclusive_C4 Picasso BlueHDi 150ch Exclusive S&S | **Citroen C4 Picasso Exclusive BlueHDi 150ch Exclusive S&S** |
| Volkswagen T-cross Style_T-Cross 1.0 TSI 110ch Style DSG7 | **Volkswagen T-cross Style 1.0 TSI 110ch Style DSG7** |
| Volkswagen Golf Confortline_Golf 1.6 TDI 105ch BlueMotion Technology FAP Confortline DSG7 5p | **Volkswagen Golf Confortline 1.6 TDI 105ch BlueMotion Technology FAP Confortline DSG7 5p** |
| Volkswagen Golf GTI Performance_Golf 2.0 TSI 230ch BlueMotion Technology GTI Performance DSG6 5p | **Volkswagen Golf GTI Performance 2.0 TSI 230ch BlueMotion Technology GTI Performance DSG6 5p** |
| Bmw Serie 1 Edition M Sport Pro_Série 1 M135iA xDrive 306ch Edition M Sport Pro | **Bmw Serie 1 Edition M Sport Pro M135iA xDrive 306ch Edition M Sport Pro** |
| Mercedes AMG GT AMG GT 4.0 V8 730ch GT Black Series | **Mercedes AMG GT 4.0 V8 730ch GT Black Series** |
| Ferrari GTC4Lusso GTC4Lusso V12 6.3 690ch | **Ferrari GTC4Lusso V12 6.3 690ch** |
| Hyundai Ioniq Ioniq Electric 136ch Executive 2cv | **Hyundai Ioniq Electric 136ch Executive 2cv** |
| Buic Autres | **Buick** |
| Ds Ds3 DS 3 Crossback PureTech 130ch Performance Line Automatique | **Ds Ds3 3 Crossback PureTech 130ch Performance Line Automatique** ← laid, voir ci-dessous |

**Les deux laideurs qui restent, et que je n'ai pas voulu masquer :**

1. **« Ds Ds3 3 Crossback »** — la marque « Ds » fait un mot entier dans la
   version « **DS** 3 Crossback », elle s'en va, et le « 3 » reste orphelin.
   51 annonces Ds sur 69 répètent ainsi leur marque. Corriger demanderait de
   deviner que « DS 3 » est un nom de modèle : c'est le lot 3, pas celui-ci.
2. **« Edition M Sport Pro … Edition M Sport Pro »** — leboncoin répète la
   finition. Ce n'est ni la marque ni le modèle ; la règle du lot ne dit rien
   d'une finition répétée, et je n'ai pas voulu l'inventer.

### 2.5 Les recherches demandées, mesurées en vrai

API relancée par son label (`launchctl kickstart -k gui/501/fr.adscope.api`),
authentification par clé `Bearer` de machine, sur `http://localhost:8000`.

| requête | total | temps |
|---|---|---|
| `?q=ferrari` | **390** | 0,050–0,136 s |
| `?q=FERRARI` | **390** | 0,067 s |
| `?q=Ferrari` | **390** | 0,050 s |
| `?q=land rover` | **359** | 0,056 s |
| `?q=rover land` | **359** | 0,054 s |
| `?q=citroën c3` | **1 598** | 0,119 s |
| `?q=citroen c3` | **1 598** | 0,069 s |
| `?q=corvette` | **57** (les deux classements) | 0,035 s |
| `?q=ferrari zzzz` | **0** | 0,029 s |
| `?q=%` · `?q=_` | **0** (du texte, pas des jokers) | 0,028 s |
| `?q=land rover&min_age_days=90` | **45** | **0,123 s** |
| `?q=corvette&seller_type=pro` | 22 | 0,072 s |
| `?q=clio&dropped=true` | 4 | 0,095 s |
| `?brand=ferrari` (le bug du 18) | **390** | 0,047 s |
| `?brand=Ferrari` | **390** | 0,041 s |
| `?brand=Chevrolet&model=Corvette` | **57** (34 + 23) | 0,068 s |
| `?brand=Corvette` (marque seule) | **397** = toute la marque Chevrolet | 0,034 s |
| sans filtre | 52 925 | 0,089 s |

Le brief annonçait 54 pour Chevrolet / Corvette ; la mesure du 18 portait sur
51 712 annonces, celle-ci sur 52 925. 34 + 23 = **57**.

---

## 3. Ce qui a été écrit

| fichier | rôle |
|---|---|
| `shared/vehicle-aliases.json` | la table, versionnée : 82 plis de marque, 15 plis de modèle, 2 alias justifiés |
| `api/adscope_api/taxonomy.py` | `fold`, `canonical`, `label`, `search_text`, `derive` — pur, sans ORM |
| `api/adscope_api/search.py` | `family` (filtre exact sur la forme canonique) et `text` (le `?q=`) |
| `api/adscope_api/market_items.py` | le contrat d'un item, `label` compris — partagé par les deux routes |
| `api/scripts/recanonize.py` | le rattrapage par lots, rejouable |
| migration **010** | `canon_brand`, `canon_model`, `search_text`, index `(canon_brand, canon_model)` |

`market_query.py` est passé de 149 à 108 lignes : `ItemOut` / `MarketOut` /
`item_of` sont sortis dans `market_items.py`, que `feed_query` lisait déjà.

**La règle cardinale tient** : `brand`, `model`, `version` ne sont jamais
réécrits. L'empreinte véhicule ne bouge pas — un test le vérifie sur l'empreinte
`54b22edbd39c` de la fiche de référence.

### La manœuvre sur la base réelle

```
pg_dump -Fc adscope -f ~/adscope-backups/adscope-20260919-100206-avant-010.dump   (3,3 Mo)
python scripts/migrate.py       → 010_listings_canonical, 0,29 s
python scripts/recanonize.py    → 52 925 annonces recanonisées, 2,9 s
python scripts/recanonize.py    → 0 annonces (rejoué, rien à faire)
python scripts/recanonize.py --all → 0 annonces, 1,4 s
launchctl kickstart -k gui/501/fr.adscope.api
```

La migration n'écrit pas une ligne de donnée : elle ouvre trois colonnes vides.
Le remplissage est un script à part, par lots de 2 000 commités séparément —
52 925 lignes dans une seule transaction tiendraient le verrou bien plus
longtemps que le crawl ne l'accepte.

---

## 4. Le trigramme : à partir de quand

`search_text` est du texte **déjà plié en Python** (minuscules, sans accents).
Pas d'`unaccent`, pas de `pg_trgm` dans ce lot — l'extension aurait forcé un
`CREATE EXTENSION` en production pour un balayage qui coûte encore trois fois
rien.

Mesuré, `EXPLAIN (ANALYZE)` sur la base réelle, 52 925 lignes / 2 015 pages :

| requête | plan | temps |
|---|---|---|
| `search_text LIKE '%ferrari%'` | Seq Scan | **10,2 – 19,2 ms** (médiane 13,7) |
| `LIKE '%land%' AND LIKE '%rover%'` | Seq Scan | **9,1 – 11,0 ms** |
| `canon_brand='Chevrolet' AND canon_model='Corvette'` | Index Only Scan `ix_listings_canon` | **0,16 ms** |

Le balayage est linéaire en pages : **≈ 0,20 µs par annonce**. La colonne pèse
1,1 Mo de texte pour 31 Mo de table, 21,6 caractères en moyenne.

**Seuil** : le balayage passe **50 ms vers 250 000 annonces** et **100 ms vers
500 000**. Or la route entière rend aujourd'hui en 40 à 120 ms, agrégation des
prix comprise. Dès que le filtre texte coûte à lui seul autant que tout le
reste — soit **autour de 250 000 à 300 000 annonces**, cinq à six fois la base
actuelle — un index GIN trigramme (`CREATE EXTENSION pg_trgm` +
`CREATE INDEX … USING gin (search_text gin_trgm_ops)`) devient nécessaire. Il
sert directement les `LIKE '%mot%'`, sans rien changer au code : c'est une
migration et rien d'autre. Avant ce seuil il coûterait de l'écriture à chaque
observation pour un gain invisible.

---

## 5. Tests — 390, dont 51 neufs

`cd api && ./.venv/bin/pytest tests/ -q` → **390 passés**.
`node --test web/tests/*.test.mjs` → **61 passés** (lot `web/`, pas touché).

| fichier | nombre |
|---|---|
| `tests/test_taxonomy.py` | 21 |
| `tests/test_search.py` | 14 |
| `tests/test_recanonize.py` | 6 |
| `tests/test_migrations.py` | +4 |
| `tests/test_observations.py` | +4 |
| `tests/test_feed.py` | +1 |
| `tests/test_market.py`, `test_feed.py` | `label` ajouté au gabarit de sortie |

**Chaque test nomme la ligne de production qui le fait rougir, et je l'ai
prouvé en la cassant.** 42 mutations, une ligne à la fois, remises en place
après coup : `fold` sans `.lower()`, sans la décomposition NFD ; `_spelled` sans
sa table ; `canonical` sans alias, et avec un alias qui écrase le modèle donné ;
`label` sans le filtre « Autres », sans le repli marque == modèle, sans
`NO_VEHICLE`, sans `_trimmed` ; `_phrases` mot à mot au lieu de suite entière ;
`_trimmed` qui ne reprend pas après un retrait, qui ignore le souligné ;
`search_text` sans les formes observées, sans dédoublonnage, sans pli ;
`derive` muet ou toujours « changé » ; `search.text` sans pli, en une seule
phrase, au premier mot seulement, sans échappement `LIKE` ; `search.family` sur
la forme observée, et posant le modèle que l'alias implique ; le montage de `q`
dans `market_query` et dans la route ; `label` retiré des deux items ;
`derive(listing)` retiré de `record`, déplacé avant la boucle des champs, ou
appliqué à l'observation au lieu de l'annonce ; la règle cardinale violée
(champs observés réécrits) ; la migration 010 amputée de ses colonnes, de son
index, ou remplissant les lignes ; `recanonize` sans `derive`, sans curseur,
sans `commit` par lot, sans son filtre `only_missing`.

**Aucun test ne lit l'horloge réelle** : `NOW` est posé à la main partout.

---

## 6. Ce que le lot 2 hérite

- Le filtre `?q=` est **tolérant par sous-chaîne** : `q=c3` trouve aussi
  « C3 Picasso » et « C3 Aircross » (1 598 annonces pour `citroen c3`). C'est
  voulu — une recherche, pas un filtre. La cascade du lot 4 donnera l'exactitude.
- `search_text` **ne porte pas encore** carburant, boîte ni département : ils
  n'existent pas en base (lot 2). Quand ils arriveront, une ligne de
  `taxonomy.search_text` et un `recanonize.py --all` suffiront.
- **La table d'alias grandira**, et chaque évolution demande
  `recanonize.py --all` (1,4 s aujourd'hui). C'est écrit dans la docstring du
  script.

---

# Lot 1 bis — à regarder par Alexis

Tes quatre retours, traités. Mesuré le 2026-09-19 sur `adscope`, **52 957
annonces**. Tests **417** côté Python (dont 62 neufs ou repris), 61 côté web.

**Ta question 3 (« prendre l'écriture réelle, ça casserait le matching ? »)
— non, et c'est maintenant impossible par construction.** Les colonnes
`canon_brand` / `canon_model` ne portent plus l'orthographe affichée mais la
**clé repliée** : « citroen », « ds 3 ». L'orthographe affichée n'existe plus en
base, elle se recalcule à l'affichage. Corriger une écriture ne peut donc pas
déplacer une annonce — deux tests le prouvent, dont un qui remet « Citroen » à la
place de « Citroën » *après* écriture et vérifie que le filtre rend toujours les
mêmes annonces.

Bénéfice inattendu : la comparaison étant pliée **des deux côtés**,
`?model=captur` rend enfin les 72 « Captur ». Avant, tout modèle absent de la
table exigeait la casse exacte du site.

## 1. Les 83 marques — avant → après

83 plis et non 82 : La Centrale a apporté « Mercedes-Benz » depuis le lot 1.

| pli | avant | après |
|---|---|---|
| `bluecar groupe bollore` | Bluecar Groupe Bollore | **Bluecar Groupe Bolloré** |
| `bmw` | Bmw | **BMW** |
| `citroen` | Citroen | **Citroën** |
| `ds` | Ds | **DS** |
| `ktm` | Ktm | **KTM** |
| `mclaren` | Mclaren | **McLaren** |
| `mercedes-benz` | *(absent)* | **Mercedes-Benz**, puis aliasé vers **Mercedes** |
| `pgo` | Pgo | **PGO** |
| `rolls-royce` | Rolls-royce | **Rolls-Royce** |
| `ssangyong` | Ssangyong | **SsangYong** |

Les 73 autres étaient déjà justes et ne bougent pas : Abarth, Aixam, Alfa Romeo,
Alpine, Aston Martin, Audi, Austin, Autobianchi, Autres, Auverland, Bellier,
Bentley, Buic, Buick, Cadillac, Casalini, Caterham, Chatenet, Chevrolet,
Chrysler, Corvette, Cupra, Dacia, Daewoo, Daihatsu, Datsun, Dodge, Ferrari,
Fiat, Ford, Honda, Hummer, Hyundai, Infiniti, Isuzu, Jaguar, Jeep, Kia, Lada,
Lamborghini, Lancia, Land Rover, Lexus, Ligier, Lotus, Mahindra, Maserati,
Mazda, Mercedes, Microcar, Mini, Mitsubishi, Morgan, Nissan, Opel, Peugeot,
Piaggio, Pontiac, Porsche, Renault, Rover, Saab, Santana, Seat, Simpa JDM,
Skoda, Smart, Subaru, Suzuki, Tesla, Toyota, Volkswagen, Volvo.

### Les cinq arbitrages, et pourquoi

**La règle que j'ai suivie** : un sigle qui **s'épelle lettre par lettre** garde
ses capitales (BMW, DS, KTM, PGO) ; un sigle qui **se prononce comme un mot**
prend la capitale initiale, comme l'écrit la presse française. Fiat est un
acronyme (Fabbrica Italiana Automobili Torino) et personne n'écrit FIAT.

| cas | retenu | pourquoi |
|---|---|---|
| **Mercedes** vs Mercedes-Benz | **Mercedes** | c'est le nom que les deux sites emploient dans leurs listes (1 974 contre 1), et celui que le modèle suppose : « Mercedes Classe A » se lit, « Mercedes-Benz Classe A » ne s'écrit sur aucune des deux annonces. La forme longue devient un **alias** vers la courte : plus de doublon de marque. |
| **Skoda** vs Škoda | **Skoda** | l'usage français courant. L'Argus, Caradisiac, leboncoin et La Centrale écrivent tous sans hatchek ; ce serait le seul caractère hors clavier français de la liste, et comme `fold` l'efface de toute façon, l'accent n'apporterait rien au rapprochement. |
| **Seat**, **Cupra**, **Smart** | capitale initiale | les constructeurs écrivent SEAT, CUPRA, smart. Ce sont des logos, pas une orthographe : la presse française écrit Seat, Cupra, Smart, et un « smart » minuscule en tête de libellé se lit comme un bug. |
| **Mini** vs MINI | **Mini** | même raison (BMW écrit MINI). Voir aussi le point 2 plus bas. |
| **Buic** | reste « Buic » dans la table | l'alias vers Buick passe avant : cette écriture ne s'affiche jamais. Je garde la ligne pour que la liste des 83 plis observés reste vérifiable d'un coup d'œil. |

## 2. Mini — ce que le point du lot 1 voulait dire (ta question 2)

En clair, sans jargon :

- **Mini a d'abord été un modèle.** L'Austin Mini / Morris Mini de 1959,
  vendue en France sous les badges **Austin** et **Rover**.
- **Depuis 2001, Mini est une marque**, propriété de BMW : Mini Cooper,
  Countryman, Clubman.
- **leboncoin porte les deux à la fois** : 461 annonces sous la *marque* Mini
  (les BMW modernes), 13 sous « Austin / Mini » et 2 sous « Rover / Mini » (les
  anciennes). C'est la même chaîne de caractères pour deux voitures qui n'ont
  rien à voir.
- **Je ne les ai pas fondues.** Les fondre mettrait une anglaise de 1965 et une
  BMW de 2019 dans le même seau : un marchand qui compare des prix comparerait
  une voiture de collection à une citadine d'occasion.
- **Ce que ça coûte** : un marchand qui suit « Mini » ne voit pas les 15
  anciennes. **Ce que ça gagne** : les 461 modernes restent comparables entre
  elles.
- **Rien à décider**, sauf si tu veux les 15 anciennes dans le seau Mini — une
  ligne d'alias.

## 3. Les modèles : une règle, puis 70 exceptions

Les modèles sont **ouverts** (709 en base, et ce n'est pas fini) : une liste
fermée serait fausse dès demain. Donc **une règle** et une liste d'exceptions.

**La règle** : *un mot qui contient un chiffre s'écrit en capitales.* Mot à mot,
jamais sur la chaîne entière.

| la règle donne | et c'est juste |
|---|---|
| `Xc90` → **XC90** · `Sq5` → **SQ5** · `Mx-5` → **MX-5** · `Cx-7` → **CX-7** | Volvo, Audi, Mazda |
| `2cv` → **2CV** · `300c` → **300C** · `370z` → **370Z** · `Sx4` → **SX4** | Citroën, Chrysler, Nissan, Suzuki |
| `Rs6` → **RS6** · `Db11` → **DB11** · `Xj40` → **XJ40** · `A6/s6` → **A6/S6** | Audi, Aston Martin, Jaguar |
| `208`, `2008`, `911` | inchangés — la capitale d'un chiffre est le chiffre |
| `Abarth 500`, `812 Superfast`, `Model 3` | le mot sans chiffre n'est pas touché |

**Les 70 exceptions**, groupées dans le fichier par raison pour qu'elles se
relisent d'un coup d'œil (le code aplatit les groupes) :

| groupe | ce qu'il corrige | exceptions |
|---|---|---|
| `dominance` | plusieurs écritures observées du même pli | C4 Picasso, Classe B, Clio, Golf Plus, Kangoo Express, Laguna, Mini, Modus, Partner, Range Rover Velar, Tiguan |
| `accents` | les sites n'accentuent pas | **Mégane**, **Scénic**, **Coupé**, **Série 1/3/5/7/8**, **Huracán**, **Doblò** |
| `sigles` | la règle du chiffre ne les atteint pas | **AX**, **BX**, **ZX**, **CX**, **XM**, **GT**, **GTV**, **GT-R**, **Carrera GT**, **TT**, **RCZ**, **SL**, **SLK**, **Classe CLK**, **Classe CLS**, **Classe GL**, **PT Cruiser**, **NSX**, **FF**, **MiTo**, **Compass II** |
| `traits_dunion` | la capitale du second élément | **B-Max**, **C-Max**, **S-Max**, **T-Roc**, **T-Cross**, **X-Trail**, **X-Type**, **S-Type**, **C-HR**, **C-Crosser**, **CR-V**, **FR-V**, **HR-V** |
| `contre_la_regle` | espace officiel, casse mixte, minuscule officielle | **DS 3/4/5/7**, **RAV4**, **RS Q8**, **GTC4Lusso**, **i3**, **i8**, **i10**, **i20**, **i30**, **i40**, **ix20**, **ix35** |

Les trois derniers groupes existent parce que la règle **se tromperait** :
« GTC4Lusso » deviendrait « GTC4LUSSO », « i30 » deviendrait « I30 ».

### Les modèles ≥ 20 annonces sur lesquels j'ai un doute — laissés hors liste

**Je n'ai rien inventé** : sur ces cinq-là la forme observée reste, elle vaut
mieux qu'une forme fausse. Un mot de toi suffit à les ajouter (une ligne de
fichier, `recanonize --all`, 3,7 s).

| modèle | annonces | ce que je crois officiel | pourquoi je m'abstiens |
|---|---|---|---|
| **Leon** | 184 | « León » | Seat écrit « León » en Espagne, « Leon » sur son configurateur français. Je ne sais pas laquelle est la bonne en France. |
| **Aygo** | 106 | « AYGO » | Toyota écrit AYGO partout, mais c'est un logo ; la presse écrit Aygo. Même hésitation que Seat / SEAT, et ici je n'ai pas de règle qui tranche. |
| **Forfour** | 34 | « forfour » | smart écrit tout en minuscules. En tête de libellé ça se lit comme un bug ; je n'ai pas voulu le faire sans ton avis. |
| **Cordoba** | 30 | « Córdoba » | même cas que Leon, même hésitation. |
| **Coupe → Coupé** | 41 | *ajouté* | signalé quand même : « Coupé » est juste pour une Mercedes Classe C Coupé, mais ce pli est aussi le seau fourre-tout de leboncoin pour des coupés de marques diverses. |

Et trois choix que j'ai faits mais que tu voudras peut-être revoir :

- **C-Max / S-Max / B-Max** (198 / 62 / 13) : Ford écrit « C-MAX ». J'ai retenu
  « C-Max », la forme de la presse. La capitale au M est sûre, les capitales sur
  MAX ne le sont pas.
- **Classe CLK / CLS / GL** : Mercedes dit « CLK », sans « Classe ». Je n'ai
  corrigé que la casse du sigle, pas retiré le « Classe » que leboncoin ajoute —
  retirer un mot du modèle observé, c'est du lot 3.
- **Compass II** : le « II » est un marqueur de génération ajouté par leboncoin,
  pas un nom Jeep. J'ai corrigé « Ii » en « II » sans le retirer.

## 4. Les deux répétitions (ta question 4) — faites

### La finition répétée

leboncoin écrit « Finition_Modèle motorisation … Finition ». Quand la version
porte un `_`, ce qui précède est une finition ; si ce préfixe **reparaît** plus
loin (forme repliée, mots entiers), il ne dit rien de plus et il part. Sinon il
reste, le `_` devenant une espace — c'est la seule finition qu'on ait.

| avant | après |
|---|---|
| Bmw Serie 1 Edition M Sport Pro M135iA xDrive 306ch Edition M Sport Pro | **BMW Série 1 M135iA xDrive 306ch Edition M Sport Pro** |
| Citroen C4 Picasso Exclusive BlueHDi 150ch Exclusive S&S | **Citroën C4 Picasso BlueHDi 150ch Exclusive S&S** |
| Volkswagen Golf Confortline 1.6 TDI 105ch … FAP Confortline DSG7 5p | **Volkswagen Golf 1.6 TDI 105ch … FAP Confortline DSG7 5p** |
| Audi Q7 Avus 3.0 V6 TDI 240ch DPF Avus quattro Tiptronic | **Audi Q7 3.0 V6 TDI 240ch DPF Avus quattro Tiptronic** |
| Chevrolet Corvette Base Camaro Coupé 6.2 V8 453ch 8AT | **inchangé** — « Base » ne se répète pas, il reste |

### Le modèle écrit avec ou sans espace

Le retrait compare désormais **sans tenir compte des espaces**, sur des
frontières de mots. Modèle « Ds3 », version « DS 3 Crossback » : les deux mots
partent ensemble, le « 3 » ne reste plus orphelin.

| avant | après |
|---|---|
| Ds Ds3 3 Crossback PureTech 130ch Performance Line Automatique | **DS DS 3 Crossback PureTech 130ch Performance Line Automatique** |
| Toyota Rav 4 RAV4 197 Hybride Collection AWD CVT | **Toyota RAV4 197 Hybride Collection AWD CVT** |
| Volkswagen T-cross Style 1.0 TSI 110ch Style DSG7 | **Volkswagen T-Cross 1.0 TSI 110ch Style DSG7** |

**Le garde-fou** : le retrait s'aligne sur des mots entiers, et c'est l'égalité
qui décide, pas le préfixe. « C3 » ne mord pas dans « C3500 » — un test le tient
sur « Chevrolet C3 C3500 Silverado 5.7 V8 ».

## 5. La mesure avant / après

```
avant   mot répété :  3 686 / 52 957 = 6,96 %   | libellé vide : 0 | « Autres » affiché : 0
après   mot répété :    740 / 52 957 = 1,40 %   | libellé vide : 0 | « Autres » affiché : 0
```

**Je n'atteins pas 1 %, et je pense que l'objectif était inatteignable** : la
mesure compte tout mot répété, y compris quand la répétition est **juste**.
Décomposition des 740 :

| nature | annonces | exemple |
|---|---|---|
| **libellé correct**, le mot appartient à deux noms différents | **≈ 421 (0,79 %)** | « Land Rover **Range Rover** Evoque » (226), « S line S tronic » (76), « Classe A 35 AMG … AMG 19cv » (50), « AMG GT … GT Black Series » (25), « V8 Vantage V8 4.0 » (23) |
| **la marque redite dans le modèle** — une ligne, ton avis attendu (§7) | 94 | « **DS DS 3** Crossback » |
| **la version reprend un mot du modèle** — mesuré et écarté (§7) | 71 | « New Beetle **Beetle** 1.9 TDI » |
| **bruit du site** : finition répétée sans souligné, version qui se répète | 49 | « 207 Affaire … **Affaire** Pack CD Clim », « 1973 Challenger **Challenger** » |
| queue, moins de 7 annonces chacune | 113 | |

Le **plancher de cette mesure est donc autour de 0,8 %** : descendre dessous
demanderait de supprimer des mots utiles. Le vrai taux de défaut est de
**740 − 421 = 319 annonces, soit 0,60 %**.

### Les vingt pires restants

| annonces | mot répété | exemple |
|---|---|---|
| 226 | rover | Land Rover Range Rover Evoque 2.0 D 150ch R-Dynamic |
| 76 | s | Audi A3 Sportback 2.0 TFSI 190ch S line S tronic 7 |
| 68 | ds | DS DS 3 Crossback PureTech 130ch Performance Line Automatique |
| 50 | amg | Mercedes Classe A Berline 35 AMG 306ch 4Matic 7G-DCT Speedshift AMG 19cv |
| 25 | gt | Mercedes AMG GT 4.0 V8 730ch GT Black Series |
| 23 | v8 | Aston Martin V8 Vantage V8 4.0 510ch BVA |
| 22 | 812 | Ferrari 812 Superfast 812 V12 6.5 800ch |
| 22 | affaire | Peugeot 207 Affaire 1.4 HDi 70 FAP Affaire Pack CD Clim |
| 15 | beetle | Volkswagen New Beetle Beetle 1.9 TDI 90ch |
| 13 | sport | Mercedes Classe C Coupe Sport 220 CDI Sport BA |
| 11 | 720s / mclaren | McLaren Mclaren 720S 720S 4.0 V8 biturbo 720ch |
| 11 | targa | Porsche 911 Targa Targa 4 GTS PDK |
| 10 | challenger | Dodge 1973 Challenger Challenger |
| 9 | affaires | Opel Meriva Affaires 1.7CDTI Affaires Pack Clim |
| 8 | compass | Jeep Compass II Compass 1.3 GSE T4 190ch Limited 4xe PHEV AT6 |
| 8 | pack | Mercedes Pack Luxury Classe ML 500 Pack Luxe |
| 8 | nemo | Citroën Nemo Combi Nemo HDi70 Eco |
| 8 | classe | Mercedes Classe A Classe E Break 270 CDI Classic BV6 |
| 7 | compass / ii | Jeep Compass II Compass 1.4 MultiAir II 140ch Limited 4x2 Euro6d-T |
| 7 | abarth | Abarth Abarth 500 |

### Pas de régression : mille libellés tirés au hasard

**4 sur 1 000** perdent un mot distinct, et les quatre sont des gains :

| avant | après |
|---|---|
| Ds Ds3 **3** Crossback E-Tense Grand Chic | DS **DS 3** Crossback E-Tense Grand Chic |
| Toyota GRSupra **GR Supra** 2.0 258ch Pack Premium | Toyota GRSupra 2.0 258ch Pack Premium |
| Toyota **Rav 4** RAV4 197 Hybride Collection AWD CVT | Toyota RAV4 197 Hybride Collection AWD CVT |

Aucun libellé vide, aucun libellé portant « Autres », avant comme après.

### Vingt libellés avant / après, tirés de la base

| avant | après |
|---|---|
| Citroen Ds3 | **Citroën DS 3** |
| Bmw Serie 1 118iA 136ch Lounge 5p | **BMW Série 1 118iA 136ch Lounge 5p** |
| Renault Scenic | **Renault Scénic** |
| Citroen 2cv | **Citroën 2CV** |
| Mercedes-Benz Classe A | **Mercedes Classe A** |
| Bmw X3 xDrive30dA 265ch Lounge | **BMW X3 xDrive30dA 265ch Lounge** |
| Volkswagen T-cross Style 1.0 TSI 110ch Style DSG7 | **Volkswagen T-Cross 1.0 TSI 110ch Style DSG7** |
| Citroen C4 Picasso Exclusive BlueHDi 150ch Exclusive S&S | **Citroën C4 Picasso BlueHDi 150ch Exclusive S&S** |
| Bmw Serie 1 Edition M Sport Pro M135iA xDrive 306ch Edition M Sport Pro | **BMW Série 1 M135iA xDrive 306ch Edition M Sport Pro** |
| Audi A3 Design luxe Berline 1.4 TFSI CoD 150ch Design luxe | **Audi A3 Berline 1.4 TFSI CoD 150ch Design luxe** |
| Audi Q7 Avus 3.0 V6 TDI 240ch DPF Avus quattro Tiptronic 7 places | **Audi Q7 3.0 V6 TDI 240ch DPF Avus quattro Tiptronic 7 places** |
| Volkswagen Golf Confortline 1.6 TDI 115ch FAP Confortline DSG7 5p | **Volkswagen Golf 1.6 TDI 115ch FAP Confortline DSG7 5p** |
| Citroen C5 Aircross BlueHDi 130ch S&S Feel EAT8 | **Citroën C5 Aircross BlueHDi 130ch S&S Feel EAT8** |
| Jeep Compass Ii Compass 1.4 MultiAir II 140ch Limited 4x2 | **Jeep Compass II Compass 1.4 MultiAir II 140ch Limited 4x2** |
| Bmw | **BMW** |
| Bmw Serie 5 | **BMW Série 5** |
| Citroen C4 PureTech 130ch Millenium S&S | **Citroën C4 PureTech 130ch Millenium S&S** |
| Chevrolet Corvette 1967 300 ch | **inchangé** |
| Buick | **inchangé** |
| Véhicule non précisé | **inchangé** |

## 6. Appliqué sur la base réelle, et les recherches rejouées

```
pg_dump -Fc adscope -f ~/adscope-backups/adscope-20260919-105717-avant-lot1bis.dump  (3,8 Mo)
python scripts/recanonize.py --all   → 52 957 annonces, 3,7 s
python scripts/recanonize.py --all   → 0 annonce (rejoué, rien à faire)
launchctl kickstart -k gui/501/fr.adscope.api
```

Aucune migration : les colonnes existent déjà, seul leur **contenu** change de
nature (clé repliée au lieu d'orthographe).

| requête | total | avant le lot 1 bis | temps |
|---|---|---|---|
| `?q=ferrari` | **390** | 390 | 0,141 s |
| `?brand=ferrari` | **390** | 390 | 0,054 s |
| `?q=land rover` | **359** | 359 | 0,057 s |
| `?q=citroën c3` · `?q=citroen c3` | **1 598** | 1 598 | 0,084 / 0,061 s |
| `?q=corvette` | **57** | 57 | 0,040 s |
| `?brand=Chevrolet&model=Corvette` | **57** | 57 | 0,054 s |
| `?q=ferrari zzzz` | **0** | 0 | 0,024 s |
| `?q=%` | **0** | 0 | 0,025 s |
| `?q=_` | **0** | *annoncé 0, rendait 3 350 — corrigé, voir plus bas* | 0,025 s |
| sans filtre | **52 957** | 52 925 (la base a grandi) | 0,088 s |

**Les totaux du lot 1 se reproduisent exactement.** L'orthographe affichée ne
change rien à la recherche, comme annoncé.

Et les écritures nouvelles trouvent aussi bien que les anciennes :

| requête | total |
|---|---|
| `?brand=citroen&model=c3` · `?brand=Citroën&model=C3` · `?brand=CITROEN&model=c3` | **1 384** chacune |
| `?brand=Renault&model=Megane` · `?brand=Renault&model=Mégane` | **1 840** |
| `?brand=Bmw&model=Serie 1` · `?brand=BMW&model=Série 1` | **273** |
| `?brand=Audi&model=Tt` · `?brand=Audi&model=TT` | **26** |
| `?brand=Ds&model=Ds3` · `?brand=DS&model=DS 3` | **33** |
| `?brand=Mercedes` · `?brand=Mercedes-Benz` | **1 975** (1 974 + 1) |
| `?model=captur` | **72** (rendait 0 avant) |

**Un défaut trouvé en rejouant, et corrigé** : le lot 1 annonçait `?q=_` → 0 ;
il rendait en réalité **3 350** annonces. Le souligné de leboncoin restait collé
dans `search_text` (« exclusive_c4 » comptait pour un mot). Il est maintenant
traité comme le séparateur qu'il est, des deux côtés — libellé et recherche.
`?q=_` rend 0, `?q=exclusive` rend 647.

## 7. Les deux choses que je n'ai pas faites, et qui attendent un mot de toi

**(a) « DS DS 3 » → « DS 3 ».** 94 annonces où le modèle canonique commence par
la marque. Le brief fixait « DS DS 3 Crossback… » comme résultat attendu, donc je
l'ai livré tel quel — mais la correction tient en une ligne :

| aujourd'hui | avec la règle |
|---|---|
| DS **DS 3** Crossback PureTech 130ch (33) · DS DS 7 (27) · DS DS 4 (6) · DS DS 5 (2) | **DS 3** Crossback PureTech 130ch |
| **McLaren** Mclaren 720S 4.0 V8 (15) | **McLaren 720S** 4.0 V8 |
| **Abarth** Abarth 500 (11) | **Abarth 500** |

Zéro contre-exemple mesuré sur les 52 957 annonces. Dis oui et je l'ajoute.

**(b) « la version reprend un mot du modèle » — mesuré, puis écarté.** Retirer du
début de la version les mots que le modèle porte déjà corrigeait **92** libellés
(« New Beetle Beetle 1.9 » → « New Beetle 1.9 », « 812 Superfast 812 V12 » →
« 812 Superfast V12 », « Nemo Combi Nemo HDi70 » → « Nemo Combi HDi70 »,
« Classe E E 220 CDI » → « Classe E 220 CDI ») — **mais en abîmait 10**, là où le
site se contredit lui-même :

```
modèle « Classe A », version « Classe C Break 200 CDI Classic BV6 »
  aujourd'hui : Mercedes Classe A Classe C Break 200 CDI Classic BV6
  avec la règle : Mercedes Classe A C Break 200 CDI Classic BV6   ← « Classe » perdu
```

Perdre un mot utile est exactement ce que le brief demandait de traquer. Je l'ai
donc écartée : +92 / −10 n'est pas un échange que je fais sans toi, et la règle
n'était pas dans le brief.

**Un troisième point, gratuit, pour le lot 3** : le modèle « Ds3 » se range sous
**deux marques** — « Citroen / Ds3 » (70) et « Ds / Ds3 » (33). C'est la même
voiture. Un marchand qui filtre `brand=DS&model=DS 3` en voit 33 sur 103. Le
lot 1 avait tranché « Ds ≠ Citroen » au niveau des marques, ce qui reste juste ;
mais au niveau du **couple**, la contradiction est nette et chiffrée.

## 8. Ce qui a été écrit

| fichier | rôle | lignes |
|---|---|---|
| `shared/vehicle-aliases.json` | 83 marques, la règle des modèles, 70 exceptions groupées, 3 alias | 106 |
| `api/adscope_api/spelling.py` | **neuf** : `fold`, la table des marques, la règle du chiffre et ses exceptions | 105 |
| `api/adscope_api/taxonomy.py` | `canonical` (affichage), **`key`** (la clé repliée), `search_text`, `derive` | 85 |
| `api/adscope_api/naming.py` | **neuf** : `label` et ses trois retraits — sorti de `taxonomy` qui passait 150 lignes | 95 |
| `api/adscope_api/search.py` | `family` compare des clés repliées des deux côtés | 48 |

Rien d'autre n'a changé : ni migration, ni `models.py`, ni les routes.
`market_items.py` et `feed_query.py` importent `label` depuis `naming`.

## 9. Tests — 417, dont 27 de plus qu'au lot 1

`cd api && ./.venv/bin/pytest tests/ -q` → **417 passés**.
`node --test web/tests/*.test.mjs` → **61 passés** (lot `web/`, pas touché).

**390 au lot 1, 417 aujourd'hui.** La couche canonique et le libellé portent
désormais **62 tests** contre 35 au lot 1 — les 35 anciens ont été réécrits ou
déplacés dans le fichier de leur module.

| fichier | tests | au lot 1 |
|---|---|---|
| `tests/test_spelling.py` (neuf) | 10 | — |
| `tests/test_naming.py` (neuf) | 19 | — |
| `tests/test_taxonomy.py` (repris) | 16 | 21 |
| `tests/test_search.py` | 17 | 14 |
| `tests/test_revisit.py` | 16 | 15 |

**Chaque test nomme la ligne de production qui le fait rougir, et je l'ai prouvé
en la cassant** : 38 mutations, une ligne à la fois, remises en place après coup.
Quatre d'entre elles sont restées **vertes** au premier passage — le test nommait
une ligne qui ne le faisait pas rougir. Je les ai corrigées plutôt que de les
laisser mentir :

- `key=len, reverse=True` de `_phrases` n'était pas prouvé par le test « Land
  Rover ne mange pas Range Rover » (une seule suite en jeu) : c'est le test
  « DS 3 » qui le prouve, où « ds » doit passer après « ds3 ».
- `.replace(" ", "")` de `_phrases` : c'est le test du modèle de **deux mots**
  qui le prouve, pas celui du modèle sans espace — l'accumulation suffisait à
  celui-là.
- `if len(run) >= len(phrase): break` de `_span` n'avait **aucun effet
  observable** : j'ai restructuré `_span` pour que la borne décide (`si le poids
  est atteint, exiger l'égalité, sinon abandonner`), et elle est maintenant
  prouvée par le test du modèle de deux mots.
- `[w for w in … if w]` de `_trimmed` : prouvé par une version bordée d'espaces
  sans répétition, pas par celle où tout partait.

Les 38 mutations : `fold` sans `.lower()` ; la table des marques remplacée par la
forme observée, et son défaut remplacé ; la règle du chiffre retirée, puis
appliquée à la chaîne entière ; les exceptions court-circuitées ; les groupes du
fichier non aplatis ; `_tidy` sans son garde du vide ; `canonical` sans
`spelling`, sans alias, et avec un alias qui écrase le modèle donné ; `key` sans
son pli, et sans son garde du `None` ; `search_text` sans les formes observées,
sans les canoniques, sans dédoublonnage, sans pli, sans le souligné ; `derive`
qui écrit l'orthographe au lieu de la clé, et qui dit toujours « changé » ;
`label` sans le filtre « Autres », sans `NO_VEHICLE`, sans `_trimmed`, sans le
repli marque == modèle, sans les formes canoniques dans `_phrases`, sans
`canonical` ; `_phrases` mot à mot, sans le retrait des espaces, sans son tri,
sans le garde « Autres » ; `_span` sans accumulation, sans sa borne, en préfixe
au lieu d'égalité ; `_trimmed` qui ne reprend pas après un retrait, qui ignore le
souligné, qui garde les mots vides ; `_unglued` qui retire toujours le préfixe,
et qui ne le retire jamais ; `search.family` sur l'orthographe au lieu de la
clé ; `revisit._wanted` sur la colonne canonique au lieu de la forme observée.

**Aucun test ne lit l'horloge réelle** : `NOW` est posé à la main partout.
