# Lot « champs manquants » — API, 2026-09-19

Périmètre : `api/` seulement. HEAD de départ `57e67b0` ; un lot parallèle
(`extension/`, commit `95aa790`) a avancé HEAD pendant ce travail — rien de
ce qu'il touche ne recoupe `api/`, aucun conflit. Ce lot commite sur
`95aa790`.

## Ce qui a été fait

1. **Migration 011** (`pg_dump` dans `~/adscope-backups/` avant, appliquée
   sur la base réelle `adscope`, 52 965 → 52 981 annonces pendant le lot —
   le balayage tourne en parallèle) : trois colonnes vides sur `listings` —
   `fuel varchar(24)`, `gearbox varchar(16)`, `department varchar(3)`. Pas
   d'index posé : mesuré sur la base réelle (`EXPLAIN ANALYZE`), un
   `Seq Scan` sans index sur une colonne comparable (`postal_code = '75015'`)
   coûte 15 ms à ce volume, contre 13 ms pour un index existant du même
   ordre (`seller_type`) — et les filtres attendus se combinent presque
   toujours à marque/modèle, déjà indexés (`ix_listings_canon`). À
   reconsidérer si la base grossit d'un ordre de grandeur.

2. **`api/adscope_api/vocab.py`** (neuf) : le vocabulaire fermé
   `FUEL_VALUES` / `GEARBOX_VALUES`, et `canonical(value, values, field)` qui
   replie en minuscules ASCII et range tout ce qui n'y figure pas dans
   `autre`, journalisé (`logging.getLogger("adscope.vocab")`, niveau
   `warning`, comme `disappearance.py`) — jamais un refus, l'observation
   entière ne doit pas se perdre pour un fait secondaire. Vérifié identique,
   après coup, au vocabulaire que le lot `extension/` (95aa790) envoie déjà
   : mêmes 7 valeurs fuel, mêmes 2 gearbox, GNV et Hydrogène retombant tous
   les deux sur `autre` des deux côtés.

3. **`api/adscope_api/department.py`** (neuf) : `is_complete` (cinq
   chiffres), `normalize` (département reçu directement — deux ou trois
   chiffres, ou 2A/2B, jamais tronqué), `of_postal_code` (la règle Corse/DOM
   du rapport de reconnaissance). Là aussi vérifié identique à la fonction
   JS `vehicleFields.department` du lot extension.

4. **`intake.py`** : trois champs optionnels sur `ObservationIn` —
   `fuel`/`gearbox` passés par `vocab.canonical`, `department` validé puis
   dérivé du code postal *seulement* si l'observation n'en porte pas déjà un
   (le site fait autorité). `postal_code` n'est retenu que **complet** (cinq
   chiffres) — un fragment envoyé par erreur sous ce nom désignerait une
   autre commune.

5. **`observations.py`** : les trois champs rejoignent `VEHICLE_FIELDS`
   (même ligne que `postal_code`/`seller_type`) — un seul endroit change,
   la règle « une observation qui ne les porte pas n'efface rien » est déjà
   celle qui régit ce tuple. Le fichier tenait pile 150 lignes avant ce lot
   : les bornes de publication (`published_at`/`bumped_at`/
   `published_days_ago`) sont extraites dans **`publication.py`** (neuf),
   qui ramène `observations.py` à 136 lignes.

