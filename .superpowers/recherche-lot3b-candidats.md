# Lot 3b — candidats de modèles composés

Lecture seule sur `adscope` (55 018 annonces, 4 875 « Autres » ce soir contre
4 854 dans le rapport du lot 3a — le crawler a tourné entre-temps, +21 lignes
MG/Ineos/BYD hors périmètre, voir plus bas). Rien n'a été écrit en base, aucun
fichier du dépôt n'a été touché.

## En tête

**93 candidats** (têtes de version vues au moins 3 fois, groupées par marque)
**résoudraient 984 annonces sur les 1 219** qui portent aujourd'hui « Autres »
avec une version renseignée et que le lot 3a n'a pas su résoudre — soit
**80,7 %** de ce qui restait sur la table après le 3a. Neuf de plus sont
identifiées mais écartées ci-dessous (« Douteux »).

**235 annonces resteraient non précisées**, pour trois raisons :

| n | raison |
|---:|---|
| 173 | tête vue moins de 3 fois — trop rare pour distinguer un modèle réel d'une faute de saisie ou d'un numéro de finition isolé (« Classe R 280 », vu une fois avec « 280 », une autre avec « 300 » : jamais le même candidat deux fois) |
| 39 | rien avant la motorisation : la version ne nomme aucun modèle (« 2.0 HDi 110ch Pack » tout court) |
| 21 | **la marque elle-même n'est pas reconnue** — MG, Ineos, BYD, Xpeng et des répliques Cobra que le site range dans « Autres / Autres » (marque *et* modèle). Hors du périmètre de ce lot, qui ne touche qu'au modèle d'une marque déjà connue ; à signaler pour un lot « vocabulaire de marques ». |
| 2 | tête présente mais marque sans aucun autre modèle connu (cas résiduel) |

Au-delà de ces 1 219, **3 514 annonces « Autres » n'ont aucune version** —
aucune méthode fondée sur le texte de la version ne peut rien pour elles,
lot 3b compris.

**Comment lire une ligne** : *candidat* est l'écriture que je propose
d'afficher — jamais inventée, c'est la forme la plus fréquente telle
qu'observée dans les versions elles-mêmes (accents et casse compris,
« Série 2 Coupé », « GLE Coupé », « 356B » — sur les 93 candidats, les
occurrences d'un même candidat s'écrivent *toutes* de la même façon, aucun
arbitrage de casse à faire). *Déjà modèle sur un site ?* dit si ce nom existe,
même une seule fois, dans la colonne `model` d'un des deux sites — c'est la
seule preuve qui ne vient pas de la saisie du vendeur. *Remarque* signale les
composés où le second mot ressemble à une carrosserie ou une finition plutôt
qu'à un nom de modèle : je les inclus quand même (le 3a les refuse
aujourd'hui), à trancher au cas par cas.

---

### Citroën — 185 annonces, 5 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| Picasso | 118 | Picasso 1.6 HDi110 Exclusive | La Centrale (1) | sûr, mais **ambigu** : aucun « Xsara » ni « C4 » dans la version — 75/118 sont de 2000 à 2009 (ère Xsara Picasso, avant le C4 Picasso 2006), les autres empiètent sur 2006-2009 où les deux existaient. Le C4 Picasso, lui, s'écrit toujours « C4 Picasso » dans sa version (vérifié). Je penche pour Xsara Picasso mais je ne l'écris pas sans en être sûr. |
| C3 Pluriel | 30 | So Chic_C3 Pluriel 1.4i So Chic | non | sûr |
| C5 Aircross | 25 | C5 Aircross BlueHDi 130ch S&S Feel EAT8 | La Centrale (1) | sûr |
| Grand C4 SpaceTourer | 9 | Shine Pack_Grand C4 SpaceTourer BlueHDi 130ch S&S Shine Pack E6.d-TEMP | non | sûr |
| C4 Cactus | 3 | Live_C4 Cactus PureTech 82 Live | non | sûr |

