# `/v1/market`, `/v1/follows/feed`, et le site servi par l'API

Commit `85ec9fc` sur `feat/api`, au-dessus de `a25daec` (HEAD avait déjà avancé
à `f7e1954` par les deux autres agents avant mon premier commit — non touché).
Périmètre tenu : uniquement `api/`, rien dans `crawler/`, `scripts/`, `docs/`,
`web/` ni les `.html` de la racine.

## Fichiers

- `api/adscope_api/urls.py` (32 lignes) — le seul endroit qui construit
  l'adresse d'une fiche. `revisit.ADDRESS` reprend son constructeur `lbc` au
  lieu de le redéfinir.
- `api/adscope_api/market_query.py` (149 lignes) — `/v1/market` agrégé en SQL :
  dernier prix, premier et dernier prix *changé* (`confirmation = false`), un
  par annonce via `DISTINCT ON`, jamais chargés en Python.
- `api/adscope_api/feed_query.py` (104 lignes) — `/v1/follows/feed` en Python :
  le feed ne porte que ce qu'une licence suit, une poignée d'annonces déjà en
  mémoire une fois chargées avec leurs prix.
- `api/adscope_api/market.py` (52 lignes) — l'`APIRouter` demandé, les deux
  routes, rien d'autre : la logique vit dans les deux modules ci-dessus pour
  tenir chaque fichier sous 150 lignes (`market.py` seul aurait dépassé 230).
- `api/adscope_api/main.py` — inclut `market.router`, monte `web/` sous `/app`
  (132 → 144 lignes).
- Tests : `test_urls.py` (6), `test_market.py` (18), `test_feed.py` (13) — 37
  au total, 250 → 287 verts.

## Décisions qui ne venaient pas telles quelles de la consigne

**L'adresse La Centrale n'est pas `site_id` substitué tel quel.** En base,
`site_id` porte la référence du site avec sa lettre de tête (`E119119489`,
`W103331993` — vérifié par requête sur les 24 annonces `lc` réelles). Le
gabarit donné littéralement (`.../auto-occasion-annonce-<site_id>.html`)
aurait rendu une adresse qui n'existe pas. `extension/src/sites/lacentrale.js`
fait déjà la bonne transformation côté page — remplacer la lettre de tête par
son code ASCII (`W103538172` → `87103538172`) — et `urls.py` la reprend à
l'identique côté API, testée contre des `site_id` réels des deux formes (`E`,
`W`).

