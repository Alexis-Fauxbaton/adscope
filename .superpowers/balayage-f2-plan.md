# Lot F2 — balayage par recherche : plan d'architecture

Écrit le 2026-09-22, branche `feat/api`. Aucun code écrit ici, aucune page visitée,
aucune écriture en base. Les chiffres de marché cités viennent de lectures
**en lecture seule** de la base `adscope` (`psql -c "select …"`), jamais d'une URL.

---

## 0. Le constat qui justifie le lot

Le balayage d'aujourd'hui (`crawler/RUNBOOK.md`, 77 shards de tranches de prix)
revoit une annonce **tous les 10 à 20 jours**. Mesuré à l'instant sur la base :
**13 310 annonces lbc vivantes sur 69 420 ont un `last_seen` de moins de 24 h,
soit 19 % du parc.** Les alertes F1 (`alert_rules.SEEN_WINDOW`, 48 h) ne peuvent
donc rien dire de fiable : quatre annonces sur cinq sont hors fenêtre au moment
où l'email part. F2 renverse la priorité — ce que des marchands ont enregistré
passe avant le balayage exhaustif.

**Vérification demandée — `extension/src/listing.js` envoie-t-il le prix de chaque
carte ?** Oui. `ADS.feed.listings(document)` → `leboncoin.normalize(ad)` pose
`price: Array.isArray(ad.price) ? ad.price[0] : ad.price`
(`extension/src/sites/leboncoin.js:58`) sur **chaque** annonce de la charge
`__NEXT_DATA__`, et `listing.js:112` fait `ADS.sync.send(shown)` sur toutes les
annonces qui ont une carte visible. Une page de résultats balayée pose donc bien
un point de prix par annonce affichée — c'est ce qui rend F2 suffisant pour F1,
sans revisite fiche par fiche. Rien à corriger.

---

## 1. Traduction recherche adscope → URL leboncoin

### 1.1 Le gabarit

```
https://www.leboncoin.fr/recherche?category=2&sort=price&order=asc&page={n}
  [&price={min}-{max}] [&owner_type={private|pro}]
  &u_car_brand={MARQUE} &u_car_model={MARQUE}_{Modèle}
  [&fuel={codes}] [&gearbox={codes}] [&regdate={min}-{max}]
  [&mileage={min}-{max}] [&locations={d_XX,…}]
```

### 1.2 Table paramètre par paramètre

| Filtre adscope | Paramètre émis | Valeur | Certitude |
|---|---|---|---|
| — | `category` | `2` | **Certain** — `RUNBOOK.md:46`, 77 shards crawlés avec |
| — | `sort`, `order` | `price`, `asc` | **Certain** — même source |
| — | `page` | `1..N` | **Certain** — plafond 100 mesuré (`page=101` → 0 résultat) |
| `price_min`/`price_max` | `price` | `{min}-{max}`, borne haute absente → `max` (mot-clé), borne basse absente → `0` | **Certain** pour `{min}-{max}` et pour `max` (`RUNBOOK.md:48`) ; le `0` de repli est une **décision** jamais observée |
| `seller_type` | `owner_type` | `private` \| `pro` — mêmes mots qu'en base (`listings.seller_type` : 54 578 `private`, 14 893 `pro`) | **Certain** — `RUNBOOK.md:38` |
| `brand` | `u_car_brand` | l'**écriture observée** `listings.brand` (`Peugeot`, `Citroen`, `Bmw`, `Land Rover`) | **Incertain** — le nom du paramètre vient du brief, la casse et l'encodage des marques à espace ne sont vérifiés nulle part |
| `model` | `u_car_model` | `{brand}_{model}` avec les deux écritures observées (`Peugeot_208`, `Citroen_C4 Picasso`) | **Incertain fort** — le séparateur `_`, la casse et le sort des espaces internes ne sont vérifiés nulle part |
| `fuel` | `fuel` | codes de la table inverse de `FUEL` (`leboncoin.js:36`), triés, joints par virgule | **Certain** pour la table (relevée le 19/09 sur pièce) ; **incertain** pour le nom du paramètre en filtre et pour la virgule comme séparateur multi-valeurs |
| `gearbox` | `gearbox` | `1` manuelle, `2` automatique, même règle | idem |
| `year_min`/`year_max` | `regdate` | `{min ou 1900}-{max ou max}` | **Incertain** — `regdate` est sûr comme *attribut* d'annonce (`leboncoin.js:4`), pas comme *filtre* ; `1900` est une sentinelle choisie ici |
| `mileage_min`/`mileage_max` | `mileage` | `{min ou 0}-{max ou max}` | **Incertain** — même raison |
| `department` + `region` | `locations` | `d_{code}` par département, virgules entre eux, après `market_filters.combined` | **Incertain fort** — la forme `d_XX` n'est observée nulle part au dépôt |
| `q` | — | **jamais émis** : la recherche entière est refusée | Décision (§1.4) |
| `min_age_days`, `dropped` | — | **jamais émis** : ce sont des mesures adscope, pas des filtres du site | Décision (§1.5) |
| `fuel=ethanol` | — | le paramètre `fuel` entier est omis | Décision (§1.6) |

