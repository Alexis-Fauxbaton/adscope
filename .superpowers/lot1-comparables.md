# Lot 1 — la route des comparables

`GET /v1/listings/{site}/{site_id}/comparables`, conforme au contrat, servie
derrière la même licence que le reste. 214 tests API verts (194 + 20), 302
tests extension verts, extension non touchée.

## Ce qui a été écrit

- `api/adscope_api/comparables.py` (130 l.) — le calcul. Une requête d'agrégat
  par segment interrogé, jamais de comparables remontés en mémoire.
- `api/adscope_api/schemas.py` — `SegmentOut` et `ComparablesOut` (148 l.).
- `api/adscope_api/main.py` — la route, à côté de `get_listing` (132 l.).
- `api/tests/test_comparables.py` — 20 tests (189 l.).

Le corps du calcul tient en trois temps :

1. `DISTINCT ON (listing_id)` ordonné par `observed_at DESC, id DESC` : un prix
   par annonce du segment, le dernier — sans quoi une annonce suivie depuis six
   mois pèserait cent fois celle vue hier.
2. Un seul `SELECT` d'agrégat par-dessus : `count`, `min`, `max`, les trois
   `percentile_disc` et le `count(*) FILTER (WHERE price <= :prix)` qui donne le
   rang. Postgres rend sept nombres, Python n'en manipule pas un de plus.
3. La version d'abord si l'annonce en porte une ; sous quinze comparables, la
   même mesure est refaite sans elle et `segment.version` reste nul — le repli
   se lit dans la réponse, il n'est pas silencieux.

## Décisions là où le contrat se tait

- **Le segment ne s'arrête pas au site.** La même voiture au même âge vaut la
  même chose des deux côtés ; le site ne sert qu'à retrouver l'annonce. En base
  le point est presque théorique (46 548 lbc contre 24 lc), mais il est tenu par
  un test — l'ajouter comme filtre le fait rougir.
- **Aucun filtre sur les annonces disparues ni sur la fraîcheur.** La base de
  dev en compte zéro de chacune ; la question reste ouverte, et le jour où elle
  se posera c'est une clause de plus dans `_last_prices`.
- **`dispersion` est arrondie à deux décimales avant d'être jugée**, pour que le
  nombre servi et le verdict qu'il porte ne se contredisent pas à la troisième.
  À 0,30 pile le segment tient : le seuil exclut, il ne borne pas.
- **Ordre des refus** : `no_segment`, puis `too_few`, puis `too_dispersed`. Un
  segment de trois annonces très dispersées est refusé pour sa taille, qui est
  la raison la plus honnête.