6. **`market_items.py`, `market_query.py`, `feed_query.py`** : `fuel`,
   `gearbox`, `department` dans `ItemOut`, sélectionnés en SQL, filtrables
   (`fuel=`, `gearbox=`, `department=`, répétables, combinés en « ou » au
   sein d'un champ et en « et » entre champs). `market.py` : les filtres
   `fuel`/`gearbox` sont typés `list[Fuel|Gearbox] | None` — une valeur hors
   vocabulaire est un 422 posé par FastAPI/pydantic lui-même. `department`
   n'est pas un vocabulaire fermé (une centaine de codes) : validé au format
   par `department.normalize`, 422 sinon, jamais un filtre muet qui ne rend
   jamais rien.

7. **`data_health`** : `field_fill_rate` (taux de remplissage des trois
   champs, toute la base et la fenêtre — sur `last_seen`, pas `first_seen`
   : l'existant se remplit au fil du balayage, une annonce ancienne revue
   cette semaine doit compter) et `version_names_another_model`, la ligne
   promise à Alexis, dans un module neuf **`data_health_fields.py`**
   (`data_health_queries.py` aurait dépassé 150 lignes). Les deux sont
   informationnelles, jamais dans `Report.alerts`.

## La ligne promise à Alexis, mesurée deux fois

Implémentation naïve (tout modèle connu de la marque, ≥ 5 annonces) : **714
sur 16 174** — bien au-dessus du 74/16 167 mesuré à la main le 2026-09-19.
Inspection des faux positifs sur la base réelle : deux classes dominent,

- un modèle qui n'est que la famille plus large d'un autre (« C3 » dans
  « C3 Aircross », « Cherokee » dans « Grand Cherokee », « Range Rover »
  dans « Range Rover Velar ») — la version d'un modèle dérivé commence
  presque toujours par le nom de la famille, ce n'est pas une contradiction ;
- un modèle réduit à un seul nombre (« 200 », « 300 » chez Mercedes) — un
  code de finition ou de motorisation mal extrait en modèle, qui se glisse
  dans la quasi-totalité des versions de la marque.

Les deux exclues (`_is_sub_model`, mots de l'un sous-ensemble de l'autre ;
`_is_bare_number`, modèle à un seul token entièrement numérique) : **102 sur
16 181**, en tête les trois paires citées par Alexis — Mégane/Scénic (40),
Bentley Coupé/Continental (24), Grande Punto/Punto Evo (10) — puis une
trentaine de paires à un ou deux exemplaires. L'écart avec 74/16 167 reste
dans l'ordre du bruit de méthode (une mesure à la main a pu écarter des cas
supplémentaires au jugement) ; les deux filtres retenus sont testés
(`test_a_sub_model_is_not_a_contradiction`,
`test_a_bare_numeric_model_is_never_considered_known`) et documentés dans
`data_health_fields.py`. Information seulement, jamais une alerte.

## Vérifié en vrai

- `./.venv/bin/pytest tests/ -q` : **516 passés** (456 avant ce lot, 60
  ajoutés), aucun échec, aucun test qui lit l'horloge réelle.
- `pg_dump -Fc adscope` → `~/adscope-backups/adscope-20260919-153553-avant-011-fuel-gearbox-departement.dump`
  avant la migration.
- `scripts/migrate.py` appliqué sur `adscope` (réelle) : `011_listings_fuel_gearbox_department`
  seul appliqué, colonnes vides confirmées (`SELECT count(*) WHERE fuel IS
  NOT NULL` → 0).
- `launchctl kickstart -k gui/$UID/fr.adscope.api` : service relancé, `GET
  /v1/market` (401 sans licence valide) et `GET /app/` (200) répondent.
- **Pas d'écriture d'essai dans la base réelle** : `test_fuel_gearbox_department_travel_from_post_to_market`
  poste une observation portant les trois champs par la vraie route HTTP
  (`Bearer`, licence de test) sur `adscope_test`, vérifie qu'elle ressort
  filtrable sur `/v1/market`. La base réelle est passée de 52 965 à 53 004
  annonces pendant le lot (le balayage tourne), zéro n'a `fuel`/`gearbox`/
  `department` posé après la migration — confirmé après coup.

## Réserves

- Le seuil `KNOWN_MODEL_MIN_LISTINGS = 5` et les deux exclusions de la ligne
  « version qui nomme un autre modèle » sont un choix a posteriori, ajusté
  sur la base réelle pour se rapprocher de la mesure à la main d'Alexis —
  pas une preuve que 102 est le compte « vrai », seulement qu'il est
  raisonnable et documenté.
- GNV et Hydrogène (codes leboncoin 7 et 9) retombent sur `autre` des deux
  côtés (API et extension) faute de case dédiée dans le vocabulaire suggéré
  par la tâche — décision reportée à Alexis, non prise ici.
- La règle Corse (2A/2B) et la dérivation DOM restent non vérifiées sur une
  annonce réelle des deux sites (aucune croisée pendant la recherche qui a
  précédé ce lot) — codées, testées sur des cas construits, jamais sur une
  observation réelle corse ou domienne.
- Aucun index posé sur `fuel`/`gearbox`/`department` : mesuré suffisant au
  volume actuel (52 981 annonces), à reconsidérer si la base grossit d'un
  ordre de grandeur ou si un filtre isolé (département seul, par ex.)
  s'avère lent en usage réel une fois l'extension en production.

## Revue fermée, 2026-09-19 — le membre du tuple que rien ne gardait, GNV/Hydrogène

Base 07dc761. Fichiers touchés : `adscope_api/vocab.py`, `tests/test_vocab.py`,
`tests/test_intake.py`, `tests/test_market.py`, `tests/test_observations.py`.
Aucun sous-agent dispatché.

