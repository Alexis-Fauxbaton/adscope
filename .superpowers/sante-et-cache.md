# Lot : cache du site, rapport de santé, marque répétée

Dépôt `feat/api`, HEAD de départ `feb2ce4`. Touché : `api/`. Rien dans
`shared/` (le rapport de santé, lancé sur la base réelle, ne signale aucune
marque inconnue à y ajouter). 450 tests passent (`417` de départ + `5` cache
+ `23` rapport de santé + `5` naming).

## 1. `/app` sans consigne de cache

Ajouté `api/adscope_api/static.py` : `NoCacheStaticFiles`, une sous-classe de
`StaticFiles` qui pose `Cache-Control: no-cache` sur chaque réponse (`file_
response`, surchargée). `main.py` monte le site avec elle à la place de
`StaticFiles`. `/v1/*` n'est pas touché — c'est un montage différent.

`no-cache` force la revalidation à chaque chargement ; `ETag` et
`Last-Modified`, posés par `StaticFiles` elle-même, font le reste : un
fichier inchangé revient en `304` sans retéléchargement.

Tests (`api/tests/test_static_cache.py`, 5) : en-tête présent sur `/app/`,
sur un `.js`, sur un `.css` ; `304` avec `If-None-Match` égal à l'`ETag` ;
`/v1/*` sans l'en-tête. Chacun cassé puis rétabli pour vérifier qu'il tient
la ligne qu'il nomme (voir les commentaires « Fait rougir » dans le fichier).

Vérifié en vrai, service relancé par le label :

```
$ launchctl kickstart -k gui/$UID/fr.adscope.api
$ curl -sS -D - -o /dev/null http://localhost:8000/app/js/format.js
HTTP/1.1 200 OK
...
etag: "cd2ed4f3c22501844136afcf8a4a067d"
cache-control: no-cache
```

## 2. Le rapport de santé des données

Trois modules, chacun sous 150 lignes :

- `api/adscope_api/data_health_queries.py` — les quatre sections, chacune une
  requête (`unknown_brands`, `emerging_models`, `unknown_share`,
  `publication_freshness`).
- `api/adscope_api/data_health.py` — `head_line`, la classe `Report` (avec sa
  propriété `alerts`) et `compute()`, qui assemble tout sur un instant et une
  fenêtre injectés.
- `api/adscope_api/data_health_text.py` — `render()`, la mise en texte.
- `api/scripts/data_health.py` — le point d'entrée : lit l'horloge, appelle,
  imprime, sort avec `1` s'il y a une alerte, `0` sinon.

### Ce que « la date exacte » recouvre pour La Centrale

`models.py` / `signals.py` : les deux sites — leboncoin et La Centrale —
portent leur date exacte dans **la même colonne**, `published_at`.
`extension/src/sites/lacentrale.js` la lit dans `creationDate` (fiche) ou
`firstOnlineDate` (carte) exactement comme `leboncoin.js` la lit dans
`first_publication_date`. Dès que `published_at` est posé,
`signals.signals_for` rend `age_source: "exact"` pour les deux sites — il n'y
a pas de traitement différent selon le site à ce niveau. `site_published_
first`/`published_days_ago` (qui donneraient `age_source: "inferred"`)
existent dans le schéma mais **aucun des deux sites ne les nourrit
aujourd'hui** : c'est un mécanisme de secours prêt, pas actif. La section «
date de première publication » compare donc, par site, la part de nouvelles
annonces avec `published_at` posé — c'est le point fragile réel : un site qui
retire ce champ de ses pages fait tomber cette part sans qu'on y touche.

### L'alerte

Se lève quand la part de dates exactes tombe sous 90 % alors qu'elle
dépassait 98 % la fenêtre précédente, et seulement si les deux fenêtres
portent chacune au moins 50 nouvelles annonces sur ce site — en dessous,
« trop peu pour conclure », jamais une alerte.

Tests (`api/tests/test_data_health.py`, 16 ; `api/tests/test_data_health_
text.py`, 7) : chaque section sur des données construites, seuil de volume
testé aux deux bords, alerte testée aux deux bornes (90 % et 98 %) et sans
baseline établie. Chacun cassé puis rétabli (voir « Fait rougir » dans les
fichiers) — un cas noté au passage : la garde `len(model_words) <=
len(brand_words)` que j'avais d'abord ajoutée dans `naming._rebrand` (§3)
s'est révélée redondante à l'épreuve — retirée, remplacée par un commentaire,
plutôt que de garder une ligne qu'aucun test ne fait vraiment rougir.

### Lancer le rapport

```
cd api && ./.venv/bin/python scripts/data_health.py [jours-de-fenêtre]
```

Rien de planifié par ce lot. En launchd, un plist à côté de `fr.adscope.
api.plist` :

```xml
<key>ProgramArguments</key>
<array>
  <string>/Users/alexis/Documents/Projets/adscope/api/.venv/bin/python</string>
  <string>/Users/alexis/Documents/Projets/adscope/api/scripts/data_health.py</string>
</array>
<key>StartCalendarInterval</key>
<dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer></dict>
<key>StandardOutPath</key>
<string>/Users/alexis/Documents/Projets/adscope/api/scripts/data_health.log</string>
```

Ou en cron, même heure :

```
0 8 * * * cd /Users/alexis/Documents/Projets/adscope/api && ./.venv/bin/python scripts/data_health.py >> scripts/data_health.log 2>&1
```

### Sortie sur la base réelle (`adscope`, 52 957 annonces)

