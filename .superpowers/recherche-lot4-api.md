# Lot « recherche filtrée », lot 4 — API, 2026-09-20

Périmètre : `api/` seulement, branche `feat/api`, HEAD de départ **bcc37cf**. Un lot
parallèle (`web/`) a avancé pendant ce travail (`web/js/market-facets.js`,
`market-state.js`, `url-state.js` et consorts, non lus en détail ici, aucune
recoupement avec `api/`). Aucun sous-agent dispatché.

## Ce qui a été fait

### 1. Les six fourchettes sur `/v1/market`

`price_min`/`price_max` (dernier prix relevé), `year_min`/`year_max`,
`mileage_min`/`mileage_max`, entiers optionnels, `min > max` → 422. La
validation et la construction des conditions SQL vivent dans
**`market_ranges.py`** (neuf, 46 lignes) : `parse` (422) et `clauses`
(conditions SQL, sautant un champ dans `exclude` — pensé dès ce lot pour le
lot 2 ci-dessous, pas un ajout après coup). `market_query.core` (renommé
depuis `_core`, qui restait un détail d'implémentation tant qu'il n'était
utilisé que par `market_page` — désormais partagé avec `facet_query.py`)
les applique sur `last_price.c.price` (le prix, dérivé, pas une colonne) et
`Listing.year`/`Listing.mileage`.

`department`/`region` (combinaison, 422 chacun) sont sortis de `market.py`
vers **`market_filters.py`** (neuf, 52 lignes) pour la même raison : la
facette « regions »/« departments » doit pouvoir se compter sans ce filtre.

### 2. `/v1/market/facets`

Nouveau routeur **`market_facets.py`** (75 lignes), agrégats dans
**`facet_query.py`** (105 lignes), gabarit dans **`facet_schemas.py`**
(47 lignes). Réponse conforme au contrat : `total`, `brands`, `models`
(vide sans marque choisie, « Modèle non précisé »/`autres` en dernier),
`fuel`/`fuel_unknown`, `gearbox`/`gearbox_unknown`, `regions`/`departments`/
`location_unknown`, `seller_type`, `ranges` (price/year/mileage).

**La règle « sans son propre filtre »** tient en un mécanisme, pas huit :
`market_query.core` gagne un paramètre `exclude` (ensemble de noms de
filtres à sauter) et `search.family` le même, pour distinguer `brand` de
`model`. `market_facets.get_facets` bâtit une closure `excluding(*names)` qui
rappelle `core(...)` avec les mêmes filtres sauf ceux nommés, et chaque
facette choisit les siens : `brands` exclut `brand` (`model` reste appliqué
s'il est posé), `models` exclut `model` (calculée seulement si `brand` est
donné), `fuel`/`gearbox`/`seller_type` s'excluent eux-mêmes, `regions` et
`departments` partagent l'exclusion `location` (une seule requête pour les
deux — la région n'est qu'un repli des comptes par département,
`region.of_department`, jamais une colonne), chaque fourchette de `ranges`
exclut sa propre paire de bornes. `total` seul n'exclut rien.

Les agrégats sont en SQL (`GROUP BY`, `func.count()`, `func.min`/`max`),
jamais les 56 000 annonces chargées en Python — `facet_query._counts`
regroupe sur la sous-requête de `core`, `locations` est la seule exception
partielle : la réduction département → région (≤ 101 lignes en sortie de
SQL) se fait en Python, faute de colonne région en base (`region.py` :
« jamais une donnée observée »).