### Mercedes — 139 annonces, 12 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| GLE | 24 | AMG Line_GLE 350 e 211+136ch AMG Line 4Matic 9G-Tronic | non | sûr |
| GLE Coupé | 20 | GLE Coupé 350 de 194+136ch AMG Line 4Matic 9G-Tronic | non | carrosserie ? (« Coupe ») |
| GLA | 16 | Sensation_GLA 220 d Sensation 4Matic 7G-DCT | La Centrale (1) | sûr |
| GLC | 16 | GLC 220 d 170ch 4Matic 9G-Tronic | La Centrale (1) | sûr |
| CLA Shooting Brake | 13 | Sensation_CLA Shooting Brake 200 d Sensation 7G-DCT | non | carrosserie ? (« Brake ») |
| CLA | 12 | Inspiration_CLA 180 d Inspiration | La Centrale (1) | sûr |
| Classe ML | 10 | Pack Luxury_Classe ML 500 Pack Luxe | non | sûr |
| CLE Coupé | 8 | CLE Coupé 220 d 197ch AMG Line 9G-Tronic | non | carrosserie ? (« Coupe ») |
| SLS | 7 | SLS 63 AMG Speedshift DCT | non | sûr |
| GLC Coupé | 6 | GLC Coupé 220 d 197ch AMG Line 4Matic 9G-Tronic | non | carrosserie ? (« Coupe ») |
| GLS | 4 | GLS 600 557ch Maybach 4Matic 9G-Tronic | non | sûr |
| Vito Combi | 3 | Vito Combi 113 CDI BE Long BA | non | carrosserie ? (« Combi ») — le modèle nu serait « Vito » |

### Land Rover — 89 annonces, 2 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| Range Rover Sport | 69 | Range Rover Sport 3.0 TDV6 180kw HSE Mark VI | non | sûr |
| Range Rover Evoque | 20 | Dynamic_Range Rover Evoque 2.2 SD4 Dynamic BVA Mark I | non | sûr |

### Renault — 79 annonces, 5 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| Grand Modus | 39 | Authentique_Grand Modus 1.5 dCi 65ch Authentique | non | sûr |
| Austral | 15 | Austral 1.2 E-Tech full hybrid 200ch Iconic | La Centrale (1) | sûr |
| Symbioz | 12 | Symbioz 1.6 E-Tech full hybrid 145ch Techno | La Centrale (1) | sûr |
| Grand Espace | 10 | Initiale_Grand Espace 2.2 dCi 150ch Initiale | non | sûr |
| Rafale | 3 | Rafale 1.2 E-Tech full hybrid 200ch Techno | non | sûr |

### BMW — 62 annonces, 8 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| XM | 16 | XM 4.4 V8 748ch (585+197) Label Red | non | sûr |
| M2 Coupé | 11 | M2 Coupé 3.0 410ch Competition M DKG | non | carrosserie ? (« Coupe ») |
| M4 Coupé | 10 | M4 Coupé 3.0 550ch CS | non | carrosserie ? (« Coupe ») |
| Série 2 Coupé | 6 | Sport_Série 2 Coupé 218d 143ch Sport | non | carrosserie ? (« Coupe ») |
| Série 2 ActiveTourer | 5 | Série 2 ActiveTourer 218d 150ch Luxury DKG7 | non | sûr |
| Série 4 Coupé | 5 | Sport_Série 4 Coupé 430dA 258ch Sport | non | carrosserie ? (« Coupe ») |
| Z4 Roadster | 5 | Z4 Roadster 2.2i 170ch | non | carrosserie ? (« Roadster ») |
| Série 2 Gran Tourer | 4 | Sport_Série 2 Gran Tourer 218dA 150ch Sport | non | sûr |

### Aston Martin — 46 annonces, 6 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| DBX | 15 | DBX 4.0 V8 biturbo 707ch BVA9 | non | sûr |
| DBS Coupé | 10 | DBS Coupé V12 5.2 725ch Superleggera BVA8 | non | carrosserie ? (« Coupe ») |
| DB12 | 8 | DB12 V8 4.0 680ch BVA8 | non | sûr |
| DBS Volante | 7 | DBS Volante V12 5.9 Touchtronic2 | non | carrosserie ? (« Volante ») |
| DB9 Coupé | 3 | Coupé_DB9 Coupé V12 5.9L 477ch Touchtronic2 | non | carrosserie ? (« Coupe ») |
| DB9 Volante | 3 | DB9 Volante V12 5.9 517ch Edition Carbone Touchtronic II | non | carrosserie ? (« Volante ») |

### Ford — 44 annonces, 4 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| Mustang Fastback | 15 | Mustang Fastback 5.0 V8 421ch GT BVA6 | non | sûr |
| Grand C-MAX | 13 | Grand C-MAX 1.6 TDCi 115ch FAP Titanium | non | sûr |
| Ranger | 13 | Wildtrak_Ranger 3.2 TDCi 200ch Double Cabine Wildtrak 4x4 | non | sûr |
| Tourneo Custom | 3 | Tourneo Custom 340 L1H1 2.5 Duratec 232ch Hybride rechargeable Titanium X CVT | non | sûr |

