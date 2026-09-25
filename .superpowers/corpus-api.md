# Lot Corpus — côté API, rapport de fin de lot

Périmètre : `api/` uniquement — points 1 (quota), 2 (revisite rapide),
3 (journal des écarts), 5 (réserve) du brief, et la route seule du point 4
(`GET /v1/divergences` ; `/app/ecarts.html` et les cinq fichiers `web/`
restent à faire). Plan : `.superpowers/corpus-plan.md` (commit `c63918b`).

## Statut

Fait, tests verts, migration 016 appliquée sur `adscope`, service redémarré.
Compteurs de départ : **API 943**. À la livraison : **API 996** (+53).
`web` (186) et `extension` (438) inchangés — hors périmètre de ce lot.

Vérifié en lecture seule avant tout : `select label, automated from
licenses;` → la licence `crawler` porte `automated = true`, la licence
`alexis` ne le porte pas (et ne doit jamais le porter — voir Réserves). Le
lot n'est donc pas inerte.

## Ce qui a été livré, lot par lot (six commits)

1. **Migration 016** (`corpus_models.py`, `migration_sql_corpus.py`) : deux
   tables neuves, `rechecks` (le marqueur « à vérifier », clé primaire
   `listing_id, field, license_key_hash`) et `divergences` (le journal),
   aucune colonne touchée sur `listings`. `migration_registry.py` était à
   154 lignes ; les migrations 001 à 012 — qui ne changent plus jamais —
   sortent dans `migration_registry_early.py`.
2. **Quota** (`quota.py`, `config.observations_per_day`) : `ADSCOPE_
   OBSERVATIONS_PER_DAY` (défaut 2000), lu sur `usage_days` — aucun
   compteur neuf. `429` avant toute écriture pour une clé non automated
   au-delà du plafond ; les licences automated n'en ont pas. `ordered()`
   part de `main.py` vers `observations.py`, qui tenait pile 150 lignes.
3. **Marqueur et file** (`recheck.py`, `revisit.py`) : `recheck.mark` pose
   une réclamation par critère (annonce neuve, prix, date de publication,
   réactualisation, véhicule en accompagnement) sur les sites que la file
   sait revisiter (`revisit.ADDRESS`) — jamais ailleurs, sinon le marqueur
   ne se lèverait jamais. `revisit.due()` sert les fiches marquées en
   premier (`rang 0`), sans `QUIET` ni bail, et les départage par
   `last_revisit_at.nullsfirst()` pour qu'une fiche marquée jamais ouverte
   ne tienne pas la tête indéfiniment.
4. **Journal** (`divergence.py`) : `on_observation` est l'unique aiguillage
   automated/humain, appelé une seule fois dans `observations.record`, juste
   après `_locked` — avant toute écriture, sinon la déclaration du marchand
   serait perdue. Une licence automated recoupe (`_verify`) : prix à plus de
   5 % sans relevé intermédiaire qui l'explique (`is_distinct_from`, pas
   `!=` — la moitié de l'historique porte une clé nulle), date de
   publication au jour près, marque/modèle/année ou km à plus de 1 000,
   absence contredite, réactualisation absente. Le robot n'est jamais jugé.
   `on_absence` tranche le seul cas restant (annonce que le robot ne
   retrouve jamais) sur le verdict `recorded` de `disappearance`, pas sur la
   première constatation.
5. **Route** (`divergences.py`) : `GET /v1/divergences?days=30`, derrière
   `require_operator`. Une entrée par clé, classée par nombre d'écarts puis
   délai le plus court ; entête agrégée exacte même plafonnée (`MAX_ROWS =
   500`) ; `pending` (marqueurs en attente) pour que la page (à écrire)
   puisse dire si le crawler tourne quand le journal est vide.
6. **Réserve, désactivée** (`alert_rules.py`, `config.alerts_confirmed_only`) :
   `ADSCOPE_ALERTS_CONFIRMED_ONLY` (défaut faux) retient une baisse du
   digest tant qu'un relevé automated ne l'a pas suivie — une baisse vue par
   le robot lui-même se confirme d'elle-même (`observed_at >= …`, pas `>`).

Fichiers neufs : `corpus_models.py` (71 l.), `migration_sql_corpus.py`
(38 l.), `migration_registry_early.py` (142 l.), `quota.py` (34 l.),
`recheck.py` (88 l.), `divergence.py` (141 l.), `divergences.py` (99 l.).
Aucun fichier source au-delà de 150 lignes (`observations.py` et `usage.py`
à 150 pile).

## Chaque test neuf nommé, sa ligne cassée puis restaurée