### 1. `postal_code` retiré de `VEHICLE_FIELDS`, rien ne rougissait

Chaque membre de `VEHICLE_FIELDS` retiré un par un, suite complète relancée à
chaque fois (script jetable, jamais commité) :

| membre        | retrait sans lui fait rougir…                                          |
|----------------|--------------------------------------------------------------------------|
| `brand`        | `test_signals.py` (4 tests, empreinte absente)                          |
| `model`        | idem                                                                     |
| `version`      | idem                                                                     |
| `year`         | idem                                                                     |
| `mileage`      | idem                                                                     |
| `postal_code`  | **aucun** — 516/516 verts sans lui                                       |
| `seller_type`  | `test_signals.py::test_seller_type_is_stored`                           |
| `fuel`         | `test_observations.py` (2), `test_routes.py::test_fuel_gearbox_department_travel_from_post_to_market` |
| `gearbox`      | idem                                                                     |
| `department`   | idem                                                                     |

`postal_code` était écrit (`obs()` le porte par défaut dans les fixtures) mais
jamais relu sur `listing.postal_code` après `record` — seul `ObservationIn.postal_code`
(la validation d'entrée) et son effacement (`test_gauge.py`) étaient couverts.
Trois tests ajoutés à `test_observations.py`, même trio de preuves que
fuel/gearbox/department : écrit, jamais effacé par une observation muette,
corrigé par une observation suivante. Vérifiés en les faisant rougir (retrait
de `"postal_code"` du tuple → les trois rougissent, seuls). Suite : **519**
avant la partie 2.

### 2. GNV et Hydrogène : leur propre case dans `FUEL_VALUES`

`vocab.py` : `FUEL_VALUES`/`Fuel` gagnent `gnv` (code leboncoin 7) et
`hydrogene` (code 9), `autre` ne gardant plus que le code 5. Aucun autre
fichier API ne portait ce vocabulaire en dur (`grep` sur `essence.*diesel`
hors `vocab.py` : rien) — `market.py`/`intake.py` l'héritent via
`Fuel`/`FUEL_VALUES` importés, aucun changement à y faire.

Trois tests existants utilisaient `"gnv"` comme exemple de valeur *hors*
vocabulaire (`test_vocab.py` × 2, `test_intake.py` × 1, `test_market.py` × 1
pour le 422) : devenus faux avec l'ajout, corrigés vers `"kerosene"` (jamais
un carburant de voiture d'occasion, exemple stable). Ajoutés : le pendant
positif (`gnv`/`hydrogene` traversent sans tomber en `autre`, côté `intake` et
côté `vocab`), `test_gnv_is_a_recognized_filter_value` (`/v1/market?fuel=gnv`
→ 200, `items: []`), et deux tests qui figent `FUEL_VALUES`/`GEARBOX_VALUES`
en toutes lettres.

**Le vocabulaire est dupliqué, pas partagé.** `extension/src/sites/leboncoin.js`
(table `FUEL`) porte la même liste en JS. Un fichier `shared/` existe déjà
pour l'empreinte véhicule (`shared/fingerprint-vectors.json`, lu des deux
côtés) — rien d'équivalent pour ce vocabulaire aujourd'hui, et ce lot n'en a
pas créé un (hors périmètre demandé). À la place : un test de chaque côté fige
la liste en dur (`test_the_fuel_vocabulary_matches_what_the_extension_sends`
ici, son miroir dans `vehicle-fields.test.mjs`) — un écart entre les deux se
voit au diff des deux tests, pas en silence. Si ce vocabulaire bouge encore,
un `shared/vocab.json` lu par les deux côtés vaudrait la peine.

Chaque test neuf vérifié en le faisant rougir : `FUEL_VALUES` remis à sept
valeurs (sans `gnv`/`hydrogene`) → trois tests rougissent
(`test_gnv_and_hydrogen_are_not_lumped_into_autre`,
`test_the_fuel_vocabulary_matches_what_the_extension_sends`,
`test_gnv_and_hydrogen_pass_through`) ; `Fuel` (le type Literal du filtre)
amputé de `gnv` → `test_gnv_is_a_recognized_filter_value` rougit (422 au lieu
de 200 attendu).

### 3. Vérifié

- `./.venv/bin/pytest tests/ -q` : **524 passés** (516 avant, 8 ajoutés),
  aucun échec.