Lancé le 2026-09-19, fenêtre par défaut (7 jours). Code de sortie `0` —
aucune alerte. Note : la base vient d'un chargement initial massif, donc la
section « modèles apparus » est anormalement longue (138 lignes) — elle
reflète tout ce qui est entré cette semaine, pas seulement les nouveautés au
sens produit. Un run quotidien en régime de croisière en montrera très peu.

```
Rapport de santé — 2026-09-19 09:43 UTC
52957 annonces en base, dernière vue le 2026-09-19 10:45 UTC

Marques inconnues de shared/vehicle-aliases.json :
  - aucune

Modèles apparus dans la fenêtre (>= 5 annonces) :
  - Renault / Clio (414 annonces) → affiché « Renault Clio »
  - Peugeot / 206 (214 annonces) → affiché « Peugeot 206 »
  - Peugeot / 207 (214 annonces) → affiché « Peugeot 207 »
  - Renault / Megane (188 annonces) → affiché « Renault Mégane »
  - Renault / Twingo (185 annonces) → affiché « Renault Twingo »
  [... 133 lignes de plus, une par modèle apparu cette semaine, triées par
  nombre d'annonces décroissant — voir la sortie complète du script pour le
  détail ; sans intérêt à recopier ici en entier ...]
  - Peugeot / 405 (5 annonces) → affiché « Peugeot 405 »

Part d'« Autres » :
  - modèle : 9.0% sur toute la base, 6.0% sur la fenêtre
  - marque + modèle : 0.5% sur toute la base, 0.3% sur la fenêtre

Date de première publication, par site :
  - lbc : 5150 nouvelles annonces, 100.0% avec date exacte (fenêtre précédente : 47783, 100.0%)
  - lc : 0 nouvelles annonces (fenêtre précédente : 24) — trop peu pour conclure

Code de sortie : 0
```

lbc tient sa promesse (100 % sur les deux fenêtres, largement au-dessus du
volume minimal) ; lc n'a pas eu de nouvelle annonce cette semaine (son seul
relevé date du 2026-09-06, tombé dans la fenêtre précédente ici) — trop peu
pour rien dire de sa fraîcheur, correctement signalé comme tel plutôt que
tairon ou fausse alerte.

## 3. La marque répétée par le nom du modèle

Remesuré sur la base réelle avant de toucher au code : **94 annonces** sur
52 957 ont un modèle canonique qui commence par la marque canonique — DS 68,
McLaren 15, Abarth 11. Chiffres identiques à ceux du lot précédent. Zéro
contre-exemple : les cinq couples (marque, modèle canonique) en cause sont
`(Abarth, Abarth 500)`, `(DS, DS 3/4/5/7)`, `(McLaren, Mclaren 720S)` —
inspectés un à un, aucun n'aurait dû garder sa marque répétée.

`api/adscope_api/naming.py` : ajout de `_rebrand(canon_brand, canon_model)`,
appelée depuis `label()` quand la marque et le modèle ne sont pas déjà
identiques (le cas « Mini + Mini », déjà traité, ne l'atteint pas). Elle
compare mot à mot (jamais une sous-chaîne — sinon « Renault » mordrait dans
« Renaultsport ») et, si le modèle commence bien par la marque, rend la
marque **avec sa propre orthographe** (liste fermée des 83 marques) suivie du
reste du modèle — pas l'orthographe du modèle telle quelle, un vocabulaire
ouvert moins soigné : « McLaren » + « Mclaren 720S » rend « McLaren 720S »,
jamais « Mclaren 720S ». C'était la seule façon de ne pas dégrader une
marque déjà bien écrite tout en retirant la redite — un vrai risque relevé
en testant, pas anticipé au départ.

`DS` + `DS 3` + `Crossback PureTech 130ch` → `DS 3 Crossback PureTech
130ch`, confirmé sur une vraie ligne de la base :

```
'Ds' | 'Ds3' | 'Performance Line_DS 3 Crossback PureTech 130ch Performance Line Automatique'
  -> DS 3 Crossback PureTech 130ch Performance Line Automatique
```

Tests (`api/tests/test_naming.py`, 24 dont 5 nouveaux et 1 modifié) : le cas
DS/DS3 existant (`test_the_model_written_with_a_space_in_the_version_goes_
whole`) mis à jour vers le nouveau libellé attendu ; ajouté le cas direct
(DS, Abarth), la préservation de la casse de la marque (McLaren), le
garde-fou Mini/Mini inchangé, un modèle plus court que la marque, et une
marque qui n'est qu'un préfixe textuel — pas un mot entier — du modèle
(« Renault » dans « Renaultsport »). Chacun cassé puis rétabli.

**`recanonize.py --all` non rejoué** : `taxonomy.derive` (que le script
appelle) ne calcule que `canon_brand`, `canon_model` et `search_text` — ni
l'un ni l'autre ne passe par `naming.label`. `market_items.py` confirme :
`label(row.brand, row.model, row.version)` est appelé à la lecture, sur les
colonnes observées. Rien à rejouer.

## Suite

- `api/adscope_api/static.py`, `api/adscope_api/main.py`
- `api/adscope_api/data_health.py`, `data_health_queries.py`,
  `data_health_text.py`, `api/scripts/data_health.py`
- `api/adscope_api/naming.py`
- Tests : `api/tests/test_static_cache.py`, `test_data_health.py`,
  `test_data_health_text.py`, `test_naming.py` (modifié)