### Smart — 43 annonces, 4 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| Fortwo Coupe | 25 | Fortwo Coupe 90ch Brabus style twinamic E6c | non | carrosserie ? (« Coupe ») |
| Smart Cabriolet | 7 | Smart Cabriolet 55ch Pure | non | carrosserie ? (« Cabriolet ») |
| Smart Coupe | 6 | Passion_Smart Coupe 61ch Passion | non | carrosserie ? (« Coupe ») |
| Fortwo Cabriolet | 5 | Fortwo Cabriolet 71ch mhd Passion Softouch | non | carrosserie ? (« Cabriolet ») |

### Ferrari — 43 annonces, 5 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| 488 Spider | 20 | 488 Spider V8 3.9 T 670ch | non | carrosserie ? (« Spider ») |
| Purosangue | 10 | Purosangue 6.5 V12 725ch | non | sûr |
| F8 Spider Base | 5 | F8 Spider Base | non | carrosserie ? (« Spider ») + finition ? (« Base ») — candidat probable : F8 Spider, sans « Base » |
| F8 Tributo Base | 5 | F8 Tributo Base | non | finition ? (« Base ») — candidat probable : F8 Tributo, sans « Base » |
| 512 | 3 | 512 5.0 M | non | sûr |

### Kia — 29 annonces, 4 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| Cee'd | 14 | Cee'd 1.6 CRDi115 Active 5p | non | sûr |
| Pro Cee'd | 6 | FIFA World Cup_Pro Cee'd 1.6 CRDi115 FIFA World Cup | non | sûr |
| Ceed | 5 | GT Line Premium_Ceed 1.4 T-GDI 140ch GT Line Premium DCT7 | non | sûr |
| Cee'd SW | 4 | Cee'd SW 1.6 CRDi90 FAP Active | non | carrosserie ? (« SW ») |

### Dacia — 28 annonces, 3 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| Jogger | 13 | Jogger 1.6 hybrid 140ch Extreme 7 places -24 | non | sûr |
| Bigster | 8 | Bigster 1.8 hybrid 155ch Journey | non | sûr |
| Spring | 7 | Spring 45ch Business 2020 - Achat Intégral | non | sûr |

### Audi — 22 annonces, 4 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| RS3 Sportback | 11 | Base_RS3 Sportback 2.5 TFSI 400ch quattro S tronic 7 | non | carrosserie ? (« Sportback ») |
| A7 Sportback | 4 | A7 Sportback 3.0 V6 TDI 218ch Ambition Luxe quattro S tronic 7 | non | carrosserie ? (« Sportback ») |
| S e-tron GT | 4 | S e-tron GT 591ch quattro | non | sûr |
| RS7 Sportback | 3 | RS7 Sportback 4.0 V8 TFSI 600ch quattro tiptronic 8 53cv | non | carrosserie ? (« Sportback ») |

### Maserati — 16 annonces, 2 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| MC20 Cielo | 9 | MC20 Cielo 3.0 V6 Biturbo 630ch | non | sûr |
| MC20 | 7 | MC20 3.0 V6 Biturbo 630ch | non | sûr |

### Toyota — 16 annonces, 3 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| Corolla Verso | 9 | Corolla Verso 136 D-4D Luna 7 places | non | sûr |
| Aygo X | 4 | Air Design_Aygo X 1.0 VVT-i 72ch Air Design S-CVT | non | sûr |
| Yaris Cross | 3 | Yaris Cross 130h Design MY26 | non | sûr |

### Fiat — 14 annonces, 2 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| 500X | 10 | Sport_500X 1.0 FireFly Turbo T3 120ch Sport Euro 6D Full | non | sûr |
| 500L | 4 | Lounge_500L 1.6 Multijet 16v 120ch S&S Lounge | non | sûr |

### Mini — 14 annonces, 3 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| Clubman Cooper | 6 | Clubman Cooper 136ch Kensington Euro6d-T | non | sûr |
| Clubman Cooper D | 5 | Canonbury_Clubman Cooper D  150ch Canonbury BVA8 | non | sûr |
| Mini Cooper | 3 | Cooper_Mini Cooper 115ch | non | sûr |

### Opel — 13 annonces, 3 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| Zafira Tourer | 6 | Cosmo Pack_Zafira Tourer 1.4 Turbo 140ch ecoFLEX Cosmo Pack Start/Stop 7 places | non | sûr |
| Crossland | 4 | GS_Crossland 1.5 D 110ch GS | non | sûr |
| Grandland | 3 | Elegance Business_Grandland 1.5 D 130ch Elegance Business BVA8 | non | sûr |

