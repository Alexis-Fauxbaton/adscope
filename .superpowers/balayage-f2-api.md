# Lot F2 — balayage par recherche : rapport côté API

Écrit le 2026-09-22, branche `feat/api`. Périmètre livré ici : `api/` seul,
points 1 (traduction recherche → URL), 2 (`GET /v1/sweep`), 3 (couverture),
7-vocab (éthanol côté API). Site, extension et runbook sont un autre lot.

**Première phrase qui compte : sept paramètres d'URL sur douze restent des
suppositions écrites sur pièce, jamais vérifiées par une visite.** Le lot
livre une traduction plausible et l'instrument qui la mesure (`expected_total`
au regard du `total` lu en page 1), pas une traduction prouvée. C'est le
premier run du runbook (hors de ce lot) qui fait la vérification réelle.

## Statut

Livré et vert. Service relancé (`launchctl kickstart -k gui/$UID/fr.adscope.api`,
pas d'autre méthode), log propre après relance, `GET /v1/sweep` répond
`401 {"detail":"licence invalide"}` sans clé, vérifié en direct sur
`http://localhost:8000`. Aucune migration : 013 reste la dernière — la
couverture se calcule sur `listings.last_seen`, qui existe depuis toujours.
Pas de `pg_dump` nécessaire pour cette raison (le run book le demandera
avant tout run réel qui écrirait en base, ce que ce lot ne fait jamais).

## Commits (7, sur `api/` uniquement)

1. `0a9d0b8` — Vocabulaire : l'éthanol (E85) entre, sans code leboncoin connu
2. `3dc2666` — Couverture : la part du périmètre d'une recherche vue depuis 24 h
3. `8b17220` — Traduction recherche -> URL leboncoin (`sweep_url.translate`)
4. `1f6c927` — Couverture : restreinte à leboncoin, jamais La Centrale
5. `674ba5c` — `GET /v1/sweep` : la file de balayage par recherche
6. `3eda4f2` — `GET`/`POST`/`PUT /v1/searches` : couverture et statut de balayage
7. `1a45f9e` — Tests recherches enregistrées : factorise l'annonce de couverture

## Fichiers

Neufs : `adscope_api/coverage.py` (64), `adscope_api/sweep_url.py` (105),
`adscope_api/sweep_split.py` (78), `adscope_api/sweep.py` (94),
`tests/test_coverage.py`, `tests/test_sweep_url.py`, `tests/test_sweep.py`.
Modifiés : `adscope_api/vocab.py` (73, éthanol), `adscope_api/market_query.py`
(148, +1 ligne `Listing.last_seen` au `select` de `core`), `adscope_api/main.py`
(148, +2, montage du routeur), `adscope_api/saved_searches.py` (150, pile au
plafond), `tests/test_vocab.py`, `tests/test_saved_searches.py` (+3 tests).
Tous les fichiers source ≤ 150 lignes.

## Tests

`cd api && ./.venv/bin/pytest tests/ -q` → **847 verts** (816 au départ, +31).
`node --test web/tests/*.test.mjs` → 150 verts, inchangé (hors périmètre).
`node --test extension/tests/*.test.mjs` → 427 verts, inchangé (hors périmètre).

Chaque test neuf a été prouvé par cassure/restauration de la ligne de
production qu'il nomme (comparaison `desc`/`asc` inversée, garde retiré,
`break`/`continue`, `>=`/`<=`, `ceil` remplacé par `//`, etc.) — vérifié à la
main pour les lignes les plus sensibles (dédoublonnage, ordre de couverture,
`nulls_first`, budget, plafond de pages, découpage `owner_type`, garde
marque/modèle, filtre `site == "lbc"`, report du statut sur `/v1/searches`).
Deux tests de couverture ont été renforcés en cours de route parce que leur
première version passait par coïncidence sans exercer la ligne visée (une
comparaison symétrique 2 contre 2, des valeurs par défaut de `SearchOut` qui
satisfaisaient l'assertion sans que `with_coverage` soit appelé) — corrigés
avant de les considérer acquis. Aucun test ne lit l'horloge réelle : `now`
est un paramètre partout, injecté par le fixture `clock` dans les tests HTTP.

## Ce qui a été livré

**1. Traduction (`sweep_url.translate`)** — Une recherche sans marque+modèle
ou en texte libre (`q`) est refusée (`trop_large` / `texte_libre`), jamais
traduite à moitié. L'écriture de marque/modèle émise dans l'URL vient des
lignes observées sur `lbc` (`listings.brand`/`model`), pas du filtre canonique
— tranchée par la majorité (`order by count(*) desc`) : la base porte 17
lignes `RENAULT` contre 4 723 `Renault`. Un carburant sans code leboncoin
connu (éthanol, et plus généralement tout code absent de la table 1..9)
retire le paramètre `fuel` entier plutôt que de filtrer plus étroit que la
recherche ; même règle appliquée à `gearbox`. `category`, `sort`, `order`
restent les littéraux fixes mesurés dans `crawler/RUNBOOK.md`. `locations`
passe par `market_filters.combined` (région + département), jamais recalculé
à la main. Une recherche marque+modèle sans aucune ligne `lbc` correspondante
(écriture du site introuvable) est traitée comme `trop_large` aussi — cas non
couvert explicitement par le brief, décision prise ici faute d'écriture sûre
à émettre.

**2. `GET /v1/sweep`** — File commune à tous les comptes, derrière
`require_license` (jamais `require_account`, comme `revisit.due`) : la clé
d'une machine sans compte entre. Dédoublonnée par la chaîne `query` canonique
de `SavedSearch` (déjà normalisée à l'écriture). `GET`, rien n'est consommé :
deux appels de suite rendent la même file tant que rien n'a été ouvert — la
couverture se mesure sur `last_seen`, jamais sur un bail posé ici. Une entrée
ne porte que `{url, pages, expected_total, coverage_24h, unmapped}`, prouvé
par un test dédié : aucune information de compte n'en sort. `min_age_days`,
`dropped` et un `fuel`/`gearbox` non traduisible sortent de l'URL *et* de
`expected_total` (mais pas de la couverture) pour que le runbook ne consigne
pas un écart permanent sur une traduction pourtant juste. `sweep_split.cut`
découpe au-delà de 20 pages dans l'ordre déjà en usage
(`crawler/RUNBOOK.md`) : `owner_type` d'abord, la tranche de prix ensuite
(milieu arrondi à la centaine, repli `price_min * 2` ou 5 000 €), profondeur
8 puis `trop_large`. Le budget (`pages=N`, défaut 120) s'arrête à la première
entrée qui ne tient pas — jamais un saut à la suivante, ce qui affamerait
indéfiniment les plus grosses recherches, justement les moins couvertes ;
prouvé par un test à trois entrées où sauter aurait servi la plus petite.

**3. Couverture (`coverage.py`)** — Un seul chemin,
`MarketParams.core_kwargs()` → `market_query.core`, partagé avec `/v1/market`
et `alert_rules`. Nécessite `Listing.last_seen` au `select` de `core` (+1
ligne) ; vérifié que les quatre chemins qui partagent `core` (`/v1/market`,
`/v1/market/facets`, `alert_rules`, `coverage`) restent verts. Restreinte à
`site == "lbc"` : décision prise ici, au-delà du brief littéral, parce que le
balayage quotidien ne revoit que leboncoin (`revisit.ADDRESS` n'a pas La
Centrale, DataDome) — sans ce filtre, une annonce La Centrale jamais
rafraîchie plafonnerait en permanence la couverture d'une recherche
parfaitement balayée. `coverage_24h` est `None`, jamais `0.0`, quand le
périmètre est vide. `GET /v1/searches` gagne trois champs
(`coverage_24h`, `seen_total`, `sweep_status`) posés par un helper
`with_coverage`, appelé sur les quatre routes (liste, unité, `POST`, `PUT`) —
y compris une recherche en pause, qui garde sa couverture affichée bien
qu'exclue de `/v1/sweep`. La logique partagée (`translate` + `coverage_of`)
vit dans `coverage.status_of` plutôt que dans `saved_searches.py`, qui
déborderait sinon des 150 lignes (il y est resté pile à la limite).

**7 (vocab).** `ethanol` entre dans `FUEL_VALUES`/`Fuel`/`FUEL_LABELS`
(« Éthanol ») côté API uniquement. **Rien côté `extension/src/sites/
leboncoin.js`** : la table `FUEL` 1..9 relevée sur pièce le 19/09 n'a aucun
code E85, et rien n'y a été inventé. `extension/tests/vehicle-fields.test.mjs`
n'a pas été touché (hors périmètre de ce lot API) — il doit rester à neuf
valeurs avec son commentaire corrigé, c'est au lot site/extension de le
faire.

## Réserves — chaque paramètre d'URL incertain

Reprise du tableau de `.superpowers/balayage-f2-plan.md` §1.2, tel qu'implémenté :

| Paramètre | Certitude | Détail |
|---|---|---|
| `category=2`, `sort=price`, `order=asc`, `page=1` | Certain | Mesurés sur pièce (`RUNBOOK.md`), littéraux fixes |
| `price={min}-{max}` | Certain pour la forme, **décision** pour les replis | `price_min` absent → `0`, `price_max` absent → `max` : jamais observés vides, choisis ici |
| `owner_type` | Certain | `RUNBOOK.md:38`, mêmes mots que `listings.seller_type` |
| `u_car_brand` | **Incertain** | Nom du paramètre non vérifié en filtre ; la valeur (écriture du site) est fiable |
| `u_car_model` | **Incertain fort** | Le séparateur `_`, la casse, le sort des espaces internes ne sont vérifiés nulle part — un séparateur faux ramène le marché entier sur toutes les entrées, écart énorme et uniforme au log, facile à reconnaître |
| `fuel`, `gearbox` | **Incertain** | Table de codes sûre (relevée le 19/09) ; le nom du paramètre en *filtre* et la virgule comme séparateur multi-valeurs, non vérifiés |
| `regdate` | **Incertain** | Sûr comme attribut d'annonce, jamais vérifié comme filtre ; `1900` est une sentinelle choisie ici |
| `mileage` | **Incertain** | Même raison |
| `locations` | **Incertain fort** | La forme `d_XX` n'est observée nulle part au dépôt |
| `q`, `min_age_days`, `dropped` | N/A | Jamais émis : refusés (`q`) ou retirés de l'URL et du compte attendu (`min_age_days`/`dropped`) |
| `fuel=ethanol` | N/A | Paramètre `fuel` entier retiré, `unmapped=["fuel"]` |

Deux décisions prises au-delà du texte littéral du brief, documentées dans le
code et ce rapport : (a) une recherche marque+modèle sans ligne `lbc`
correspondante est `trop_large` plutôt que servie avec une URL devinée ; (b)
la couverture et le compte attendu sont restreints à `site == "lbc"`, jamais
au marché cross-site que sert `/v1/market`.

## Hors périmètre de ce rapport

Page `/app/balayage.html`, phrase de couverture sur Mes alertes, capture
`docs/site-v0-alertes-couverture.png`, `extension/src/sites/lacentrale.js`
(éthanol côté La Centrale), `web/js/fixtures-facets.js`, et
`crawler/RUNBOOK-balayage.md` — lot site + extension + runbook, à faire
après celui-ci (deux agents ne travaillent jamais en même temps).

---

## 2026-09-22 — Décision d'Alexis : les deux files réservées à l'opérateur

`GET /v1/sweep` et `POST /v1/revisits` passaient par `require_license`, qui
accepte le cookie de session de n'importe quel compte : tout marchand
connecté pouvait lire le périmètre des autres (marque, modèle, prix,
département) par ces deux routes. Elles n'acceptent plus que : (a) une clé
de licence Bearer (le crawler), (b) le cookie du compte opérateur.

### Statut

Livré et vert. Aucune migration. Service relancé
(`launchctl kickstart -k gui/$UID/fr.adscope.api`), log propre après
relance. `ADSCOPE_OPERATOR_EMAIL` n'est pas encore posée côté plist (fichier
interdit à cet agent — voir ligne à ajouter plus bas) : tant qu'elle ne
l'est pas, le service tourne avec la variable vide, donc aucun cookie
n'ouvre plus les deux files, pas même celui d'Alexis — seule la clé du
crawler passe.

### Ce qui a changé

- `adscope_api/config.py` : `operator_email()`, lit `ADSCOPE_OPERATOR_EMAIL`
  à chaque appel (`""` par défaut), sur le modèle de `public_url()`.
- `adscope_api/operator.py` (neuf, 50 lignes) : `require_operator`, voisin
  d'`auth.py` (déjà 123 lignes) plutôt que dedans. Reprend le double chemin
  de `require_license` (`resolve` pour la clé, `sessions.resolve` +
  `of_account` pour le cookie) et referme le second par
  `_is_operator(account.email)` — comparaison casse repliée, vide → jamais
  vrai. Un cookie d'un autre compte rend 403 « réservé à l'opérateur »,
  jamais 401 (la session est valide, ce n'est pas la bonne).
- `adscope_api/sweep.py`, `adscope_api/main.py` : `require_license` →
  `require_operator` sur `get_sweep` et `post_revisits` seulement — les
  autres routes des deux fichiers (observations, listings, comparables,
  vendeurs, disparitions) restent à `require_license`, inchangées.
- `/app/balayage.html` et `/app/revisites.html` : non touchées, comme
  demandé. Elles continuent de marcher pour Alexis par cookie dès que la
  variable est posée.

### Ligne à ajouter à `scripts/fr.adscope.api.plist`

Fichier interdit à cet agent — à ajouter à la main, dans le même bloc
`EnvironmentVariables` que `ADSCOPE_PUBLIC_URL` (même style, une ligne) :

```xml
<key>ADSCOPE_OPERATOR_EMAIL</key><string>ADRESSE DU COMPTE D'ALEXIS ICI</string>
```

L'adresse elle-même n'est pas écrite dans ce rapport ni ailleurs dans le
dépôt — Alexis la connaît, c'est la sienne, sur son compte.

### Tests

`cd api && ./.venv/bin/pytest tests/ -q` → **895 verts** (890 au départ,
+5, `tests/test_operator.py`). Aucun test ne lit l'horloge réelle (fixture
`clock`, comme partout ailleurs dans la suite).

Les deux tests qui distinguent réellement `require_operator` de
`require_license` (le cookie d'un autre compte refusé, la variable vide qui
refuse jusqu'au cookie du compte qui deviendrait opérateur) ont été prouvés
rouges en repassant `get_sweep` et `post_revisits` sur `require_license`
(`200` au lieu du `403` attendu sur les deux routes), puis restaurés — la
suite entière repasse verte après restauration. Les trois autres tests du
fichier (clé passe, cookie opérateur passe, 401 sans rien) ne bougent pas
entre les deux versions de la porte ; ce sont des garde-fous de non-régression,
pas des témoins de la décision elle-même.

### Réserves

- La ligne du plist n'a pas été posée (fichier interdit) : tant qu'elle ne
  l'est pas, `ADSCOPE_OPERATOR_EMAIL` reste vide en production et **aucun**
  cookie, pas même celui d'Alexis, n'ouvre plus `/v1/sweep` ni
  `/v1/revisits` — seule la clé du crawler passe. Les deux pages
  `/app/balayage.html` et `/app/revisites.html` resteront donc en 403 pour
  Alexis jusqu'à la pose de la variable et le rechargement du service.
- `require_operator` n'a pas été posée sur d'autres routes que ces deux-là :
  le périmètre demandé s'arrêtait à `sweep`/`revisit`, les autres files
  communes (`/v1/disappearances`) restent derrière `require_license`,
  décision non revue ici.