**Aucune URL n'a été ouverte pour établir ce tableau, et aucune ne le sera.** La
vérification réelle est au runbook (§5) : la session cowork compare le `total` lu
dans `__NEXT_DATA__` de la page 1 avec notre `expected_total`, et consigne
`ok | ecart | erreur`. Sept paramètres sur douze sont incertains : le premier run
d'Alexis est la campagne de mesure du lot.

### 1.3 D'où vient l'écriture du site (décision centrale)

`listings.canon_brand`/`canon_model` sont la forme **repliée** (`renault`, `clio`)
et ne servent qu'à retrouver les lignes. L'écriture du site se lit **sur les
lignes elles-mêmes** :

```sql
select brand, model from listings
where site='lbc' and canon_brand=:b and canon_model=:m and brand is not null
group by 1,2 order by count(*) desc limit 1
```

Mesuré : `canon_brand='renault' + canon_model='clio'` → `Renault | Clio`, 4 723
lignes, une seule écriture. Mais la base porte aussi **17 lignes `RENAULT`** en
majuscules (vues entre le 19 et le 22/09) contre 4 723 `Renault` : le `order by
count(*) desc` tranche pour la majorité plutôt que pour la première venue. Sans
ce tri, une poignée de lignes atypiques ferait une URL fausse pour toute une
recherche.

### 1.4 Ce qui n'est pas traduit

- **Pas de marque OU pas de modèle** → `skipped: "trop_large"`. Une recherche
  « tout le marché diesel » ferait 60 000 annonces : ni 20 pages ni 200 n'en
  viennent à bout, et le balayage général la couvre déjà.
- **`q` non vide** → `skipped: "texte_libre"`. `q` est notre `LIKE` par mot sur
  `search_text` (`search.text`) ; leboncoin n'a pas d'équivalent et « à peu près
  la même chose » rendrait un compte attendu faux sans qu'on sache pourquoi.
- **Toujours plus de 20 pages après découpage** (§2.3) → `skipped: "trop_large"`.

### 1.5 `min_age_days` et `dropped`

Aucun équivalent chez leboncoin. **Décision : ils sortent de l'URL, et sortent
aussi du compte attendu** — `expected_total` se calcule sur les filtres
*réellement émis*, jamais sur les filtres complets. Sinon une recherche
`dropped=true` afficherait un attendu de 40 pour une page qui en montre 700, et
le runbook consignerait un écart à chaque run sur une traduction pourtant juste.
La **couverture** (§3), elle, garde les filtres complets : c'est ce que le
marchand a demandé.

### 1.6 Éthanol (§7 du brief)