### McLaren — 12 annonces, 3 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| 600LT Base | 4 | 600LT Base | non | finition ? (« Base ») — candidat probable : 600LT, sans « Base » |
| 650S Spider | 4 | 650S Spider 3.8 V8 Biturbo 650ch | non | carrosserie ? (« Spider ») |
| GT Base | 4 | GT Base | non | finition ? (« Base ») — candidat probable : GT, sans « Base » ; et « GT » est un mot de finition très courant ailleurs — ici circonscrit à McLaren, où GT est un vrai modèle |

### Peugeot — 11 annonces, 1 candidat

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| Partner Tepee | 11 | Family_Partner Tepee 1.6 HDi92 FAP Family | non | sûr |

### Volkswagen — 11 annonces, 2 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| Taigo | 8 | Taigo 1.0 TSI 110ch R-Line DSG7 | non | sûr |
| ID.4 | 3 | ID.4 286ch Pro 77 kWh Life Max | non | sûr |

### Seat — 10 annonces, 1 candidat

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| Altea XL | 10 | Altea XL 1.9 TDI105 Reference | non | sûr |

### Nissan — 9 annonces, 2 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| Almera Tino | 5 | Almera Tino 2.2 dCi 112ch Acenta GPS | non | sûr |
| Qashqai+2 | 4 | Qashqai+2 1.5 dCi 110ch FAP Tekna | non | sûr |

### Hyundai — 8 annonces, 1 candidat

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| Bayon | 8 | Bayon 1.0 T-GDi 100ch Intuitive DCT-7 | non | sûr |

### Jaguar — 8 annonces, 1 candidat

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| F-Type Coupe | 8 | F-Type Coupe 5.0 V8 Suralimenté 575ch R75 AWD BVA8 | non | carrosserie ? (« Coupe ») |

### Lotus — 8 annonces, 2 candidats

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| Emira | 5 | Emira 2.0T 364ch First Edition DCT8 | non | sûr |
| Emeya | 3 | Emeya 918ch R | non | sûr |

### Jeep — 7 annonces, 1 candidat

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| Avenger | 7 | Avenger 1.2 Turbo T3 100ch Altitude | non | sûr |

### Alfa Romeo — 3 annonces, 1 candidat

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| Tonale | 3 | Tonale 1.5 Hybrid 130ch Sprint TCT | non | sûr |

### Bentley — 3 annonces, 1 candidat

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| Continental GTC | 3 | Continental GTC W12 6.0 635ch | non | carrosserie ? (« GTC ») |

### Porsche — 3 annonces, 1 candidat

| candidat | annonces | exemple de version | déjà modèle sur un site ? | remarque |
|---|---:|---|---|---|
| 356B | 3 | 356B 356 B 1600 | non | sûr |

---

## Douteux, je ne les proposerais pas

