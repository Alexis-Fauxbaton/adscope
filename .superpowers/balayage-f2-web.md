# Lot F2 — balayage par recherche : rapport site + extension + runbook

Écrit le 2026-09-22, branche `feat/api`. Périmètre livré ici : point 4
(`/app/balayage.html`), point 5 (`crawler/RUNBOOK-balayage.md`, seul fichier
ajouté à `crawler/`), point 6 (couverture en clair sur « Mes alertes »,
capture), point 7 côté extension (`lacentrale.js`, vocabulaire éthanol) et
vérification des filtres du site. `api/` est resté lecture seule — vérifié
sur pièce (`sweep.py`, `coverage.py`, `saved_searches.py`, `sweep_url.py`,
`vocab.py`), pas de test relancé côté API (hors périmètre, et une autre
session y travaillait en parallèle pendant ce lot — voir « Remarque » en fin
de rapport).

## Statut

Livré et vert. `node --test web/tests/*.test.mjs` → **155 verts** (150 au
départ, +5 : 2 pour `balayage.js`, 3 pour `coverageSentence`).
`node --test extension/tests/*.test.mjs` → **429 verts** (427 au départ,
+2 : la carte et la fiche La Centrale pour l'éthanol). `cd api && pytest`
non relancé (aucun fichier `api/` touché).

## Commits (4)

1. `32d63c5` — Lot F2 : l'éthanol entre chez La Centrale, toujours aucun côté leboncoin
2. `295dd1b` — /app/balayage.html : la file de balayage par recherche (lot F2)
3. `784c89c` — Mes alertes : la couverture du balayage en clair sur chaque carte
4. `0fec73d` — RUNBOOK-balayage.md : le balayage par recherche, sur le modèle de la revisite

## Ce qui a été livré

**4. `/app/balayage.html`.** Sur le modèle exact de `revisites.html` :
`balayage-page.js` demande `/v1/me` pour savoir si une session tient (cookie,
jamais de clé), puis `GET /v1/sweep` au clic sur « Demander la file ». `GET`,
rien n'est consommé côté API : contrairement à la revisite, une page
rechargée et une file redemandée ne coûtent rien — j'ai donc délibérément
laissé tomber le cache `sessionStorage` de `revisits.js` (`initialView`,
`readQueue`/`writeQueue`/`forgetQueue`) : il n'a pas d'équivalent utile ici,
la couverture affichée par `/v1/sweep` vient des données, jamais d'un bail
posé par le clic. Sélecteurs pour la session cowork, documentés dans le
runbook : `#count` (nombre de recherches), `#queue a[href]` (l'URL page 1),
`a[data-pages]` (pages à ouvrir) et `a[data-expected-total]` (total à
comparer à `__NEXT_DATA__`). `?pages=` en query, borné 1..400 comme `pages`
côté `get_sweep` (`parsePages`, testé). `api-sweep.js`/`fixtures-sweep.js`
séparés d'`api.js`/`fixtures.js` : les deux fichiers principaux sont déjà au
plafond de 149 lignes (même raison que `api-alerts.js`/`fixtures-alerts.js`).
Aucune donnée de compte affichée : la réponse `/v1/sweep` n'en porte pas
(prouvé côté API), et la page ne rend que `url`/`pages`/`expected_total`.

**6. Couverture sur « Mes alertes ».** `coverageSentence`
(`alerts-search-rules.js`) traduit `coverage_24h`/`sweep_status` en une
phrase pour un marchand, sans jargon (jamais « sweep », jamais
« coverage_24h ») : un pourcentage entier (`82 % des annonces vues depuis
24 h.`), « Pas encore balayée. » quand `coverage_24h` est `null` (périmètre
vide ou jamais vu), ou, pour `trop_large`/`texte_libre`, « Hors balayage,
trop large : précisez une marque et un modèle. » — dit ce qu'il faut
préciser, comme demandé, sans distinguer les deux statuts à l'affichage (une
recherche par texte libre a, elle aussi, besoin d'une marque et d'un modèle
pour entrer dans le balayage). Posée sous le compte du marché de chaque
carte, même registre discret (gris, jamais une couleur de statut — « hors
balayage » est un fait, pas une alarme). Une recherche en pause garde sa
couverture affichée (vérifié sur la capture : « Dacia Duster », en pause,
montre bien `55 %`), conformément à ce que `with_coverage` fait côté API.

**Capture** `docs/site-v0-alertes-couverture.png` : mode démo
(`?demo=1#/alertes`), servi par un serveur statique local
(`python3 -m http.server`, arrêté après coup par son PID), navigué par
Playwright — aucune requête à l'API réelle, aucune donnée de compte réelle.
Les quatre fixtures démo (`fixtures-alerts.js`) couvrent les trois états :
`82 %`, `Pas encore balayée`, `55 %` (en pause) et `Hors balayage, trop
large` (la quatrième, « Familiales à moins de 15 000 € », sans marque —
seule façon de montrer cet état, aucune des trois recherches nommées
d'origine n'avait de requête assez large).

**5. `crawler/RUNBOOK-balayage.md`.** Seul fichier ajouté à `crawler/` — le
reste (`shards.json`, `logs/`, `.license`, …) n'a jamais été lu en écriture
ni ajouté à l'index (vérifié : `git add` n'a porté que ce seul chemin). Même
structure et même ton que `RUNBOOK-revisites.md` : règle unique (« cette
session ouvre des URL, elle ne conclut rien »), premier geste (lire le log
du mois), témoin repris de `RUNBOOK.md` (badges `adscope-*` sur la première
page de résultats, pas une fiche à part comme la revisite — une page de
résultats a toujours des annonces, une fiche peut légitimement être vide),
file demandée sur `/app/balayage.html` (jamais `curl`, jamais de clé), run
page par page en lots de 8 (contrainte `browser_batch` de `RUNBOOK.md`),
journal TSV une ligne par recherche (`iso`, url page 1, pages ouvertes,
total attendu, total lu dans `__NEXT_DATA__`, statut), budget (~15 min,
généreux au regard du calcul : `pages=120` à ~2,5 s/page tient sous 10 min de
navigation pure), cadence (tôt le matin, avant l'email F1 prévu 7 h au
go-live), table des pannes, et le prompt de cinq lignes pour la tâche cowork
en fin de fichier. Le seuil « écart » (20 %) est une valeur de calibration,
posée faute de mesure antérieure — signalé comme tel dans le runbook, à
revoir après le premier run réel (c'est justement ce premier run qui vérifie
la traduction d'URL, jamais visitée avant ce lot).

**7 (éthanol, extension).** `BICARBURATION_ESSENCE_BIOETHANOL: 'ethanol'`
ajouté à la table `FUEL` de `extension/src/sites/lacentrale.js` (149 lignes),
en miroir du vocabulaire fermé déjà livré côté API (`vocab.py`). Rien ajouté
côté `extension/src/sites/leboncoin.js` : la table 1..9 relevée le
2026-09-19 n'a aucun code pour l'éthanol, documenté en commentaire au point
exact plutôt qu'inventé. `extension/tests/lacentrale-fuel.test.mjs` : le
couple rejoint `OBSERVED` (carte + fiche, 2 tests) ; le test « valeur
inconnue » qui utilisait jusqu'ici `BICARBURATION_ESSENCE_BIOETHANOL` comme
exemple de code non traduit a été réécrit sur une valeur `MYSTERE` — sans
quoi il aurait rougi pour la mauvaise raison (le code qu'il citait est
maintenant traduit). `extension/tests/vehicle-fields.test.mjs` : le
commentaire au-dessus du test qui fige le vocabulaire leboncoin explique
maintenant pourquoi il reste à neuf valeurs quand l'API en porte dix.

**7 (filtres du site).** Vérifié, rien à corriger : les carburants proposés
par « Le marché » et « Mes recherches » viennent de `ui.facets.fuel`
(`market-panel.js:123`), lui-même posé par `/v1/market/facets` — jamais
d'une liste écrite en dur côté site. Aucune occurrence de `'essence'`,
`'diesel'`, etc. hors des fichiers `fixtures-*.js` (démo, duplication déjà
acceptée ailleurs faute de `shared/`). Rien à ajouter pour l'éthanol côté
site : le jour où une annonce le porte, la facette le fait apparaître
d'elle-même.

## Preuve des tests neufs

Chaque test neuf a été prouvé rouge puis vert en cassant sa ligne de
production nommée dans son commentaire, restaurée ensuite :
- `coverageSentence` (trois tests) : garde `trop_large`/`texte_libre`
  neutralisé, `coverage_24h == null` neutralisé, `Math.round(… * 100)`
  changé en `Math.round(…)` — trois ruptures, trois tests rouges, un à un.
- `parsePages` (deux tests) : garde `raw < 1` neutralisé, `Math.min(…,
  MAX_PAGES)` retiré — deux ruptures, deux tests rouges.
- Éthanol côté extension : `BICARBURATION_ESSENCE_BIOETHANOL: 'ethanol'`
  changé en `'nope'` dans `lacentrale.js` → les deux tests du couple
  rougissent (carte et fiche), restauré, suite revenue à 429/429.

## Réserves

- Le seuil « écart » du runbook (±20 %) est posé sans mesure : premier
  chiffre raisonnable, pas un calcul. À ajuster après le premier run réel.
- La traduction d'URL elle-même (`sweep_url.translate`, côté API) reste
  celle du rapport `balayage-f2-api.md` — sept paramètres sur douze non
  vérifiés par une visite. Ce lot ne change rien à ça, il fournit l'outil
  qui permettra à Alexis de la vérifier au premier run.
- Le message affiché pour `sweep_status: 'texte_libre'` est identique à
  celui de `trop_large` (« précisez une marque et un modèle ») : une
  recherche en texte libre n'a en pratique pas de marque/modèle posés non
  plus, donc le même conseil s'applique — mais le brief ne demandait
  explicitement ce libellé que pour `trop_large`. Si Alexis veut un message
  distinct pour le texte libre, c'est un seul `if` à ajouter dans
  `coverageSentence`.

## Remarque (hors périmètre, transparence)

Pendant ce lot, une autre session a modifié `api/` en parallèle
(`auth_models.py`, `login_tokens.py`, `mail_outbox.py`,
`migration_registry.py`, un nouveau `migration_sql_passwords.py`, et un
commit `1a60103` porte une migration 014) — visible dans `git log`/`git
status` au fil du travail, jamais touché ni commité ici. Signalé pour que
personne ne s'étonne d'un `git log` qui ne montre pas que les quatre commits
listés ci-dessus.