`ethanol` entre au vocabulaire fermé de l'API et dans la table La Centrale
(§7 ci-dessous). **Côté leboncoin, aucun code n'est connu** : la table `FUEL`
compte neuf codes (1..9) relevés sur pièce le 19/09, aucun n'est l'E85, et le
code 5 est « Autre ». **On n'en invente pas.** Conséquence dans la traduction :
une recherche dont la liste `fuel` contient `ethanol` est émise **sans le
paramètre `fuel` du tout** (pas seulement sans l'éthanol : retirer une valeur
d'une liste rendrait une URL qui filtre *plus* que la recherche). L'entrée porte
`unmapped: ["fuel"]`, et `expected_total` est calculé sans le filtre carburant —
cohérent avec §1.5.

---

## 2. Contrat HTTP

### 2.1 `GET /v1/sweep`

Porte : `require_license` (`auth.py:80`) — clé `Bearer` d'une machine **ou**
cookie de session, exactement comme `/v1/revisits`. Pas `require_account` : la
file est commune, le crawler la tire avec sa propre licence (même raisonnement
que `revisit.due`).

**`GET`, pas `POST`, et rien n'est consommé.** C'est la différence de fond avec la
revisite : là-bas servir une fiche pose `next_detail_crawl` et la retire de la
file pour sept jours ; ici la couverture se mesure sur `last_seen`, c'est-à-dire
sur le travail réellement fait. Deux appels de suite rendent la même file tant que
rien n'a été ouvert. Aucun bail, aucune écriture, aucun verrou.

Paramètre : `pages` (entier, défaut **120**, `ge=1`, `le=400`) — le budget de
pages de tout l'appel.

Réponse :

```json
{
  "pages": 118,
  "items": [
    {
      "url": "https://www.leboncoin.fr/recherche?category=2&sort=price&order=asc&page=1&u_car_brand=Peugeot&u_car_model=Peugeot_208&fuel=1&locations=d_92",
      "pages": 6,
      "expected_total": 193,
      "coverage_24h": 0.21,
      "unmapped": []
    }
  ],
  "skipped": [
    { "reason": "trop_large", "missing": ["brand", "model"] },
    { "reason": "texte_libre" }
  ]
}
```

`pages` au premier niveau = la somme des `pages` servis, pour que le runbook la
consigne sans la recalculer. **Aucune information de compte ne sort** : ni
`account_id`, ni `name`, ni `id` de recherche, ni le nombre de marchands derrière
une entrée. `skipped` ne porte que le motif et ce qui manque — jamais la requête,
qui pourrait porter un `q` saisi par un marchand.

### 2.2 Dédoublonnage et ordre

- **Clé de dédoublonnage : la chaîne `query` normalisée** (`SavedSearch.query`,
  déjà canonique — `saved_searches._normalized_query` trie les listes et fixe
  l'ordre des champs). Deux marchands, même recherche → une entrée. C'est la
  bonne clé et pas l'URL rendue : deux recherches qui ne diffèrent que par
  `min_age_days` donnent la même URL mais pas la même couverture.
- **Les recherches en pause sont exclues de la file** (`SavedSearch.paused`) :
  elles n'alimentent aucune alerte, les balayer prendrait des pages à celles qui
  en alimentent. Leur couverture reste calculée et affichée sur leur carte (§6),
  pour que reprendre une recherche ne parte pas d'un écran muet.
- **Ordre : couverture croissante, `NULLS FIRST`**, puis l'URL pour départager
  (déterminisme). Une recherche dont le périmètre est vide en base (couverture
  `null`) passe en tête : c'est celle dont on ne sait rien.

### 2.3 Nombre de pages, découpage, budget

- `pages = max(1, ceil(expected_total / 35))`. Le `max(1, …)` est essentiel : une
  recherche neuve dont le périmètre est vide en base doit quand même ouvrir sa
  page 1, sinon elle ne se remplira jamais. 35 = `ads_per_page` de `shards.json`.
- **Plafond 20 pages** (≈ 700 annonces) par entrée. Au-delà, découpage récursif,
  exactement l'ordre de `RUNBOOK.md:38` :
  1. `owner_type` : `private` puis `pro` — « premier axe de split, avant de
     toucher aux bornes de prix » ;
  2. puis la tranche de prix en deux, **milieu arrondi à la centaine** ; borne
     haute nulle → `price_min * 2` (`RUNBOOK.md:116`), et si `price_min` est nul
     aussi, 5 000 € (sentinelle choisie ici, à confirmer au premier run).
- **Profondeur maximale : 8 entrées pour une recherche** (owner_type × 2 coupes de
  prix). Au-delà, l'entrée entière devient `skipped: "trop_large"` — une recherche
  marque+modèle qui pèse plus de 5 600 annonces n'existe pas sur ce marché
  (`Renault Clio`, la plus grosse famille de la base, en porte 4 723).
- Chaque sous-entrée recalcule son propre `expected_total` par un `count` sur
  `market_query.core` avec les filtres de la coupe — **jamais une estimation
  divisée en deux**, qui rendrait un attendu faux et un écart permanent au log.
- **Budget** : on empile les entrées tant que `total_pages + entry.pages <=
  pages`. À la première qui ne tient pas, **on s'arrête** — on ne saute pas à la
  suivante pour remplir le budget : sauter affamerait indéfiniment les grosses
  recherches, qui sont justement celles dont la couverture est la plus basse.

---

## 3. La couverture

**Définition** : la part des annonces vivantes qui satisfont les filtres de la
recherche et dont le `last_seen` a moins de 24 h.

```python
FRESH = timedelta(hours=24)

def counts(session, params, license_, now):
    query, _age, _delta = market_core(license_, now, **params.core_kwargs())
    sub = query.subquery()
    total, fresh = session.execute(
        select(func.count(), func.count().filter(sub.c.last_seen >= now - FRESH))
        .select_from(sub)
    ).one()
    return total, fresh
```

**« Sans dupliquer les filtres »** : un seul chemin, `MarketParams.core_kwargs()`
→ `market_query.core`, le même que `/v1/market` et que `alert_rules._alert_query`.
Aucune clause `where` n'est réécrite dans `coverage.py`.

**Une modification de `market_query.core` est nécessaire** : ajouter
`Listing.last_seen` à la liste des colonnes sélectionnées (une ligne). C'est la
plus petite intervention possible ; l'alternative — un `exists` corrélé sur
`listings` — réécrirait le filtre. Conséquences à vérifier par test :
`market_items.item_of` lit ses colonnes par nom et ignore les autres,
`facet_query.py` regroupe sur la sous-requête sans `select *`. Un test le fige
(§8, test 30).

**Les deux nombres exposés** :
- `coverage_24h` : `fresh / total`, arrondi à 2 décimales, **`null` si
  `total == 0`** (jamais `0.0` : « rien à voir » et « rien vu » ne se disent pas
  pareil, et l'ordre de la file les traite différemment).
- `seen_total` : **le dénominateur**, le nombre d'annonces du périmètre. Décision
  arbitrée : le nom se lit aussi « nombre d'annonces vues », mais la paire
  `(part, dénominateur)` est celle qui laisse la page écrire n'importe quelle
  phrase, et la part porte déjà l'information « vue ». Si Alexis lit l'inverse,
  c'est un renommage d'une ligne et d'un test.

**Coût** : une requête par recherche, dans `GET /v1/searches` comme dans
`GET /v1/sweep`. La page Mes alertes fait déjà un `/v1/market/facets` par
recherche (`alerts.js:23`) — l'ordre de grandeur ne change pas. Plafond de 50
recherches par compte (`saved_searches.MAX_SEARCHES`).

### `GET /v1/searches` — trois champs de plus

`SearchOut` gagne :

```python
coverage_24h: float | None = None
seen_total: int = 0
sweep_status: Literal["ok", "trop_large", "texte_libre"] = "ok"
```

`sweep_status` est ajouté au-delà du brief, et volontairement : §6 demande à la
page de dire « trop large, précisez marque et modèle ». Sans ce champ, la page
rejouerait la règle de §1.4 de son côté — deux endroits où la décision « ce qui
est balayable » se prend, qui divergeront. La règle reste dans `sweep_url.py`.

`SearchOut` hérite de `SearchIn` avec `from_attributes` : les quatre routes
(`GET` liste, `GET` unité, `POST`, `PUT`) passent désormais par un helper
`with_coverage(session, license_, row, now)` qui fait
`SearchOut.model_validate(row).model_copy(update={…})`. Une requête de plus sur
`POST`/`PUT` : acceptable, et c'est ce qui permet à la carte de s'afficher
complète juste après l'enregistrement sans second aller-retour.

---

## 4. Découpage en fichiers (tous ≤ 150 lignes)

### API — neufs

| Fichier | ~lignes | Rôle |
|---|---|---|
| `api/adscope_api/sweep_url.py` | 130 | Traduction `MarketParams` → URL leboncoin. Tables inverses `FUEL`/`GEARBOX`, écriture du site lue sur les lignes, motifs de refus. Une seule fonction publique : `translate(session, params) -> (url_base, unmapped, skip_reason)`. |
| `api/adscope_api/sweep_split.py` | 90 | `pages`, plafond 20, découpage `owner_type` puis prix, profondeur 8. Rend une liste de `MarketParams` (les coupes), pas des URL. |
| `api/adscope_api/coverage.py` | 55 | `counts()` ci-dessus, `FRESH`, et `coverage_of(total, fresh)`. Partagé par `sweep.py` et `saved_searches.py`. |
| `api/adscope_api/sweep.py` | 130 | Le routeur `GET /v1/sweep` : lecture des `SavedSearch` non en pause de **tous** les comptes, dédoublonnage par `query`, appel des trois modules ci-dessus, tri, budget. |

### API — modifiés

| Fichier | Δ | Quoi |
|---|---|---|
| `main.py` (144) | +2 | `from . import sweep`, `include_router` |
| `market_query.py` (146) | +1 | `Listing.last_seen` dans le `select` de `core` |
| `saved_searches.py` (126) | +18 | trois champs sur `SearchOut`, helper `with_coverage`, quatre retours |
| `vocab.py` (68) | +3 | `ethanol` dans `FUEL_VALUES`, `Fuel`, `FUEL_LABELS` (`"Éthanol"`) |

`saved_searches.py` monte à ~144 : juste sous le plafond. Si le helper le fait
déborder, il part dans `coverage.py` (c'est sa matière).

### Site

| Fichier | ~lignes | Rôle |
|---|---|---|
| `web/balayage.html` | 19 | Copie de `revisites.html`, titre « adscope — file de balayage », `js/sweep-page.js` |
| `web/js/sweep.js` | 55 | Logique pure : `parseBudget(search)`, cache `sessionStorage` (`adscope.sweep.queue`), `initialView` — calque de `revisits.js` |
| `web/js/sweep-page.js` | 95 | Le DOM : bouton « Demander la file », `#count`, `#queue` avec un `<a href>` et un `data-pages` par entrée — calque de `revisits-page.js` |
| `web/js/alerts-search-coverage.js` | 45 | Les phrases de §6, sans DOM |
| `web/js/api.js` (105) | +7 | `export async function sweep({ pages })` → `GET /v1/sweep` |
| `web/js/fixtures.js` | +8 | la file de démo pour `?demo=1` (capture sans clic, comme revisites) |
| `web/js/fixtures-alerts.js` (142) | +6 | `coverage_24h`/`seen_total`/`sweep_status` sur les trois recherches de démo, dont une `trop_large` |
| `web/js/fixtures-facets.js` | +1 | `ethanol: 'Éthanol'` dans les libellés de démo |
| `web/js/alerts-searches.js` (150, **au plafond**) | ±5 | la phrase de couverture s'insère dans `as-compte` ; le texte vient de `alerts-search-coverage.js`, donc l'ajout net doit être nul ou négatif — sinon la fonction `pastilles` part dans le module de couverture |

**Le site ne code aucun carburant en dur** : les listes de filtres viennent de
`/v1/market/facets`, dont les libellés sortent de `vocab.FUEL_LABELS`
(`facet_query.py:68`). Seul `fixtures-facets.js:23-25` recopie la table pour le
mode démo — c'est la seule ligne à toucher, et c'est vérifié : `grep` sur
`web/js` ne trouve aucune autre liste de carburants.

### Extension

| Fichier | Δ | Quoi |
|---|---|---|
| `extension/src/sites/lacentrale.js` (147) | 0 ligne nette | `BICARBURATION_ESSENCE_BIOETHANOL: 'ethanol'` **dans la table `FUEL` de la ligne 17**, qui tient déjà sur une seule ligne |
| `extension/src/sites/leboncoin.js` (150, **au plafond**) | **aucune** | Aucun code E85 connu dans la table `FUEL` 1..9. On n'invente rien, on n'ajoute rien. |

---

## 5. Le runbook `crawler/RUNBOOK-balayage.md`

**Seul fichier créé dans `crawler/`.** `RUNBOOK.md`, `RUNBOOK-revisites.md`,
`shards.json`, `logs/` : lecture seule, ce sont ceux d'Alexis et de sa session
cowork. Même structure et même ton que `RUNBOOK-revisites.md` — des titres
courts, des encadrés `>` pour les pièges datés, une table « Ce qui casse ».

1. **Encadré de tête** : « Premier geste de tout run, avant tout `navigate` :
   lire `crawler/logs/YYYY-MM.log` ».
2. **La règle, une seule** : « Cette session ouvre des URL. Elle ne conclut
   rien. » Elle n'écrit pas en base, elle ne juge pas un prix, elle ne conclut
   pas qu'une traduction est fausse — elle consigne l'écart, Alexis tranche.
3. **Périmètre** : leboncoin uniquement. La Centrale est hors lot (DataDome).
4. **Prérequis, une fois pour toutes, à la main par Alexis** : connexion par
   email sur `http://localhost:8000/app`. Jamais `127.0.0.1` — pour un cookie ce
   sont deux hôtes distincts (`RUNBOOK-revisites.md:76`). **Cette session ne lit,
   ne recopie ni ne construit jamais de clé de licence** (le classifieur de
   sécurité bloque la lecture de `crawler/.license`, constaté le 18/09).
5. **Healthcheck — celui du crawl, pas celui de la revisite** : sur la page 1 du
   run, compter `document.querySelectorAll('[class*="adscope-"]').length`. Un
   compte normal (~85 par page) prouve extension + API + licence d'un coup. Zéro
   badge = collecte morte, on n'entame pas. **Ne pas utiliser** : un `fetch` vers
   `127.0.0.1:8000` depuis une page leboncoin (bloqué par Private Network
   Access), ni `GET /v1/me` ouvert à la main (toujours « licence invalide »).
6. **Demander la file** : `navigate` vers
   `http://localhost:8000/app/balayage.html?pages=120`, cliquer « Demander la
   file », lire `#count`, puis les `href` et les `data-pages` de `#queue a`.
   **Encadré : rien n'est consommé.** Contrairement à la revisite, recliquer ne
   coûte rien — la file est la même tant que rien n'a été ouvert. On peut donc
   recharger la page, relire la file, et redemander après un incident. C'est la
   règle inverse de `RUNBOOK-revisites.md`, elle doit être écrite comme telle.
7. **Le run** : pour chaque entrée, ouvrir `…&page=1` … `…&page=N` avec `N =
   data-pages`, **par lots de 8 pages au maximum** (au-delà l'extension timeout,
   `RUNBOOK.md:40`), ~2 s d'attente et un `scrollTo(0,9e5)` par page. Ne rien
   lire, ne rien juger, ne pas ouvrir la popup.
8. **La lecture du total** : sur la page 1 seulement,
   `JSON.parse(document.getElementById('__NEXT_DATA__').textContent)`, chercher
   `total`. **Ne jamais renvoyer `location.search` depuis `javascript_tool`** :
   la sortie est bloquée (Cookie/query string data) — ne renvoyer que les
   nombres.
9. **Journal** : `crawler/logs/YYYY-MM.log`, TSV, identifiant `balayage`, une
   ligne **par entrée de la file** :
   `<iso>\t balayage \t <url page 1> \t <pages ouvertes> \t <total attendu> \t <total lu> \t <ok|ecart|erreur>`.
   `ecart` dès que `|lu - attendu| > 10 %` — c'est le signal qui dit qu'un
   paramètre de §1.2 est faux, et c'est tout ce que cette session en dit.
10. **Budget** : 20 minutes. À ~2 s par page plus la navigation, ≈ 120 pages.
    C'est le défaut de `?pages=` ; si le budget restant tombe sous une entrée
    entière, finir l'entrée en cours et s'arrêter (`partial:`).
11. **Horaires** : **ce balayage tôt le matin, AVANT l'email de F1** (planifié à
    7 h au go-live) — un email construit sur des données de la veille ne vaut
    rien. Les revisites plus tard dans la journée.
12. **Ce qui casse** : table à cinq lignes — API muette, « Connectez-vous
    d'abord », zéro badge sur la page 1, plusieurs Chrome connectés (le run
    s'arrête, la sélection ne persiste pas d'un run à l'autre — seul le deviceId
    identifie la machine), une URL qui ne charge pas (la passer, continuer).
13. **Ce qu'il ne faut pas faire** : conclure qu'une traduction est fausse ;
    écrire en base ; toucher `shards.json` (il appartient au balayage général) ;
    ajouter La Centrale ; lire ou construire une clé.
14. **Fin du fichier : le prompt de 5 lignes** à coller dans la tâche cowork —
    lire le log du mois, ouvrir `/app/balayage.html?pages=120`, cliquer, ouvrir
    chaque URL page par page par lots de 8, consigner une ligne par entrée,
    s'arrêter à 20 minutes.

---

## 6. Mes alertes — la couverture en clair

Sur chaque carte, une phrase sous le compte d'annonces (`as-compte`), jamais un
pourcentage nu ni une jauge. Les quatre états, dans `alerts-search-coverage.js` :

| État | Phrase |
|---|---|
| `sweep_status === "trop_large"` | « Pas encore balayée : précisez la marque et le modèle pour que nous la suivions chaque jour. » |
| `sweep_status === "texte_libre"` | « Pas encore balayée : la recherche par mots ne peut pas être rejouée sur le site. » |
| `coverage_24h === null` | « Pas encore balayée. » |
| sinon | « 82 % des annonces vues depuis 24 h. » (`Math.round(coverage_24h * 100)`) |

Écrit pour un marchand : jamais « couverture », jamais « sweep », jamais un nom
de route. Ton du registre consumer (Revolut/Lydia/Alan) : une phrase qui se lit
d'un trait, pas une étiquette et une valeur.

**Parcours de Karim, écrit avant de coder.** Karim ouvre Mes alertes parce qu'il
n'a rien reçu ce matin. Il voit ses trois recherches. Sur « Clio diesel » :
« 94 % des annonces vues depuis 24 h » — donc s'il n'a rien reçu, c'est qu'il n'y
avait rien à dire. Sur « Toutes les voitures diesel » : « Pas encore balayée :
précisez la marque et le modèle » — il comprend en une phrase que c'est **sa**
recherche qui est trop large, pas le produit qui est en panne, et il sait quoi
faire. C'est le seul écran du lot où le mot « balayage » a le droit d'exister,
et encore : sous la forme « balayée ».

Capture : `docs/site-v0-alertes-couverture.png`, prise sur `?demo=1`, les trois
états visibles d'un coup (une recherche à 94 %, une à 21 %, une trop large).

---

## 7. Éthanol — le tour complet

| Où | Quoi | Pourquoi |
|---|---|---|
| `api/adscope_api/vocab.py` | `"ethanol"` dans `FUEL_VALUES`, dans `Fuel`, `FUEL_LABELS["ethanol"] = "Éthanol"` | Le vocabulaire fermé, source unique |
| `extension/src/sites/lacentrale.js` | `BICARBURATION_ESSENCE_BIOETHANOL: 'ethanol'` | Relevé sur une annonce réelle, `.superpowers/lc-carburants.md` |
| `extension/src/sites/leboncoin.js` | **rien** | La table `FUEL` 1..9 n'a pas de code E85. On ne devine pas. |
| `api/tests/test_vocab.py:61` | la liste figée gagne `"ethanol"` | Ce test **rougit tel quel** à l'ajout — c'est voulu |
| `extension/tests/vehicle-fields.test.mjs:82` | **la liste reste à neuf valeurs**, le commentaire est corrigé | Ce test fige ce que *leboncoin traduit*, pas ce que l'API accepte. Après F2 l'API accepte une valeur de plus, qu'aucun code leboncoin ne produit : l'égalité devient une inclusion stricte et le commentaire doit le dire, sinon le prochain lecteur « corrigera » le test en ajoutant `ethanol` à une table où il n'a rien à faire. |
| `web/js/fixtures-facets.js:23` | `ethanol: 'Éthanol'` | Le seul carburant codé en dur du site, et c'est de la démo |
| Filtres du site | **aucun changement** | Vérifié : les listes viennent de `/v1/market/facets` |

Position dans `FUEL_VALUES` : après `gpl`, avant `gnv` — les carburants
alternatifs restent groupés, `autre` reste en dernier.

---

## 8. Les tests, et la ligne de production que chacun fait rougir

Chaque test est prouvé en cassant la ligne visée puis en la restaurant. **Aucun
test ne lit l'horloge réelle** : `now` est un paramètre partout
(`sweep`, `coverage`, `sweep_split`), comme dans `alert_rules.py`.

### `api/tests/test_sweep_url.py` — 12

| # | Test | Ligne rougie |
|---|---|---|
| 1 | `brand=Peugeot, model=208` → `u_car_brand=Peugeot&u_car_model=Peugeot_208` | le gabarit `f"{brand}_{model}"` |
| 2 | filtre canonique `brand=renault`, lignes `Renault` → `u_car_brand=Renault` | l'usage de `listings.brand` au lieu de `canon_brand` |
| 3 | 10 lignes `Renault` + 2 `RENAULT` → `Renault` | le `order_by(func.count().desc())` |
| 4 | pas de marque → `skip="trop_large"`, `missing=["brand"]` | le garde `if not brand` |
| 5 | pas de modèle → `skip="trop_large"` | le garde `if not model` |
| 6 | `q="break"` → `skip="texte_libre"` | le garde `if params.q` |
| 7 | `fuel=["diesel","essence"]` → `fuel=1,2` (trié) | la table inverse + le `sorted()` |
| 8 | `fuel=["ethanol"]` → pas de `fuel=` dans l'URL, `unmapped=["fuel"]` | la branche « un code manquant retire le paramètre entier » |
| 9 | `seller_type="pro"` → `owner_type=pro` | la ligne `owner_type` |
| 10 | `price_min=5000, price_max=None` → `price=5000-max` | le `or "max"` |
| 11 | `department=["92"], region=["ile-de-france"]` → `locations=d_92` | l'appel à `market_filters.combined` |
| 12 | l'URL rendue porte `category=2&sort=price&order=asc&page=1` | les quatre littéraux fixes |

### `api/tests/test_sweep.py` — 10

| # | Test | Ligne rougie |
|---|---|---|
| 13 | deux comptes, même `query` → une seule entrée | la clé de dédoublonnage |
| 14 | les clés d'une entrée sont exactement `{url, pages, expected_total, coverage_24h, unmapped}` | tout ajout futur d'une donnée de compte |
| 15 | couverture 0,2 servie avant 0,9 | le `order_by(coverage)` |
| 16 | couverture `null` (périmètre vide) en tête | le `nulls_first` |
| 17 | 36 annonces → `pages == 2` | le `ceil(total/35)` |
| 18 | 0 annonce → `pages == 1` | le `max(1, …)` |
| 19 | 900 annonces → deux entrées `owner_type=private` et `pro` | le seuil `PAGE_CAP = 20` |
| 20 | `?pages=10` avec deux entrées de 6 pages → une seule servie | le `break` du budget |
| 21 | recherche en pause absente de la file | le `where(SavedSearch.paused.is_(False))` |
| 22 | clé de licence sans compte → 200 | `require_license` (et non `require_account`) |

### `api/tests/test_coverage.py` — 4

| # | Test | Ligne rougie |
|---|---|---|
| 23 | 3 annonces sur 4 vues il y a 12 h → `0.75` | la constante `FRESH` |
| 24 | vue il y a 25 h → hors couverture | la comparaison `>= now - FRESH` |
| 25 | une Clio hors périmètre ne compte dans aucun des deux nombres | le passage de `core_kwargs()` à `market_core` |
| 26 | `total == 0` → `coverage_24h is None`, pas `0.0` | la branche `if total == 0` |

### `api/tests/test_saved_searches.py` — +3

| # | Test | Ligne rougie |
|---|---|---|
| 27 | `GET /v1/searches` porte les trois champs | le `with_coverage` de la route liste |
| 28 | recherche sans marque → `sweep_status == "trop_large"` | le report de `translate()` dans `SearchOut` |
| 29 | `POST /v1/searches` rend déjà les trois champs | le `with_coverage` de la route de création |

### `api/tests/test_market.py` — +1

| # | Test | Ligne rougie |
|---|---|---|
| 30 | un item de `/v1/market` a exactement les mêmes clés qu'avant | l'ajout de `Listing.last_seen` au `select` de `core` |

### `web/tests/sweep.test.mjs` — 6

`parseBudget` (défaut 120, borné 1..400, valeur absurde → défaut) ; cache
`sessionStorage` lu/écrit/oublié ; `initialView` sans session. Chaque test rougit
la ligne correspondante de `sweep.js`, calquée sur `revisits.test.mjs`.

### `web/tests/alerts-search-coverage.test.mjs` — 5

Les quatre phrases de §6, plus l'arrondi (`0.815` → « 82 % »). Chaque test rougit
sa branche de `coverageSentence`.

### `extension/tests/lacentrale-fuel.test.mjs` — +2

`BICARBURATION_ESSENCE_BIOETHANOL` → `ethanol` sur la carte **et** sur la fiche
(la table `FUEL` sert les deux surfaces). Rougit en retirant la clé de la table.

**Totaux attendus** : `api` 816 → ~846 ; `web` 150 → ~161 ; `extension` 427 → 429.

---

## 9. Ordre d'exécution

Deux agents ne travaillent jamais en même temps.

1. **API** — `vocab.py` (éthanol), `coverage.py`, `market_query.py` (+1 ligne),
   `sweep_url.py`, `sweep_split.py`, `sweep.py`, `main.py`,
   `saved_searches.py`, les cinq fichiers de tests. Commit sur `api/` seul.
   **Aucune migration : 013 reste la dernière** — F2 n'ajoute aucune colonne, la
   couverture se calcule sur `listings.last_seen`, qui existe depuis toujours.
   Un `pg_dump` de `adscope` vers `~/adscope-backups/` reste néanmoins obligatoire
   avant `launchctl kickstart -k gui/$UID/fr.adscope.api`.
2. **Site + extension** — `balayage.html`, `sweep.js`, `sweep-page.js`,
   `alerts-search-coverage.js`, les fixtures, `alerts-searches.js`,
   `lacentrale.js`, les tests des deux côtés, la capture. Commit sur `web/` +
   `extension/` + `docs/site-v0-alertes-couverture.png`.
3. **Runbook** — `crawler/RUNBOOK-balayage.md`, commit séparé (c'est le seul
   fichier autorisé dans `crawler/`).

---

## 10. Les pièges, nommés

1. **Sept paramètres d'URL sur douze sont incertains.** Le lot livre une
   traduction plausible et l'instrument qui la mesure ; il ne livre pas une
   traduction vérifiée. Le rapport de fin de lot doit le dire dans sa première
   phrase, et le premier run d'Alexis est la campagne de mesure.
2. **`u_car_model` est le plus fragile** : un séparateur `_` faux, et *toutes*
   les entrées ramènent le marché entier — l'écart au log sera énorme et
   uniforme, ce qui est heureusement facile à reconnaître.
3. **Ne jamais servir une entrée dont l'URL est plus large que la recherche sans
   le dire.** `unmapped` existe pour ça ; sans lui, un écart au log passerait
   pour une traduction fausse alors qu'il est attendu.
4. **`GET`, rien de consommé** : c'est ce qui distingue ce runbook du précédent.
   Écrire l'inverse par calque — « un clic par tranche, une file servie est
   perdue » — donnerait à Alexis une règle fausse et coûteuse.
5. **`extension/src/sites/leboncoin.js` est à 150 lignes pile** et
   `web/js/alerts-searches.js` aussi. Aucune ligne nette ne peut y être ajoutée.
6. **`alerts-searches.js` au plafond** : la phrase de couverture vient d'un
   module, et si l'insertion déborde, c'est `pastilles()` qui déménage.
7. **Le mode démo des alertes ne passe pas par `fixtures.js`** mais par
   `fixtures-alerts.js` (piège déjà nommé au lot F1, `api-alerts.js:6`).
8. **`?demo=1` sur `/app/balayage.html`** doit rendre la file sans clic, sinon la
   capture d'écran n'est pas possible (même mécanique que `revisits-page.js:79`).
9. **Le healthcheck du balayage n'est pas celui de la revisite** : ici on est sur
   des pages de résultats, donc le compte de badges est valide et c'est le bon
   signal. Recopier le « fiche témoin vivante » de `RUNBOOK-revisites.md` serait
   un contresens.
10. **`market_query.core` est partagé par quatre chemins** (`/v1/market`,
    `/v1/market/facets`, `alert_rules`, et maintenant `coverage`). La colonne
    `last_seen` ajoutée doit être vérifiée sur les quatre, pas seulement sur le
    nouveau.
11. **Une recherche neuve a `expected_total = 0`** et doit quand même ouvrir sa
    page 1. Le `max(1, …)` est la ligne qui rend le produit utilisable pour un
    marchand qui vient de s'inscrire.
12. **Aucune requête vers leboncoin ou La Centrale**, pas même pour « vérifier
    une URL ». Le lot s'écrit entièrement sur pièce et sur la base locale.