- `launchctl kickstart -k gui/$UID/fr.adscope.api` : service relancé sur le
  nouveau code. `GET /app/` → 200. `GET /v1/market` (sans licence) → 401,
  `?fuel=gnv` et `?fuel=kerosene` sans licence → 401 aussi (l'authentification
  se résout avant la validation des paramètres de requête — vérifié par
  observation directe, pas seulement lu dans le code), donc pas de 500 : le
  nouveau vocabulaire ne casse pas la route en vrai.
- **La distinction 200 (`gnv`) / 422 (`kerosene`) n'a pas été vérifiée avec
  une licence réelle sur `adscope`** : elle exige un jeton `Bearer` valide, la
  base réelle ne conserve que le hash des clés (aucune clé en clair
  récupérable), et en créer une pour l'occasion serait l'écriture d'essai que
  la tâche interdit. Vérifiée à la place par la route complète (FastAPI, Pydantic,
  authentification, jusqu'à la réponse JSON) sur `adscope_test`, via
  `client`/`key` (`test_gnv_is_a_recognized_filter_value`,
  `test_an_unknown_fuel_filter_value_is_a_422`) — le même code que sert
  `localhost:8000`, une base différente pour le seul jeton d'accès.
- **Pas d'écriture d'essai dans `adscope`** : aucune ligne insérée, aucune
  licence créée. Seules des lectures (`SELECT count(*) FROM licenses`, `curl`
  sans corps).
- `cd extension && node --test tests/*.test.mjs` : **385** verts, y compris
  avec `Date` décalée d'un an (`--import` sur un module jetable qui remplace
  `globalThis.Date`, non commité).

## Retours d'Alexis appliqués, 2026-09-19 — région déduite, rappel des règles non vérifiées

Base **811b80d**. Périmètre : `api/` seulement. Aucun sous-agent dispatché.

### 1. La région, fonction du département — aucune colonne

`adscope_api/region.py` (neuf, à côté de `department.py`) : `REGIONS`, un
dictionnaire `identifiant -> (nom officiel, départements)` couvrant le
découpage en vigueur depuis le 1er janvier 2016, et deux fonctions pures,
`of_department` (département -> nom de région ou `None`) et `departments_of`
(identifiant de région -> ses départements ou `None`). Rien en base, rien à
migrer : la région se recalcule à chaque lecture depuis `department`, déjà
stocké.

Les dix-huit régions, identifiant choisi pour l'URL (ASCII minuscule, jamais
recalculé du nom) et nombre de départements :

  - `auvergne-rhone-alpes` → Auvergne-Rhône-Alpes (12 départements)
  - `bourgogne-franche-comte` → Bourgogne-Franche-Comté (8 départements)
  - `bretagne` → Bretagne (4 départements)
  - `centre-val-de-loire` → Centre-Val de Loire (6 départements)
  - `corse` → Corse (2 départements)
  - `grand-est` → Grand Est (10 départements)
  - `hauts-de-france` → Hauts-de-France (5 départements)
  - `ile-de-france` → Île-de-France (8 départements)
  - `normandie` → Normandie (5 départements)
  - `nouvelle-aquitaine` → Nouvelle-Aquitaine (12 départements)
  - `occitanie` → Occitanie (13 départements)
  - `pays-de-la-loire` → Pays de la Loire (5 départements)
  - `paca` → Provence-Alpes-Côte d'Azur (6 départements) — abrégé plutôt que
    `provence-alpes-cote-d-azur`, choix arbitraire, cohérent partout (code,
    tests, ce rapport)
  - `guadeloupe` → Guadeloupe (971)
  - `martinique` → Martinique (972)
  - `guyane` → Guyane (973)
  - `la-reunion` → La Réunion (974)
  - `mayotte` → Mayotte (976)

101 départements au total (96 de métropole, 2A/2B compris, plus les 5 DOM),
chacun dans exactement une région — vérifié en code (`test_region.py` :
`test_every_one_of_the_101_departments_has_a_region`,
`test_no_department_belongs_to_two_regions`,
`test_there_are_eighteen_distinct_regions`) et à la main sur 2A/2B, 974, 75,
69, 13.

`market.py` : nouveau paramètre `region` (répétable), traduit en départements
par `_region_departments` (422 sur un identifiant inconnu — vocabulaire fermé
de dix-huit, comme `fuel`/`gearbox`, à la différence de `department` qui n'en
a pas), puis combiné à `department` par `_combined_departments` — intersection
des deux quand les deux sont donnés, jamais une union. Le cas qui a fait
rougir un test avant d'être corrigé : une intersection vide (région et
département donnés sans recoupement) doit rendre **zéro** ligne ; `market_query._core`
testait `if department:` (une liste vide est fausse en Python), donc ignorait
le filtre au lieu de le faire échouer — corrigé en `if department is not
None:`, avec un commentaire qui l'explique.