**Le feed reconstruit son item en Python plutôt que d'appeler `market_query`
pour chaque annonce suivie.** `ItemOut` est partagé (`FeedItemOut` en hérite),
mais le calcul ne l'est qu'en partie : `age_expr` (SQL, sur 47 000 annonces) et
`sellers.age_days` (Python, sur ce qu'une licence suit) portent le même calcul
en double, dupliqué à dessein plutôt qu'unifié — un feed borné à quelques
annonces n'a rien à gagner à repasser par l'agrégation SQL faite pour balayer
la base entière, et l'inverse aurait forcé `/v1/market` à charger des objets
ORM pour rien.

**`sort=recent`** n'est pas spécifié par le contrat au-delà du nom. Choisi :
l'ancienneté croissante (l'inverse d'`age_desc`) — les annonces les plus
récemment apparues d'abord, cohérent avec ce que la base sait déjà calculer.

**`flags.dropped`** reprend `price_delta_since_first < 0`, le même critère que
le filtre `dropped` de `/v1/market` — pas de second calcul de « a baissé ».

**Le tri du feed** (« ce qui a bougé d'abord ») : les annonces avec au moins un
changement dans la fenêtre passent devant celles qui n'en ont aucun, puis tri
alphabétique `site`/`site_id` pour un ordre stable entre deux appels — rien
dans le contrat ne dit l'ordre à l'intérieur de chaque groupe.

## Un bug trouvé et corrigé en route

`since_days: Literal[1, 7] = 7` sur un paramètre de requête rendait 422 même
sur `?since_days=7` — cette version de FastAPI/Pydantic (0.141.1 / 2.13.5) ne
coerce pas la chaîne de la query string vers l'entier pour un `Literal[int]`.
Reproduit isolément, corrigé par un `int` classique avec vérification à la
main (`since_days not in (1, 7)` → 422). Deux tests ajoutés : l'un aurait
laissé passer le bug (valeur invalide → 422, vrai avant et après), l'autre
(`test_since_days_accepts_one_and_seven_through_the_route`) l'aurait attrapé.

## Mesure (étape 2)

Base réelle : 51 712 annonces (`lbc` 51 688, `lc` 24), 58 996 points de prix,
0 disparue. `EXPLAIN ANALYZE` sur les deux requêtes demandées :

- `/v1/market?min_age_days=90&sort=age_desc` — **89 ms**. Dominé par un `Seq
  Scan` sur `listings` (28 ms, filtre CASE sur l'ancienneté) et trois passages
  sur `price_points` pour le dernier prix et le premier/dernier prix changé
  (~6-10 ms chacun, `Index Scan` sur `ix_price_points_listing_id` + tri).
- `/v1/market?brand=Peugeot&model=208&dropped=true` — **38 ms**. Le filtre
  marque/modèle utilise `ix_listings_brand_model_year` (`Bitmap Index Scan`,
  0,1 ms) ; le reste du temps vient des mêmes trois passages sur
  `price_points`, qui portent sur la table entière et non sur les 234 annonces
  filtrées — l'agrégation prix se calcule avant le filtre, par construction.

**Pas de migration 008.** Les deux mesures tiennent sous 100 ms sans nouvel
index ; aucune n'a de borne évidente à indexer (le filtre d'ancienneté est un
`CASE` sur deux colonnes selon laquelle est renseignée, pas indexable
directement sans index fonctionnel). À revisiter si la base grossit d'un
ordre de grandeur — le `Seq Scan` sur `listings` et les passages complets sur
`price_points` grandiraient linéairement.

## Vérification en vrai (étape 5)

`launchctl kickstart -k gui/$UID/fr.adscope.api`, puis en direct sur
`127.0.0.1:8000` :

- `/v1/market` et `/v1/market?brand=Peugeot&model=208&dropped=true` → 200,
  formes attendues.
- `/v1/follows/feed?since_days=1`, `=7`, sans paramètre → 200 ; `=3` → 422.
- `/v1/market` et `/v1/follows/feed` sans licence → 401.
- `/app/` → 200 (le dossier `web/` est apparu pendant la session, posé par un
  autre agent en parallèle — servi sans redémarrage grâce à `check_dir=False`,
  monté une fois pour toutes au démarrage).
- `/app/nonexistent.js` → 404, propre.

## Tests

`cd api && ./.venv/bin/pytest tests/ -q` → **287 verts** (250 + 37, aucune
régression). Chaque test du contrat nomme la ligne de production qui le fait
rougir ; un échantillon (`min_age_days`, `_crossed`, la borne de fenêtre des
`changes`) a été vérifié en le cassant réellement puis en le remettant en
place — voir les commentaires au-dessus de chaque test dans `test_market.py`
et `test_feed.py`.

## Pour la suite

- Le panneau/la liste (autre agent, `web/` et `extension/`) peuvent consommer
  `/v1/market` et `/v1/follows/feed` tels quels ; le contrat d'item est fixé
  dans `market_query.ItemOut`.
- `sort=recent` est une interprétation, pas une lecture du contrat — à
  confirmer si le produit en attend une autre.
- La mesure de performance n'a pas testé `/v1/follows/feed` à grande échelle :
  le feed n'a que peu d'annonces suivies aujourd'hui (une seule en base), donc
  rien à mesurer d'utile pour l'instant.
