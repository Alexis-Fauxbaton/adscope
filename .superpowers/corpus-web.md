# Lot Corpus — côté web, rapport de fin de lot

Périmètre : point 4 du brief, partie `web/` seule — `/app/ecarts.html`,
`GET /v1/divergences` déjà livré côté API (`.superpowers/corpus-api.md`,
vérifié ici en lecture seule, non modifié). Plan : `.superpowers/corpus-plan.md`
§5 (commit `c63918b`).

## Statut

Fait, tests verts. Compteur de départ : `web` **186**. À la livraison :
`web` **196** (+10, plan en attendait ~7 — trois tests de plus pour
`valueLabel` et `parseDays`, deux fonctions écrites dans ce lot et pas
listées dans le plan initial). `api` (943) et `extension` (438) inchangés —
hors périmètre.

## Le parcours, écrit avant le code

Celui du plan (§5.1), rejoué sur la capture avant de la committer : Alexis
ouvre la page, lit la phrase du haut en premier (« 8 écarts sur 30 jours,
3 clés concernées, dont 2 clés avec 3 écarts ou plus »), descend à la
première carte — la clé la plus fautive, `count` et `min_delay_seconds`
côte à côte —, lit trois ou quatre lignes (`prix · 9 900 € → 12 900 € ·
+30,3 % · 2 h · 16 sept.`), clique le lien sortant vers leboncoin puis celui
vers l'historique adscope. Il ne suspend rien depuis cette page.

**Écart avec le plan, trouvé à la capture, corrigé avant livraison** : la
phrase du haut portait la classe `.vue-s` (gris, 14,5 px) — la même que
n'importe quel sous-titre du site. Relue sur la première capture, elle ne se
distinguait pas assez pour se lire « en gros » comme le parcours l'exige.
Ajout d'une classe à elle (`.ecart-resume`, 17 px, `var(--encre)`) au lieu de
`.fait` (27 px) — une phrase n'est pas un seul chiffre, et `.fait` à cette
longueur cassait mal sur mobile. Un état vide qui rassure : la même carte,
la même phrase, le fait de contrôle en dessous (« N annonces attendent le
passage du robot », `pending` de la route) — vérifié en `?demo=1&days=1`,
capture jetée après relecture (pas committée : `docs/` ne reçoit que la
capture nommée).

## Ce qui a été livré

| Fichier | Rôle | Lignes |
|---|---|---|
| `web/ecarts.html` | coquille, copie de `balayage.html` | 15 |
| `web/js/ecarts.js` | pur, sans DOM : `parseDays`, `fieldLabel`, `delayLabel`, `valueLabel`, `deltaLabel`, `summarize`, `sortLicenses` | 92 |
| `web/js/ecarts-page.js` | le rendu, états `no-license` / `loading` / `data` (pile de cartes ou vide) / `error` | 107 |
| `web/js/api-ecarts.js` | `divergences(days)` → `request('/v1/divergences', …)`, fixtures en `?demo=1` | 11 |
| `web/js/fixtures-ecarts.js` | trois clés, huit écarts, les six `field`, un état vide en `?demo=1&days=1` | 84 |
| `web/css/views.css` | section « écarts » (+24 lignes, 95 → 119) | — |

Aucun fichier au-delà de 150 lignes. Réemploi strict du registre consumer
(`.vue`, `.carte`, `.pile`, `.vide`, `.fait`, `.fait-2`, `.lien-sortant`) ;
deux tokens neufs de balisage seulement, **aucune couleur neuve** : `.ecart-pct`
reprend `--orange`/`--orange-pale`, posés dans `base.css` depuis le début du
registre mais jamais utilisés jusqu'ici — le seul ton d'alerte déjà dans la
palette, pas une teinte inventée pour ce lot. `.pastille-suspendue` reprend
`--gris-pale`/`--faible`. Aucun rayon neuf (`999px` partout, comme `.baisse`).