`ItemOut`/`item_of` (`market_items.py`) et `_feed_item` (`feed_query.py`)
portent chacun `region`, dérivée de `department` par `region.of_department` —
jamais une colonne SQL, jamais stockée. `None` exactement quand `department`
l'est.

### 2. Le rapport de santé rappelle ce qui n'a jamais été vérifié sur pièce

`adscope_api/data_health_unverified.py` (neuf) :

- `unverified_rules(session)` : pour la règle Corse (département `2A`/`2B`)
  et les deux règles La Centrale (carburant hors essence/diesel, boîte
  renseignée), le compte d'annonces qui permettraient enfin de vérifier
  chacune, et jusqu'à trois `(site, site_id)` en exemple dès qu'il y en a un
  seul. Information, jamais dans `Report.alerts` — le code de sortie de
  `data_health.py` n'en dépend pas.
- `fuel_other_share_by_site(session)` : la part de `autre` par site pour le
  carburant seul (`Listing.fuel.isnot(None)` exclu du dénominateur) — un pic
  chez un site signalerait une valeur que `vocab.canonical` range en `autre`
  faute de case dédiée.

Câblées dans `data_health.compute` (`Report.unverified_rules`,
`Report.fuel_other_share`) et mises en texte dans `data_health_text.render`,
deux nouvelles sections, toutes deux sans effet sur `alerts` ni le code de
sortie — vérifié par des tests construits sur chaque état (zéro/non zéro) et
en cassant chaque ligne de production tour à tour (le filtre `site == "lc"`,
la paire `2A`/`2B`, le `group_by(Listing.site)`, le `where(fuel.isnot(None))`,
les deux branches du texte).

### 3. Vérifié en vrai

- `./.venv/bin/pytest tests/ -q` : **559 passés** (524 avant ce lot, 35
  ajoutés — 13 dans `test_region.py`, le reste dans `test_market.py`,
  `test_feed.py`, `test_data_health.py`, `test_data_health_text.py`), aucun
  échec, aucun test qui lit l'horloge réelle.
- Chaque ligne de production neuve ou modifiée cassée puis restaurée à la
  main pour confirmer qu'un test au moins rougit : `region.of_department`,
  `region.departments_of` (ses deux branches), `market._region_departments`
  (le 422), `market._combined_departments` (l'intersection, pas l'union),
  `market_query._core` (`if department is not None:`), les trois filtres de
  `unverified_rules`, le `group_by`/`where` de `fuel_other_share_by_site`, et
  les deux branches ajoutées à `data_health_text.render`.
- `launchctl kickstart -k gui/$UID/fr.adscope.api` : service relancé. `GET
  /app/` → 200, `GET /v1/market` sans licence → 401.
- **Pas d'écriture d'essai dans `adscope`** : `scripts/data_health.py` est un
  script de lecture seule, aucune ligne insérée. Sortie des deux nouvelles
  sections, sur la base réelle (53 133 annonces) :

  ```
  Règles pas encore vérifiées sur données réelles :
    - Corse (département 2A/2B) : aucune donnée encore
    - La Centrale, carburant hors essence/diesel : aucune donnée encore
    - La Centrale, boîte renseignée : aucune donnée encore

  Part de « autre » par site (carburant, information seulement) :
    - aucune annonce avec carburant renseigné
  ```

  Cohérent avec le remplissage encore nul de `fuel`/`gearbox`/`department`
  sur la base réelle (0,0 % partout, section « Remplissage » du même rapport)
  : le balayage n'a pas encore reposé sur ces colonnes assez d'annonces pour
  qu'il y ait quoi que ce soit à vérifier. Le rapport le dira de lui-même dès
  que ce sera le cas — c'est tout le point du point 3 d'Alexis.

### Réserves

- Les deux règles non vérifiées (Corse, La Centrale fuel/gearbox) restent
  aussi non vérifiées qu'avant ce lot : ce lot ajoute seulement le rappel
  automatique, il ne les vérifie pas — impossible tant que la base n'en porte
  aucune (voir sortie ci-dessus).
- L'identifiant `paca` est un choix arbitraire (l'alternative
  `provence-alpes-cote-d-azur` était tout aussi défendable) — figé dans
  `region.py`, ce rapport, et à retenir si un futur lot touche l'extension ou
  le web pour l'affichage des filtres.
