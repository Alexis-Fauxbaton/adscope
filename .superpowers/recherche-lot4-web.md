# Recherche filtrée, lot 4 — côté `web/`

Rapport de l'agent web, en parallèle du lot API (`api/`). Contrat tenu : voir
`docs/roadmap.md` § « Programme recherche filtrée » et le contrat fixé dans la
tâche (`/v1/market` + six bornes entières, `/v1/market/facets`).

## Fait

### La page

- **Rangée toujours visible** (`web/js/market-filters.js`, carte blanche, deux
  lignes aérées) : recherche texte · **Marque** · **Modèle** · **Ancienneté**
  (tous · ≥ 30 j · ≥ 60 j · ≥ 90 j) · **Avec baisse** · le bouton **Plus de
  filtres** au bout de la seconde ligne.
- **Marque et Modèle** sont un composant à part (`web/js/combo.js`) : bouton +
  panneau flottant avec champ de filtre, compteurs à droite, flèches/Entrée/
  Échap, `aria-activedescendant`, focus rendu au bouton en sortant. Un
  `<select>` ne sait pas afficher un compte par option, et la vraie base porte
  une centaine de marques. Le **Modèle** est désactivé tant qu'aucune marque
  n'est choisie (« Choisir une marque »), et « Modèle non précisé » ferme sa
  liste.
- **Plus de filtres** (`web/js/market-panel.js`), replié par défaut, en grille
  deux colonnes : Prix / Année / Kilométrage (deux champs chacun, bornes
  suggérées par `ranges` en **placeholder**) · Vendeur · Carburant (pleine
  largeur, neuf valeurs) · Boîte · Lieu (région puis département).
- **Pastilles retirables** (`web/js/market-chips.js`) sous la rangée et
  **au-dessus** du panneau — ouvert, il ferait sinon descendre hors de l'écran
  ce qui dit quels filtres agissent. Plus « Tout effacer », qui garde le tri.
- **Les familles suivies** deviennent des raccourcis (six au plus) qui posent
  marque *et* modèle d'un clic. Elles ne paraissent que sur un écran vierge ;
  une fois un filtre posé, la place revient aux pastilles.
- **La recherche texte se combine à tout** : l'exclusion saisie/famille du lot
  1 (`familyInputPatch`) est retirée.
- **L'URL porte les filtres**, dans le fragment après la route
  (`#/marche?brand=peugeot&min_age_days=60`) et non dans la query string, qui
  porte déjà `?demo=1`. `pushState` n'émet pas `hashchange` : l'écran ne se
  redessine pas sous nos pieds ; le bouton retour, lui, l'émet, et `app.js`
  relit les filtres dans l'URL. La frappe remplace l'entrée courante
  (`replaceState`) plutôt que d'en empiler une par pause de saisie.
- **Compteurs** : `/v1/market/facets` à chaque changement, même temporisation
  injectable que la recherche (`createFacetRefresher`, `web/js/market-state.js`).
  Les anciens compteurs restent pendant l'attente, une réponse en retard ne
  remplace jamais une plus récente (jeton), une panne de facettes ne vide rien.
- **Honnêteté sur les champs partiels** : ligne discrète sous carburant, boîte
  et lieu dès que `*_unknown` n'est pas nul — « Carburant connu sur 17 % des
  annonces — le reste se complète au fil des passages. » Le dénominateur se lit
  **dans la facette** (somme des compteurs + inconnues), jamais dans
  `facets.total` : une facette se compte sans son propre filtre, donc sur un
  autre ensemble que le total affiché ; les mélanger donnerait « connu sur
  320 % ».
- **États** : chargement, aucun résultat (« Aucune annonce pour ces filtres. » +
  « Tout effacer », `web/js/market-list.js`), panne d'API.
- **Mobile** (≤ 720 px) : la rangée se réduit à la recherche et à
  « Filtres (n) » ; le panneau s'ouvre en feuille plein écran, une colonne, avec
  marque/modèle/ancienneté/baisse **en tête** (sans quoi ils seraient
  injoignables au téléphone) et une barre collée en bas « Voir N annonces ».