`sortLicenses` reclasse côté client par sécurité (le contrat garantit déjà
l'ordre `count` décroissant → `min_delay_seconds` croissant → `license_key_hash`,
mais les fixtures de démo n'ont pas à le respecter elles-mêmes) ; `parseDays`
suit la convention de `parseLimit`/`parsePages` (bornée 1–365 comme la route,
défaut 30 sur toute entrée absurde).

## Chaque test neuf nommé, sa ligne cassée puis restaurée

Les dix tests de `web/tests/ecarts.test.mjs` ont chacun été prouvés en direct
pendant ce lot (pas seulement à l'écriture) : la branche minutes de
`delayLabel` (`seconds < HOUR`), sa branche heures (`seconds < 2 * DAY`, avec
un cas à 36 h pour couvrir l'intervalle), son repli jours ; la clé de tri de
`sortLicenses` ; la branche `repeatKeys > 0` de `summarize` ; le
`if (pct == null) return null` de `deltaLabel` ; le dictionnaire
`FIELD_LABELS` de `fieldLabel` ; la branche prix de `valueLabel` (comparée à
`format.money`, pas à une chaîne à espaces fins tapée à la main — piège
trouvé en écrivant le test : `money()` pose une espace fine insécable,
invisible à la relecture, différente de l'espace ordinaire) ; les deux
gardes de `parseDays` (`raw < 1`, puis `Math.min(…, MAX_DAYS)`). Chaque
cassure a fait rougir exactement le test attendu et rien d'autre, restaurée
ensuite — vérifié par une suite complète verte après coup.

## Décisions prises

- **`ecarts-page.js` ne distingue pas 401 de 403.** `api.request` lève la
  même `AuthError` dans les deux cas (comme pour tout le reste du site) ;
  une session valide mais pas opérateur voit donc « Connectez-vous d'abord
  sur /app » plutôt qu'un message dédié « réservé à l'opérateur ». Aucune
  page du dépôt ne fait mieux aujourd'hui (`revisits-page.js`,
  `balayage-page.js` ont le même comportement) ; page non liée dans la
  navigation, seul Alexis en connaît l'URL.
- **`recheck`/`divergence` marquent uniquement `revisit.ADDRESS` (`lbc`
  seul)** — décision du lot API, §2.4 du plan. Les fixtures de démo suivent
  la même règle (`site: 'lbc'` partout) plutôt que de montrer une forme que
  la vraie route ne produira jamais.
- **`parseDays`/`valueLabel`/`deltaLabel` ne figuraient pas dans la liste de
  fonctions du plan** (§5.2 ne citait que `summarize`, `sortLicenses`,
  `delayLabel`, `fieldLabel`, `valueLabel`) — `parseDays` manquait tout
  court (la page a besoin de borner `?days=`, comme ses deux sœurs) et
  `deltaLabel` a été séparé de `valueLabel` (deux champs jamais formatés en
  pourcentage sur les mêmes règles). Les deux sont testés comme le reste.

## Réserves, hors lot, signalées et non corrigées ici

1. **Pas de bouton « suspendre »** — tranché au plan (§5.3) : aucune route
   HTTP n'existe pour basculer `License.active` aujourd'hui, l'ajouter
   proprement dépasse dix lignes. La page affiche seulement `active: false`
   en pastille grise.
2. **La classe `.ecart-resume` répète presque `.vue-s`** (même famille,
   poids et couleur différents seulement) : si un troisième « en gros »
   apparaît ailleurs sur le site, les fondre en une variante commune plutôt
   que d'en écrire une troisième.
3. **`carteCle` compose trois blocs (`label`+`email`, pastille, compte) sur
   une seule ligne flexible.** `License.label` est borné à 64 caractères
   côté API (`license_models.py:23`, `String(64)`) — un `email` de compte ne
   l'est pas au même endroit, et c'est lui qui court le plus long dans les
   fixtures. Le `flex-wrap` mobile absorbe le cas observé ; non vérifié
   au-delà de 64+longueur d'un email réaliste.

## Reste à faire

Rien côté `web/` pour le point 4 du brief. Hors périmètre de ce lot (roadmap,
notes du plan) : la route de suspension et la correction de
`disappearance.observe` (§3.2/§5.3 du plan côté API), le critère véhicule en
déclencheur seul (§3.1), et le balayage La Centrale qui ouvrirait `rechecks`
à un second site.