Vérifié en direct pendant le lot (pas seulement à l'écriture) : la garde du
quota et son appel dans la route, `(_marked(), 0)` dans `_rank`, le `or_`
qui passe outre `QUIET`/bail, `last_revisit_at.nullsfirst()`, la garde
`ADDRESS` de `recheck.mark`, l'appel `divergence.on_observation(...)` dans
`observations.record` (prouvé par un test d'intégration bout en bout,
`test_recording_a_price_change_marks_the_listing`, parce qu'aucun test
unitaire de `recheck`/`divergence` n'exerçait cette ligne-là), l'aiguillage
`license_.automated` dans `on_observation`, le hook `divergence.on_absence`
dans `disappearance.observe`, `abs(delta) > NOTABLE_PCT`, le `pending` et le
tri des clés de la route, la condition `alerts_confirmed_only()` et le
`>=`/`>` d'`alert_rules`. Chaque cassure a fait rougir exactement le test
attendu, sans effet de bord sur le reste de la suite.

## Déploiement

`pg_dump -Fc adscope > ~/adscope-backups/adscope-20260925-205038-avant-016-
corpus.dump`, puis migration appliquée (`migrate(engine)` → `['016_corpus']`,
rejouée → `[]`, idempotente), puis `launchctl kickstart -k gui/$UID/
fr.adscope.api`. Les deux tables sont vides après migration (aucune écriture
rétroactive — les 570 changements de prix déjà en base ne sont jamais
jugés). `curl /v1/divergences` sans en-tête → `401 {"detail": "licence
invalide"}`. Log (`~/Library/Logs/adscope-api.log`) sans nouvelle trace après
le redémarrage — la seule entrée qui suit est le garde-fou de flotte
existant (`écriture suspendue: …`), sans lien avec ce lot.

## Décisions prises, à confirmer ou renverser

- **Le critère véhicule (f) est implémenté en accompagnement seul** (§3.1
  du plan) : un marchand qui ne réécrit que marque/modèle/année/km, sans
  toucher au prix ni aux dates, n'est ni marqué ni journalisé. C'est
  l'empoisonnement le moins visible de la mesure ; le corriger (comparer
  `FINGERPRINT_FIELDS` de l'observation à ceux du `listing` et marquer si
  l'un diffère) tient en trois lignes de `recheck.mark`, non faites ici pour
  rester au périmètre du brief tel qu'écrit.
- **La comparaison véhicule de `divergence._vehicle`** lit `listing.brand/
  model/year/mileage` directement plutôt que de reparcourir la valeur
  stockée dans `Recheck.merchant_value` (une chaîne composée, tronquée à 64
  caractères, impropre à une comparaison structurée) : l'accroche du hook,
  juste après `_locked` et avant l'écrasement des champs véhicule par
  `record`, garantit que `listing.X` porte encore la dernière déclaration du
  marchand au moment où le robot passe.

## Réserves, hors lot, signalées et non corrigées ici

1. **`disappearance.observe` écrit une disparition irréversible sans exiger
   le robot** (`disappearance.py:132` avant ce lot) : deux constatations
   `absent` à six heures d'écart, venues de n'importe quelle clé de
   marchand, posent `disappeared_at`. Un marchand peut faire disparaître les
   annonces de ses concurrents. La correction (`license_ is None or
   license_.automated`) change le comportement d'une route existante et de
   `test_disappearance.py` ; elle mérite un lot à elle seule, avant
   l'ouverture large — c'est la faille la plus grave que la lecture ait
   trouvée.
2. **Pas de bouton « suspendre »** : `License.active` existe mais rien ne le
   bascule par HTTP aujourd'hui. Une route correcte (`POST /v1/licenses/
   {key_hash}/suspend`, CSRF, confirmation côté page) coûte une trentaine de
   lignes et une porte d'écriture neuve sur les licences — un lot à part, en
   même temps que la correction du point 1.
3. **Ne jamais marquer la clé d'Alexis `automated`** pour faire taire le
   bruit de fond qu'elle produira les premières semaines (une clé humaine
   ordinaire, elle sera en tête de la future page) : cela lui ouvrirait
   `require_operator` par Bearer et lui retirerait son quota. Son statut
   d'opérateur passe par le cookie et le compte, jamais par la licence.
4. **Le quota peut être dépassé de jusqu'à cent observations par lot** (le
   garde lit avant le lot), et deux lots simultanés de la même clé ne
   s'attendent pas. Accepté : c'est une digue, pas une comptabilité.
5. **`rechecks` ne grossit que pour les sites de `revisit.ADDRESS`** (`lbc`
   seul aujourd'hui) : La Centrale reste hors de la file de revisite comme
   avant ce lot, et ses observations ne posent donc jamais de marqueur — un
   marqueur qu'un site ne sait jamais lever serait une fuite.

## Reste à faire (hors périmètre de cette livraison)

`/app/ecarts.html` et les cinq fichiers `web/` (`ecarts.js`, `ecarts-
page.js`, `api-ecarts.js`, `fixtures-ecarts.js`, l'ajout à `views.css`), la
capture `docs/site-v0-ecarts.png` — plan détaillé en `.superpowers/corpus-
plan.md` §5, rapport à suivre : `.superpowers/corpus-web.md`.