- **Accessibilité** : vrais `<label>` (`for`) sur la recherche, la marque, le
  modèle, la région, le département, et un `<label>` masqué (`.sr`) par borne de
  fourchette ; `role="group"` + `aria-label` sur les jeux de boutons,
  `aria-pressed`, `aria-expanded`, focus visible partout.

### Deux décisions prises en cours de route

1. **Une adresse qui porte un filtre du panneau arrive panneau ouvert**, au
   premier affichage seulement (`panelCount`). Sans ça, celui qui reçoit un lien
   « prix ≤ 20 000 € » lit une liste réduite par un filtre qu'il ne voit nulle
   part. Ensuite c'est le marchand qui décide, le panneau ne se rouvre plus seul.
2. **Une fourchette à l'envers (min > max) ne part pas** vers l'API. Le contrat
   dit 422 ; afficher « L'API n'a pas répondu » pour une saisie que le panneau
   signale déjà en rouge ferait chercher la panne du mauvais côté. L'écran
   montre l'état vide et la phrase d'erreur sous le champ.

### Point à aligner avec l'agent API — **important**

Le contrat dit « chaque facette se compte sans son propre filtre ». Appliqué à
la lettre, **la liste des marques se compte sans `brand` mais avec `model`** :
choisir « Renault Clio » ne laisse plus que Renault dans la liste des marques
(« Clio » n'existe que chez elle), et on ne peut plus changer de marque sans
défaire le modèle d'abord. Mesuré dans un vrai navigateur, c'est un cul-de-sac.

Le mode démo compte donc `brands` **sans `brand` ni `model`** — marque et modèle
sont un seul choix en deux temps. Test :
`web/tests/fixtures-facets.test.mjs` › « un modèle choisi n'enferme pas dans sa
marque ».

**L'API livrée le même jour fait l'autre choix.** Son rapport le dit noir sur
blanc (`.superpowers/recherche-lot4-api.md`) : « `brands` exclut `brand`
(`model` reste appliqué s'il est posé) », et sa réserve « cas d'usage
improbable côté site (le lot `web/` cascade marque → modèle), non testé
spécifiquement » — c'est précisément le cas courant du site. **Tant que
`market_facets.get_facets` n'exclut pas aussi `model` de la facette `brands`,
le site branché sur l'API enfermera le marchand dans sa marque dès qu'il aura
choisi un modèle.** Un mot d'Alexis suffit : c'est `excluding('brand')` à
passer en `excluding('brand', 'model')` côté API, rien de plus.

### Le mode démo

`?demo=1` ne fait aucun appel réseau et sert désormais aussi les facettes.
`web/js/fixtures-rows.js` (sorti de `fixtures-data.js`) porte 54 annonces, 24
marques, plusieurs modèles sur Peugeot, Renault, Citroën, Volkswagen, Toyota, et
trois Peugeot « Autres » — autant que la 208, pour que la règle qui renvoie
« Modèle non précisé » en queue de liste soit **prouvable**. Carburant, boîte et
département ne sont renseignés que sur 9 lignes sur 54 (~17 %), l'ordre de
grandeur de la vraie base. `web/js/fixtures-facets.js` recalcule chaque facette
sans son propre filtre, `web/js/fixtures-filter.js` porte le filtre commun avec
son paramètre `skip`.

### Fichiers

Neufs : `web/js/combo.js`, `market-chips.js`, `market-facets.js`,
`market-list.js`, `market-panel.js`, `market-sections.js`, `market-state.js`,
`url-state.js`, `fixtures-facets.js`, `fixtures-filter.js`, `fixtures-rows.js` ·
`web/css/filters.css`, `web/css/panel.css`.
Modifiés : `web/js/query.js`, `market.js`, `market-filters.js`, `api.js`,
`app.js`, `fixtures.js`, `fixtures-data.js` · `web/css/views.css` ·
`web/index.html`.

**Tous les fichiers source ≤ 150 lignes** (le plus long : `fixtures.js`, 149).
`market.js` et `filters.css` ont été scindés pour ça (`market-list.js`,
`panel.css`), ainsi que `query.test.mjs` (`query-ranges.test.mjs`).

## Tests

`node --test web/tests/*.test.mjs` : **106 verts** (61 avant le lot). Six
fichiers neufs (`url-state`, `market-chips`, `market-facets`, `market-state`,
`fixtures-facets`, `query-ranges`). Aucun ne lit l'horloge réelle : les deux
temporisations sont testées avec une minuterie posée à la main.

Chaque test nomme en commentaire la ligne de production qu'il fait rougir, et
**la preuve a été faite** : 20 lignes cassées une à une, test relancé, restaurée.
Une seule était verte à la casse au premier essai — la règle « Modèle non
précisé en dernier », que les fixtures rendaient vraie par accident (l'ordre par
compte décroissant la mettait déjà en queue) ; corrigé en ajoutant deux Peugeot
« Autres », la règle rougit maintenant.

`cd api && ./.venv/bin/pytest tests/ -q` : hors périmètre de cet agent (lot API
en parallèle), non relancé ici.

## Vérifié dans un vrai navigateur

Chrome headless piloté par CDP et Playwright, sur `?demo=1`, aucune erreur
console :

- frappe dans la recherche : le focus n'est **jamais** coupé (la rangée ne se
  redessine pas tant qu'un champ y est en saisie, ni tant qu'une liste y est
  ouverte) ; URL mise à jour, compteur et pastilles suivis ;
- liste marque au clavier : flèches, `aria-activedescendant`, Entrée choisit,
  Échap referme, le focus revient au bouton — et après un choix, la rangée se
  redessine **et rend le focus** à l'élément de même `id` ;
- cascade : passer de « Renault Clio » à « Peugeot » vide le modèle (3 → 9
  annonces) ; la liste des marques reste complète (le point signalé ci-dessus) ;
- **bouton retour** : revient à `#/marche?brand=renault&model=clio`, réaffiche
  les deux listes et le compte de 3 ;
- fourchette à l'envers : phrase rouge sous le champ, état vide, aucun appel ;
- « Tout effacer » depuis l'état vide : URL revenue à `#/marche`, 54 annonces,
  zéro pastille, raccourcis de familles de retour.

## Captures

Refaites en mode démo, Chrome headless, densité 2, serveur statique local lancé
et **arrêté par PID** (aucun processus tué par motif) :

- `docs/site-v0-filtres.png` — rangée seule, trois pastilles actives
  (`--headless=new --force-device-scale-factor=2 --virtual-time-budget=5000`) ;
- `docs/site-v0-filtres-ouverts.png` — « Plus de filtres » ouvert, mêmes
  drapeaux ;
- `docs/site-v0-filtres-mobile.png` — 390 px de large. `--window-size=390` n'est
  pas honoré par Chrome headless (plancher ~500 px : mesuré, la page débordait
  à droite) ; piloté par CDP (`Emulation.setDeviceMetricsOverride`, 390 × 844,
  facteur 2), qui pose aussi le clic sur « Filtres ».

Chaque capture relue et corrigée avant d'être gardée. Ce qui a été repris sur
pièce : deux libellés empilés au-dessus des listes marque/modèle ; « Prix » au
lieu de « Baisse » au-dessus d'« Avec baisse » ; pastilles tombées **sous** le
panneau ; « 40 000€ » sans espace insécable ; « Boîte connu » au lieu de
« connue » ; barre du mobile flottant au-dessus d'un contrôle tronqué (fondu
ajouté) ; marque/modèle absents de la feuille mobile.