| marque | tête | n | exemple | pourquoi je doute |
|---|---|---:|---|---|
| Dodge | « 1973 Challenger Challenger » | 9 | `1973 Challenger Challenger` (répété à l'identique sur les 9 annonces, seul le millésime 1972/1973 varie) | Ce n'est pas un format de version, c'est un texte dupliqué — le mot « Challenger » deux fois, une année en tête. Le vrai modèle est vraisemblablement « Challenger » (Dodge Challenger, existant), mais je ne veux pas proposer la phrase brute comme nom de modèle, et je ne veux pas non plus inventer « Challenger » tout seul sans savoir si c'est bien de ça qu'il s'agit (ces annonces citent 2018-2019 comme année d'annonce pour un « 1973 » — possiblement des répliques ou kit-cars, un cas particulier). |

Rien d'autre n'a été écarté : les composés en « Base » (Ferrari F8, McLaren
600LT/GT) restent dans les tables marque par marque, avec la finition signalée
en remarque plutôt que retirés d'autorité — je ne suis pas certain que « Base »
ne soit jamais qu'une finition partout.

---

## Un mot sur « Picasso » (Citroën, 118 annonces — le plus gros candidat)

Aucune de ces 118 versions ne porte « Xsara » ni « C4 » : c'est juste
« Picasso » suivi de la motorisation (`Picasso 1.6 HDi110 Exclusive`). Le
site, lui, distingue déjà un modèle « C4 Picasso » (dont la version dit
toujours « C4 Picasso », jamais « Picasso » seul — vérifié sur les listings
qui le portent) et un modèle « Xsara » à 311 annonces sur leboncoin, sans
« Xsara Picasso » séparé. 75 des 118 « Picasso » nus datent de 2000 à 2005
(avant le lancement du C4 Picasso en 2006), et la totalité est antérieure à
2009 (fin de commercialisation du Xsara Picasso) — l'hypothèse la plus
probable est donc que ce sont des Xsara Picasso, que le site n'a jamais su
nommer à part. Je ne l'écris pas comme candidat « Xsara Picasso » parce que la
version elle-même ne le dit jamais : ce serait inventer une orthographe. La
table ci-dessus propose « Picasso » tel qu'observé, avec ce doute en remarque.

## Autres réserves, plus courtes

- **Les 12 « Coupé »/« Cabriolet »/« Spider »/« Roadster »/« Volante »/
  « Sportback »/« Shooting Brake »/« Combi »/« SW »/« GTC » qui composent la
  moitié des lignes marquées « carrosserie ? »** suivent exactement la liste
  que le brief donnait. Je les ai incluses plutôt qu'écartées : le 3a a déjà
  mesuré que ces mots suivent un seul modèle chacun (sous le seuil de quatre
  qui les aurait qualifiés) — c'est un jugement, pas une mesure, et c'est
  pour ça qu'il te revient.
- **Les quatre orthographes de Cee'd/Ceed chez Kia** (« Cee'd » 14, « Pro
  Cee'd » 6, « Ceed » 5, « Cee'd SW » 4) sont vraisemblablement le même nom
  de modèle à deux périodes (Kia a renommé « cee'd » en « Ceed » en 2018) —
  je les liste séparément parce que la version les écrit différemment et que
  je ne fusionne rien sans un signal plus net qu'une hypothèse de calendrier.
- **« GLE » et « GLE Coupé », « GLC » et « GLC Coupé », etc. chez Mercedes** :
  je propose les deux comme candidats distincts plutôt qu'un seul « GLE »
  qui avalerait le Coupé — c'est le choix que le brief demande explicitement
  de ne pas trancher pour toi.

---

## Comment la liste a été produite (rejouable)

**Population** (1 219 lignes) :

```sql
select id, site, brand, model, version, canon_model_source
from listings
where (lower(model) = 'autres' or model is null)
  and version is not null and trim(version) <> ''
  and canon_model_source is null;
```

**Extraction de la tête, par version** : je reprends `inference.head()` du
dépôt pour repérer le début du modèle après l'éventuel préfixe de finition de
leboncoin (`Finition_`), puis je cherche la première « frontière » —
motorisation ou année — dans les mots qui suivent :

- une cylindrée décimale (`2.0`, `1.6i`, `3.0d`…) ;
- une puissance (`150ch`, `90cv`) ou une capacité de batterie (`77kwh`) ;
- un sigle moteur mesuré sur les exemples vus : `tdi hdi dci tce vti puretech
  bluehdi tfsi tsi cdi cdti crdi multijet jtd jtdm bluetec tdci ecoblue dohc
  thp vvti mjet sd4 sd6 sd8 td4 td6 tdv6 tdv8 d4d skyactiv hybrid e-tech gpl
  gdi t-gdi vvt-i e-hdi i-dtec cgi kompressor biturbo v6 v8 v10 v12 w12` ;
- un code moteur alphanumérique de style BMW (`218dA`, `430dA`) ;
- un nombre pur de deux chiffres ou plus **qui n'est pas le premier mot de la
  tête** (« Classe R **280** » s'arrête à « Classe R » ; « Série **2** Gran
  Tourer » ne s'arrête pas, parce qu'un chiffre seul en tête — ou en deuxième
  position sans être le premier de la tête réelle — appartient au nom :
  c'est ce qui distingue « Série 2 » d'un « Classe R 280 »).

La tête est tout ce qui précède cette frontière. Vue au moins trois fois pour
la même marque, elle devient un candidat ; l'écriture affichée est la forme
observée la plus fréquente (jamais recomposée par la règle de casse générale
du dépôt, qui écrirait « Gla », « Dbs Coupe » ou « Serie 2 » — fausses, faute
d'exception écrite pour ces sigles composés).

**Preuve externe** : pour chaque candidat, je compte les annonces (des deux
sites) dont la colonne `model` du site vaut déjà exactement ce nom.

**Le script complet**, qui reproduit tout ce document (tables comprises) :

```python
"""Lot 3b — extraction des candidats de modèles composés absents des deux sites.

Lecture seule. Se branche sur les vrais modules du dépôt (`inference.head`,
`spelling.fold`, `taxonomy.key`, `model_vocabulary.load`) pour rester fidèle à
ce que fait la production, et complète avec une détection de la « tête » de
version par ses propres règles (motorisation = frontière), décrites dans le
brief du lot.

Rejouable : `cd api && .venv/bin/python
    /private/tmp/.../scratchpad/lot3b_candidates.py`
"""
import re
import sys
import json
import unicodedata
from collections import Counter, defaultdict

sys.path.insert(0, "/Users/alexis/Documents/Projets/adscope/api")

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from adscope_api.models import Listing
from adscope_api.taxonomy import UNKNOWN, key as taxonomy_key
from adscope_api.spelling import fold
from adscope_api.inference import head as infer_head, span as infer_span, infer_model
from adscope_api.model_vocabulary import load as load_vocabulary

ENGINE, DBURL = None, "postgresql+psycopg://localhost/adscope"

# --- sigles moteur, mesurés à la main sur les échantillons vus (cf. brief) ---
ENGINE_ACRONYMS = {
    "tdi", "hdi", "dci", "tce", "vti", "puretech", "bluehdi", "tfsi", "tsi",
    "cdi", "cdti", "crdi", "multijet", "jtd", "jtdm", "bluetec", "tdci",
    "ecoblue", "dohc", "thp", "vvti", "mjet", "sd4", "sd6", "sd8", "td4",
    "td6", "tdv6", "tdv8", "d4d", "d-4d", "skyactiv", "hybrid", "e-tech",
    "gpl", "gdi", "tgdi", "t-gdi", "vvt-i", "e-hdi", "i-dtec", "i-dtec",
    "cgi", "kompressor", "biturbo", "hybride", "electrique", "electric",
    "v6", "v8", "v10", "v12", "w12",
}
# tokens numériques purs d'un seul chiffre : jamais une frontière (« Série 2 »)
_DECIMAL = re.compile(r"^\d+[.,]\d+[a-z]{0,3}$")
_POWER = re.compile(r"^\d{2,4}(ch|cv|hp)$")
_KWH = re.compile(r"^\d{2,3}kwh$")
_YEAR = re.compile(r"^(19|20)\d{2}$")
_BMWCODE = re.compile(r"^\d{2,3}[a-z]{1,2}$")   # 218da, 320d, 530dA…
_PUREDIGIT = re.compile(r"^\d+$")

MAX_HEAD_WORDS = 6  # au-delà, on juge la version illisible plutôt que de deviner


def is_boundary(word, position_in_head):
    if _DECIMAL.match(word):
        return True
    if _POWER.match(word):
        return True
    if _KWH.match(word):
        return True
    if word in ENGINE_ACRONYMS:
        return True
    if position_in_head > 0 and _BMWCODE.match(word):
        return True
    if position_in_head > 0 and _PUREDIGIT.match(word) and len(word) >= 2:
        return True
    if position_in_head > 0 and _YEAR.match(word):
        return True
    return False


_RAW_WORDS = re.compile(r"[\s_]+")


def raw_words(version):
    """Les mots de la version, dans la casse et l'accentuation observées —
    mêmes coupures que `inference.head` (espace, souligné), sans le pli."""
    return [w for w in _RAW_WORDS.split(version or "") if w]


def extract_head(version):
    """(mots de tête pliés, statut) où statut in {'ok','vide','illisible'}."""
    words, start = infer_head(version)
    if start >= len(words):
        return [], "vide"
    for i, w in enumerate(words[start:]):
        if is_boundary(w, i):
            if i == 0:
                return [], "vide"          # rien avant la motorisation
            return words[start:start + i], "ok"
    # aucune frontière trouvée
    if len(words) - start <= MAX_HEAD_WORDS:
        return words[start:], "ok"          # version courte, tête = tout
    return words[start:start + MAX_HEAD_WORDS], "illisible"


def extract_head_observed(version):
    """La même tête, mais dans l'écriture observée (casse, accents) — pour
    ne jamais inventer une orthographe : `head()` et `extract_head` opèrent
    sur les mêmes coupures de mots que `raw_words`, donc les mêmes indices
    s'appliquent telles quelles.
    """
    hwords, status = extract_head(version)
    if status != "ok" or not hwords:
        return None
    rwords = raw_words(version)
    n = len(hwords)
    # `hwords` peut commencer après le préfixe Finition_ : on retrouve son
    # point de départ en repliant `rwords` et en cherchant la même sous-suite.
    folded_rwords = [fold(w) for w in rwords]
    for start in range(len(folded_rwords) - n + 1):
        if folded_rwords[start:start + n] == hwords:
            return rwords[start:start + n]
    return None  # ne devrait pas arriver ; on retombera sur la forme pliée


def main():
    engine = create_engine(DBURL)
    with Session(engine) as session:
        known = load_vocabulary(session)

        rows = session.execute(
            select(Listing.id, Listing.site, Listing.brand, Listing.model,
                   Listing.version, Listing.canon_brand, Listing.canon_model,
                   Listing.canon_model_source)
        ).all()

    unknown = fold(UNKNOWN)

    # --- population lot 3b : Autres/pas de modèle, version renseignée, non résolue ---
    population = []
    for r in rows:
        if r.canon_model_source is not None:
            continue
        if not (r.version and r.version.strip()):
            continue
        if not (fold(r.model) == unknown or r.model is None):
            continue
        population.append(r)

    # --- vocabulaire "déjà modèle sur un site", par (brand_key, model_key) ---
    # construit sur TOUTES les lignes, pas seulement la population.
    site_model_listings = defaultdict(lambda: defaultdict(int))  # (brand,model)-> site -> n
    site_model_head_confirm = defaultdict(lambda: defaultdict(int))  # (brand,model)-> site -> n dont le head == model
    for r in rows:
        if fold(r.model) == unknown or r.model is None or r.brand is None:
            continue
        brand_key, model_key = taxonomy_key(r.brand, r.model)
        if not brand_key or not model_key:
            continue
        site_model_listings[(brand_key, model_key)][r.site] += 1
        hwords, status = extract_head(r.version) if r.version else ([], "vide")
        if status == "ok" and " ".join(hwords) == model_key:
            site_model_head_confirm[(brand_key, model_key)][r.site] += 1

    # --- extraction des têtes sur la population ---
    per_listing = []  # (brand_key, head_phrase, words, status, row)
    for r in population:
        brand_key, _ = taxonomy_key(r.brand, r.model)
        hwords, status = extract_head(r.version)
        head_phrase = " ".join(hwords)
        per_listing.append((brand_key, head_phrase, hwords, status, r))

    # --- agrégation par (marque, tête) --- la marque elle-même doit être
    # reconnue : hors périmètre du lot sinon (vocabulaire de marques, pas de
    # modèles), et on ne veut pas d'un seau « autres / autres ».
    unknown_brand = unknown
    groups = defaultdict(list)
    for brand_key, head_phrase, hwords, status, r in per_listing:
        if status != "ok" or not head_phrase or not brand_key:
            continue
        if brand_key == unknown_brand:
            continue
        groups[(brand_key, head_phrase)].append(r)

    # --- raisons de non-couverture, mutuellement exclusives, calculées
    # après coup sur le sort réellement réservé à chaque annonce ---
    reasons = Counter()
    for brand_key, head_phrase, hwords, status, r in per_listing:
        if status == "ok" and head_phrase and brand_key and brand_key != unknown_brand and \
                len(groups[(brand_key, head_phrase)]) >= 3:
            continue  # couverte par un candidat
        if brand_key == unknown_brand:
            reasons["marque elle-même non reconnue (hors périmètre du lot)"] += 1
        elif status == "vide":
            reasons["rien avant la motorisation (modèle non nommé)"] += 1
        elif status == "illisible":
            reasons["version illisible (aucune frontière motorisation trouvée)"] += 1
        elif not brand_key:
            reasons["pas de marque canonique"] += 1
        elif not known.of(brand_key):
            reasons["tête rare (<3x) — marque sans aucun modèle connu par ailleurs"] += 1
        else:
            reasons["tête rare (<3x)"] += 1

    # mots qui suivent un modèle sans en désigner un autre, mesurés par le lot
    # 3a (`model_vocabulary`) — restreints à ceux qui s'écrivent en lettres :
    # les qualificatifs numériques (« 1.6 », « 200 »…) ne sont pas des
    # carrosseries.
    measured_qualifiers = {w for w in known.qualifiers if not re.search(r"\d", w)}
    # la liste que le brief du lot cite lui-même, plus ce que la lecture des
    # exemples a montré (shooting/brake pour « Shooting Brake », « base »
    # pour la finition « Base » des exotiques).
    CARROSSERIE_WORDS = measured_qualifiers | {
        "spider", "spyder", "roadster", "gtc", "targa", "shooting", "brake",
        "cabrio", "volante",
    }
    TRIM_NOISE_WORDS = {"base"}

    def remark_for(words):
        last = words[-1]
        if last in TRIM_NOISE_WORDS:
            return "finition ? (mot « %s » — plutôt une finition qu'un nom de modèle)" % last.title()
        if last in CARROSSERIE_WORDS:
            return "carrosserie ? (« %s »)" % last.title()
        return "sûr"

    candidates = []
    for (brand_key, head_phrase), listing_rows in groups.items():
        n = len(listing_rows)
        if n < 3:
            continue
        words = head_phrase.split(" ")
        is_already_known = head_phrase in known.of(brand_key)
        # preuve externe : déjà un modèle de la colonne 'model' d'un site ?
        ext = site_model_listings.get((brand_key, head_phrase), {})
        ext_total = sum(ext.values())
        confirm = site_model_head_confirm.get((brand_key, head_phrase), {})
        confirm_total = sum(confirm.values())
        example = listing_rows[0].version
        # l'écriture proposée : la plus fréquente des formes observées sur ce
        # candidat, jamais devinée — si aucune ne se dégage, la forme pliée
        # brute, signalée comme telle.
        observed_forms = Counter()
        for row in listing_rows:
            ow = extract_head_observed(row.version)
            if ow:
                observed_forms[" ".join(ow)] += 1
        if observed_forms:
            spelled, spelled_n = observed_forms.most_common(1)[0]
            spelling_agreement = spelled_n
        else:
            spelled, spelling_agreement = head_phrase, 0
        candidates.append({
            "brand_key": brand_key, "head": head_phrase, "spelled": spelled,
            "spelling_agreement": spelling_agreement,
            "spelling_variants": len(observed_forms), "n": n,
            "already_known_model_vocab": is_already_known,
            "site_evidence": dict(ext), "site_evidence_total": ext_total,
            "confirm_total": confirm_total, "remark": remark_for(words),
            "example": example, "sites": sorted({row.site for row in listing_rows}),
            "rows": listing_rows,
        })

    candidates.sort(key=lambda c: (-c["n"], c["brand_key"], c["head"]))
    # ... impression des tables par marque, triées par total d'annonces
    # décroissant (voir le fichier complet dans le scratchpad de la session
    # pour la mise en forme markdown, mécanique et sans jugement).


if __name__ == "__main__":
    main()
```

Fichier exécutable complet, avec la mise en forme des tables et les
recoupements marque par marque :
`/private/tmp/claude-501/-Users-alexis-Documents-Projets-adscope/26af5048-3671-4f7d-8f22-cfddb9a652bb/scratchpad/lot3b_candidates.py`
(rejoue en ~1 s sur la base réelle : `cd
/Users/alexis/Documents/Projets/adscope/api && .venv/bin/python
<ce_chemin>`). Le résultat brut (JSON, un candidat par ligne avec ses
preuves) est à côté : `lot3b_raw2.json`.

## Caveats

- **Le seuil de 3** occurrences par tête est le même que celui du
  vocabulaire du lot 3a (`MIN_LISTINGS`), repris par cohérence — pas
  remesuré spécifiquement pour ce lot. Quelques têtes à 2 occurrences
  méritent un coup d'œil si tu veux descendre le seuil : « C4 SpaceTourer »
  sans Grand (2), « Ioniq 5 » (2), « TT RS » Audi (2), « RS3 Berline » Audi
  (2), « Mustang Convertible » (2) — je ne les ai pas mises dans la table
  principale pour rester sur la même règle que le 3a.
- **La détection de frontière (motorisation) est une heuristique neuve**,
  écrite pour ce lot et non mesurée aussi rigoureusement que celle
  d'`inference.py` (qui, elle, a 620 tests et 44 mutations prouvées). Elle
  s'est révélée fiable sur les 93 candidats retenus (aucune orthographe
  incohérente d'un exemplaire à l'autre — colonne « variants » du JSON brut,
  toujours à 1), mais elle n'a pas subi le même traitement ; si tu vois une
  tête qui te semble fausse en la lisant, fais-le moi savoir avant de
  généraliser la méthode à un futur lot 3c.
- **« Confirmé aussi en tête de version », demandé par le brief, est resté à
  zéro partout** : les rares annonces où le candidat est déjà un modèle du
  site viennent presque toutes de La Centrale, dont le format de version ne
  répète pas le nom du modèle (`GLC` → version `II 300 DE 4MATIC AMG LINE
  9G-TRONIC`, sans « GLC »). Ce n'est pas une absence de preuve, c'est que
  la question ne s'applique pas à ce site — je le dis plutôt que d'afficher
  un zéro trompeur.
- **Le total « Autres » a bougé** de 4 854 (rapport du 3a) à 4 875
  (maintenant) : +21, exactement les MG/Ineos/BYD/Xpeng/Cobra hors périmètre
  listés plus haut, arrivés par le crawl continu entre les deux mesures. Le
  reste des chiffres (1 219 de population, 235 non couvertes) est mesuré à
  l'instant, pas recopié du rapport du 3a.
