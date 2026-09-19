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