## Pas touché

`api/`, `shared/`, `extension/`, `crawler/`, `scripts/`, les `.html` de la
racine, `docs/` hors les trois captures nommées par la tâche. HEAD de départ
`bcc37cf`, non modifié en place, rien poussé. Aucun sous-agent dispatché.

**À signaler** : l'arbre de travail portait déjà, au démarrage de cet agent, une
cinquantaine de modifications dans `extension/` (dont des suppressions
indexées). Elles ne viennent pas de ce lot et n'ont **pas** été commitées : le
commit est fait chemin par chemin sur `web/`, les trois captures et ce rapport.

## 2026-09-20 — Correctif revue : fourchette inversée, départements nommés

### 1. La fourchette inversée coupait tout, pas juste elle-même

`js/market.js` gardait `rafraichirFacettes` derrière `anyBadRange(filters) ?
null : demanderFacettes(…)` : une adresse partagée portant une marque valide
**et** une fourchette à l'envers (`price_min=30000&price_max=10000`) ne
faisait *aucun* appel à `/v1/market/facets` au premier affichage. Marque et
modèle retombaient sur « Toutes » / « Tous » (la liste qui les nomme n'était
jamais arrivée), et carburant, boîte, lieu restaient vides sans un mot
d'explication.

Correctif : `withoutBadRanges` (`js/market-facets.js`) écarte **seule** la
fourchette fautive — les deux bornes repassent à `null` avant la requête —
sans jamais toucher au reste des filtres. `market.js` appelle désormais
`demanderFacettes` sans condition ; l'erreur reste affichée sous le champ
via `anyBadRange`, qui ne sert plus qu'à ça. `js/market-list.js` n'était pas
concerné : il n'appelait déjà rien vers `/v1/market` sur une fourchette
cassée (décision prise au lot 4), ce qui satisfait déjà « la fourchette n'est
pas envoyée » — non touché.