Les libellés viennent des modules existants : `spelling.brand` (marques,
table fermée) et `spelling.inferred` (modèles — réutilisé tel quel : conçu
pour un modèle **déduit** dont on n'a que la clé repliée, exactement la
situation d'une facette qui ne connaît `canon_model` que sous cette forme).
`vocab.py` gagne `FUEL_LABELS`/`GEARBOX_LABELS` (écriture d'affichage,
jamais comparée ni stockée). `region.REGIONS` porte déjà le nom officiel.

Chaque `_counts` trie par compte décroissant **puis par clé** — sans second
critère, Postgres ne garantit pas l'ordre d'une égalité, et un test
appuyé sur l'ordre serait flaky un jour sur deux.

### 3. Mesuré sur la base réelle (55 783 annonces, 68 719 points de prix)

Avant d'écrire `facet_query.py`, une inspection `EXPLAIN ANALYZE` en SQL brut
a vérifié que la conception tient : `core` bâtit une seule requête complète
(marque, modèle, prix, fuel, gearbox, département, `followed`, delta…),
réutilisée pour chaque facette en ne sélectionnant que la colonne groupée —
Postgres élague de lui-même les jointures dont aucune colonne ne ressort
(vérifié : une requête à deux niveaux, sous-requête complète puis
`SELECT canon_brand, count(*) ... GROUP BY canon_brand`, ne déclenche ni le
`EXISTS` `followed` ni les quatre sous-requêtes `price_points`). D'où un
`core` unique plutôt que des variantes allégées par facette — plus simple,
et mesuré suffisant.

Mesure directe (code de production, `facet_query`/`market_query.core`,
licence factice non écrite en base — cf. « Vérifié en vrai »), 3 lectures
après une passe de chauffe, par scénario :

| Scénario | Temps |
|---|---|
| sans filtre | 72–96 ms |
| `brand=Renault` | 59–106 ms |
| `q=clio&min_age_days=90` | 75–100 ms |

Les trois sous 150 ms, y compris via le vrai routeur FastAPI (chronométré à
travers `TestClient` sur le moteur réel, mêmes ordres de grandeur). **Aucune
migration, aucun index ajouté** — la règle du lot (« sinon n'ajoute rien »)
s'applique : pas de migration 013.

## Vérifié en vrai

- `./.venv/bin/pytest tests/ -q` : **728 passés** (685 avant ce lot, 43
  ajoutés — 16 dans `test_market.py` pour les six fourchettes, 27 dans
  `tests/test_market_facets.py`, neuf), aucun échec, aucun test qui lit
  l'horloge réelle (`NOW` figé, comme le reste du fichier).
- **Chaque ligne de la règle « sans son propre filtre » cassée puis
  restaurée**, un test au moins rougit à chaque fois (script jetable, jamais
  commité) : `search.family` (`brand`, `model`), `market_query.core`
  (`seller_type`, `fuel`, `gearbox`, `location`), `market_ranges.clauses`
  (le `continue` sur `exclude`, et séparément la borne basse `>=`),
  `facet_query.models` (le filtre qui sépare les modèles nommés du seau
  « autres », et la réduction département → région dans `locations`),
  `market_facets.get_facets` (le `if brand else []` de `models`, le `total`
  qui doit tout appliquer). Onze mutations, onze rougissent.
- **Mesure de latence sur `adscope`** (ci-dessus) : lecture seule, licence
  factice (`SimpleNamespace(key_hash=...)`) jamais écrite en base — aucune
  requête `INSERT`/`UPDATE` dans le script de mesure, vérifié en le relisant.
  `SELECT count(*) FROM listings` / `licenses` avant et après : 55 783 /
  4, inchangés.
- `launchctl kickstart -k gui/$UID/fr.adscope.api` : service relancé sur le
  nouveau code, aucune erreur dans `~/Library/Logs/adscope-api.log`. Sans
  clé : `GET /v1/market` → 401, `GET /v1/market/facets` → 401 (y compris
  avec des paramètres invalides — `price_min=20000&price_max=10000`,
  `fuel=kerosene` — l'authentification se résout avant la validation, comme
  déjà noté au lot 2), `GET /app/` → 200. La distinction 200/422 sur des
  paramètres valides/invalides est vérifiée par les tests de route
  (`client`/`key`, `adscope_test`), pas en vrai — une licence réelle
  exigerait d'en frapper une, ce que la tâche interdit.
- **Aucune écriture d'essai dans `adscope`** : ni licence, ni observation,
  ni migration.

## Fichiers touchés (`api/` seulement)

| Fichier | État | Lignes |
|---|---|---|
| `adscope_api/market_ranges.py` | neuf — bornes des six fourchettes | 46 |
| `adscope_api/market_filters.py` | neuf — `department`/`region`, sorti de `market.py` | 52 |
| `adscope_api/market_facets.py` | neuf — routeur `/v1/market/facets` | 75 |
| `adscope_api/facet_query.py` | neuf — agrégats SQL par facette | 105 |
| `adscope_api/facet_schemas.py` | neuf — gabarit de sortie | 47 |
| `adscope_api/market_query.py` | `_core` → `core`, `exclude`, six fourchettes, `total` sorti pour être partagé | 144 |
| `adscope_api/market.py` | six paramètres, délègue `department`/`region` à `market_filters` | 72 |
| `adscope_api/search.py` | `family` gagne `exclude` | 51 |
| `adscope_api/vocab.py` | `FUEL_LABELS`/`GEARBOX_LABELS` | 68 |
| `adscope_api/main.py` | monte `market_facets.router` | 141 |
| `tests/test_market.py` | dix-sept tests, les six fourchettes | — |
| `tests/test_market_facets.py` | neuf — 27 tests, le contrat des facettes | — |

Aucun fichier de production ne dépasse 150 lignes (`market_query.py` à 144,
le plus chargé).

## Réserves

- **`models`/`brands` filtrent aussi le paramètre `model` sans `brand`**,
  comme `search.family` le permettait déjà avant ce lot (`model=captur` sert
  les Captur toutes marques confondues) — la facette `brands`, quand elle
  s'exclut elle-même, garde ce filtre `model` isolé s'il est posé. Cas
  d'usage improbable côté site (le lot `web/` cascade marque → modèle), non
  testé spécifiquement.
- **Le compte par égalité (`ORDER BY count DESC, clé ASC`)** rend l'ordre
  déterministe mais arbitraire au-delà du compte — jamais discuté avec
  Alexis, à revoir si l'affichage veut un autre critère de départage.
- **La mesure de latence porte sur le code appelé directement** (`facet_query`/
  `market_query.core`, licence factice), pas sur une requête HTTP authentifiée
  par une vraie licence — une deuxième mesure l'a confirmée à travers
  `TestClient` (même moteur réel, mêmes ordres de grandeur, 59–106 ms), mais
  aucune des deux ne traverse le réseau local comme le ferait l'extension
  contre `localhost:8000`.
- **`seller_type` n'a pas de compagnon `_unknown`** dans le contrat donné —
  les annonces sans `seller_type` (colonne nullable) sont silencieusement
  absentes de la facette plutôt que comptées à part, à la différence de
  `fuel`/`gearbox`/`department`. Lu ainsi dans le contrat fixé ; à confirmer
  si Alexis en voulait un.