- **Une annonce sans point de prix** (possible : un prix aberrant est ignoré à
  l'entrée) reçoit `percentile: null`. `prix <= NULL` ne compte aucune ligne et
  l'aurait fait passer pour la moins chère de son segment.

## Tests : la ligne que chacun tient

Chaque test a été prouvé en cassant la ligne nommée ; les 21 mutations rendent
rouge le test attendu, et le journal ci-dessous ne relève que celui-là (une
mutation en fait souvent tomber d'autres, ce qui est normal).

| Test | Ligne de production | Mutation |
|---|---|---|
| `the_segment_is_brand_model_and_year` | `percentile_disc(0.25) … label("q1")` | `0.25` → `0.5` |
| `another_year_another_model_another_brand_are_not_comparables` | `Listing.year == listing.year` | ligne retirée |
| `the_listing_is_not_its_own_comparable` | `Listing.id != listing.id` | ligne retirée |
| `the_market_does_not_stop_at_the_site` | l'absence de clause de site dans `_last_prices` | `Listing.site == listing.site` ajoutée |
| `a_listing_weighs_once_whatever_its_price_history` | `.distinct(PricePoint.listing_id)` | ligne retirée |
| `the_price_of_a_comparable_is_its_last_one` | `order_by(…, observed_at.desc(), id.desc())` | `.desc()` → `.asc()` |
| `the_listing_is_placed_by_its_own_last_price` | le même tri dans `_own_price` | `.desc()` → `.asc()` |
| `the_version_refines_the_segment_when_it_holds` | `where.append(Listing.version == …)` | remplacée par `pass` |
| `the_version_gives_way_below_fifteen` | le repli `_measure(…, versioned=False)` | branche supprimée |
| `a_segment_under_fifteen_is_not_comparable` | `"too_few" if row.total < MIN_COUNT` | `MIN_COUNT` 15 → 3 |
| `a_segment_under_fifteen_is_not_comparable` | `None if reason is not None or row.below is None` | garde `reason` retirée |
| `the_bounds_survive_a_segment_too_small` | `quartiles = row.total >= MIN_QUARTILES` | `MIN_QUARTILES` 4 → 5 |
| `under_four_comparables_no_bound_is_served` | la même ligne | `MIN_QUARTILES` 4 → 3 |
| `a_scattered_segment_is_not_comparable` | `MAX_DISPERSION = 0.30` | → `3.0` |
| `a_dispersion_of_exactly_thirty_percent_still_holds` | `dispersion > MAX_DISPERSION` | `>` → `>=` |
| `a_car_missing_brand_model_or_year_has_no_segment` | la garde `no_segment` | `or listing.year is None` retiré |
| `cheaper_than_all_of_them_sits_at_zero` | `count().filter(column <= price)` | `<=` → `>=` |
| `dearer_than_all_of_them_sits_at_hundred` | `round(100 * row.below / row.total)` | `row.total` → `row.total + 1` |
| `the_route_serves_the_segment` | le chemin `/…/comparables` | renommé `/comps` |
| `the_route_404s_on_an_unknown_listing` | `raise HTTPException(404)` | retirée |
| `the_route_requires_a_license` | `_=Depends(require_license)` | retiré |

Le script de campagne est jetable, il n'est pas versionné.

## Mesures sur la base réelle (46 572 annonces)

**Clio 2005, segment de 217 annonces** (`lbc/3262535708`, sans version) :
**21 ms de médiane** de bout en bout sur 15 appels HTTP à l'API en service
(min 17, max 26). Le calcul seul est à 7–11 ms, dont 12,8 ms d'un `Seq Scan` sur
`listings` — c'est le seul coût réel.

Un index sur `(brand, model, year)` ramène la requête de **14,9 ms à 0,8 ms**
(mesuré, index créé puis retiré : la base est intacte). Je ne l'ai pas posé —
c'est une migration, et elle n'était pas dans le lot. À 46 000 annonces le
balayage se paie sans se voir ; à 500 000 il vaudra 150 ms par ouverture de
fiche. C'est la prochaine ligne à écrire.

Trois réponses réelles, servies par le service relancé et la licence de test :

```
lbc/3176349313  Porsche 911 2017, version « 911 Coupe 4.0 500ch GT3 PDK » gardée
                count 23 · 144 900 / 157 900 / 164 900 / 168 000 / 189 900
                dispersion 0.06 · percentile 0 · comparable true
lbc/3262535708  Renault Clio 2005 · count 216 · médiane 1 500
                dispersion 0.67 · comparable false · too_dispersed
lbc/3260596740  Peugeot 207 2008 · count 285 · médiane 1 800
                dispersion 0.78 · comparable false · too_dispersed
```

404 sur une annonce inconnue, 401 sans licence : vérifiés en vrai.

Le seuil fait exactement ce que les mesures annonçaient : la Porsche de 2017
passe, les deux voitures d'avant 2012 sont retenues. Une 207 de 2008 à 300 000 km
et une autre à 90 000 ne sont pas la même voiture, et l'année seule ne le dit pas.

## Deux choses vues en passant, hors lot

- **Des prix à 1 €** dans les vieux segments (32 des 285 annonces de 207 2008
  sont sous 1 000 €, dont plusieurs à 1 € ou 100 €). Ce sont de vraies annonces
  au prix affiché — l'appât classique — mais elles tirent `q1` et gonflent la
  dispersion. Les écarter changerait le nombre d'annonces jugées comparables ;
  c'est une règle produit, pas un correctif, et elle n'est pas dans le contrat.
- La couverture réelle de `comparable: true` mériterait d'être recomptée sur la
  base entière maintenant que la règle existe : les 63 % mesurés portaient sur
  la taille du segment, pas sur sa dispersion.