Test qui rougit sans le correctif (`tests/market-facets.test.mjs`, « une
fourchette à l'envers est seule écartée, pas le reste des filtres ») : marque
et modèle valides + fourchette inversée → `withoutBadRanges` ne doit garder
que les deux premiers dans la requête ; cassé en ligne et restauré, preuve
faite (voir aussi les quatre autres lignes ci-dessous, cassées une à une).

### 2. Les départements par leur nom

Le contrat sert désormais `departments: [{key, label, count}]`. `js/market-
panel.js` (liste) et `js/market-chips.js` (pastille) affichent « 92 ·
Hauts-de-Seine », repli sur le code seul si `label` manque —
`departmentLabel` (`js/market-facets.js`) porte cette règle une fois, lue par
les deux. Fixtures démo mises à jour : `js/fixtures-facets.js` porte les huit
noms de département (`DEPARTMENT_LABELS`) que ses fixtures couvrent.

### 3. Les marques et les régions ne s'enferment plus

Vérifié : rien côté `web/` ne suppose qu'une facette se filtre elle-même —
`market-filters.js` et `market-panel.js` affichent les listes telles que la
facette les rend, sans logique d'exclusion à eux. L'exclusion vit entièrement
côté fixtures démo (`facetsOf`), au même endroit que côté API. `brands`
excluait déjà `brand` *et* `model` (lot 4). `regions`, en revanche,
n'excluait que `region` — un département choisi enfermait la liste des
régions dans la sienne, le même cul-de-sac que la marque sans le modèle.
Corrigé : `sans(['region', 'department'])`.

### Tests

`node --test web/tests/*.test.mjs` : **111 verts** (106 avant ce correctif).
Cinq tests neufs, chacun nommant la ligne de production qui le fait rougir,
cassée puis restaurée : `withoutBadRanges` (market-facets.test.mjs),
`departmentLabel` (market-facets.test.mjs), le repli de `listChips` sur le
département (market-chips.test.mjs), le libellé de département dans
`facetsOf` et son exclusion `region`/`department` (fixtures-facets.test.mjs).
Aucun ne lit l'horloge réelle.

### Pas touché

`api/`, `extension/`, `crawler/`, `scripts/`, `docs/` hors ce rapport. HEAD de
départ `77bac90`. Aucun sous-agent dispatché. L'arbre portait encore, à
l'ouverture de cet agent, des modifications non commitées dans `extension/`
(pas de ce lot) — signalé, non touché.
