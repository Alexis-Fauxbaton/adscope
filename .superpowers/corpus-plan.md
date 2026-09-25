# Lot Corpus — plan d'architecture

Écrit le 2026-09-25, branche `feat/api`. Aucun code écrit ici, aucune page visitée,
aucune écriture en base, aucune migration appliquée. Les lignes citées sont celles
du dépôt à cette date.

Le lot tient la décision de `docs/roadmap.md` § « Lot Corpus » : **on ne bloque rien
à l'entrée, on recoupe après coup par le robot, et on attribue.** Tout le reste en
découle — le quota n'est qu'une digue contre l'inondation, la revisite rapide n'est
qu'un ordre de priorité, le journal ne juge pas, et la page opérateur classe.

---

## 0. Ce que la base sait déjà, et ce qui manque

| Fait | Où | Suffit-il ? |
|---|---|---|
| Qui a émis un relevé de prix | `models.PricePoint.license_key_hash` (124) | Oui |
| Robot ou humain | `license_models.License.automated` (35) | Oui |
| Combien d'observations par licence et par jour UTC | `usage_models.UsageDay` (17), clé `(license_key_hash, day, listing_id)`, écrite par `usage.bump` (25) | **Oui — pas de compteur à créer** |
| Ce qu'une observation a *déclaré* | nulle part : `observations.record` écrase la colonne (103-106) et `publication.apply` ne garde que le `min`/`max` (15-25) | **Non — c'est le trou du lot** |
| Quelle annonce est à vérifier | nulle part | **Non** |

**Le piège central du schéma.** On croit pouvoir recalculer la valeur du marchand au
passage du robot : c'est faux pour quatre critères sur six.
`publication.apply:15` ne recule jamais `published_at` — une date **postérieure**
déclarée par un marchand est perdue à l'instant ; une date antérieure, au contraire,
**écrase** celle qu'on savait, et la valeur d'origine est perdue elle aussi.
`publication.apply:21` prend le `max` de `bumped_at` : la réactualisation déclarée
devient la vérité de la base, et le robot qui ne la voit pas n'a plus rien à quoi la
comparer. `observations.record:103-106` écrase marque/modèle/année/km. Donc **la
déclaration du marchand doit être copiée quelque part au moment où elle arrive**, avant
que `record` n'écrive. C'est ce que fait la table `rechecks` ci-dessous, et c'est la
seule raison de son existence.

**`PricePoint.source` ne sert à rien ici** : `main.py:72` passe `source="user"` pour
tous les émetteurs, robot compris. Le seul discriminant est
`License.automated` via `license_key_hash`. À vérifier en lecture seule avant de
livrer : `select label, automated from licenses where automated;` — si la licence du
crawler n'est pas marquée, le lot entier est muet et aucun test ne le dit.

**Mesure du 2026-09-25, rappelée ici parce qu'elle fixe le ton** : 570 changements de
prix, 108 hausses (19 %), 74 hausses de plus de 5 %, 72 écarts de plus de 5 % en moins
de 48 h — tous du robot ou d'Alexis, donc honnêtes. Les écarts rapides honnêtes
existent : le journal **note** l'ampleur et le délai, il ne conclut pas. Aucun seuil
dur dans le code hors le 5 % qui définit « écart notable » (et la tolérance de
1 000 km, que la roadmap posait déjà).

---

## 1. Schéma — migration 016

Deux tables neuves, **aucune colonne ajoutée à `listings`**, aucun `UPDATE`.

### 1.1 `rechecks` — le marqueur « à vérifier », et ce qu'il porte

```sql
CREATE TABLE IF NOT EXISTS rechecks (
  listing_id       integer     NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  field            varchar(16) NOT NULL,
  license_key_hash varchar(64) NOT NULL REFERENCES licenses (key_hash) ON DELETE CASCADE,
  merchant_value   varchar(64),
  observed_at      timestamptz NOT NULL,
  PRIMARY KEY (listing_id, field, license_key_hash)
)
```

**Pourquoi une table et non une colonne sur `listings`.** Le brief disait
« colonne, migration 016 » ; je tranche pour une table, et voici les trois raisons,
qu'Alexis peut renverser :

1. Une même observation peut réclamer plusieurs vérifications (prix **et** date **et**
   véhicule). Une colonne ne porte qu'une réclamation ; le journal en demande une ligne
   par critère (§3).
2. Le marqueur doit porter la **valeur déclarée** (voir le piège du §0), l'**empreinte de
   la clé** et l'**horodatage du marchand** — soit quatre colonnes sur `listings`, qui est
   à 128 lignes dans `models.py` et ne les tient pas sous la limite de 150.
3. La clé primaire `(listing_id, field, license_key_hash)` fait exactement ce qu'il
   faut : deux marchands qui réclament le même champ sont **tous deux** jugés, et c'est la
   règle du « relevé intermédiaire » (§3.3) qui absout le premier, non l'écrasement.

Le coût : `due()` fait un `EXISTS` au lieu de lire une colonne — le préfixe `listing_id`
de la clé primaire le sert, pas d'index de plus à poser.

La table est **transitoire** : une observation automated la vide pour l'annonce (§3.6).
Sa taille au repos est le nombre d'annonces que des humains ont touchées depuis le
dernier passage du robot — quelques centaines.

### 1.2 `divergences` — le journal

```sql
CREATE TABLE IF NOT EXISTS divergences (
  id               serial      PRIMARY KEY,
  listing_id       integer     NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  license_key_hash varchar(64) REFERENCES licenses (key_hash) ON DELETE SET NULL,
  field            varchar(16) NOT NULL,
  merchant_value   varchar(64),
  robot_value      varchar(64),
  observed_at      timestamptz NOT NULL,
  verified_at      timestamptz NOT NULL,
  delay_seconds    integer     NOT NULL,
  delta_pct        numeric(6,2)
)
CREATE INDEX IF NOT EXISTS ix_divergences_license
  ON divergences (license_key_hash, verified_at)
CREATE INDEX IF NOT EXISTS ix_divergences_listing ON divergences (listing_id)
```

- `field` : `price | published | vehicle | absence | bump | unknown_listing`.
- `merchant_value` / `robot_value` : du texte, parce que les six critères ne partagent
  aucun type (un prix, une date, « absente », « Peugeot 208 2013 · 120 000 km »). `NULL`
  quand le robot n'a rien vu.
- `delay_seconds` plutôt que le `delay` du brief : un `integer` se trie et se rend sans
  recalcul, et c'est la colonne sur laquelle la page classe. Écrit par le code
  (`int((verified_at - observed_at).total_seconds())`), pas une colonne générée —
  `test_migrations.py` compare le schéma des migrations à celui de `create_all`, et une
  colonne générée les fait diverger pour rien.
- `ON DELETE SET NULL` sur la licence, comme `price_points` (`models.py:125`) : supprimer
  un compte ne doit pas effacer la preuve qu'il a produite. La page groupe alors sous
  « clé supprimée ».
- `ON DELETE CASCADE` sur l'annonce, comme `follows` : une annonce effacée n'a plus
  d'écart à montrer.

### 1.3 Les fichiers de la migration

`api/adscope_api/migration_registry.py` est **déjà à 154 lignes**, au-delà de la limite.
Le lot ne peut pas l'allonger de trois lignes de plus. Manœuvre :

1. Nouveau `api/adscope_api/migration_registry_early.py` (~75 lignes) : les migrations
   **001 à 008** telles quelles, avec leurs commentaires — ce sont celles qui ne changent
   plus jamais.
2. `migration_registry.py` devient `MIGRATIONS = EARLY + (009…016)` et retombe à ~85
   lignes, avec de la place pour plusieurs lots.
3. Nouveau `api/adscope_api/migration_sql_corpus.py` (~30 lignes) : `CORPUS_TABLES`, les
   deux `CREATE TABLE` et les deux `CREATE INDEX` ci-dessus, dans la forme de
   `migration_sql_alerts.py`.
4. L'entrée du registre :
   ```python
   # Le lot Corpus : deux tables neuves, rien des annonces touché.
   ("016_corpus", CORPUS_TABLES),
   ```
5. `api/adscope_api/corpus_models.py` (~55 lignes) : `Recheck` et `Divergence`, réexportés
   par `models.py` (une ligne d'import, comme `usage_models` à `models.py:14`).
6. `api/tests/test_migrations.py`, `to_old_shape` : deux lignes de plus, en tête de la
   fonction (elle défait dans l'ordre inverse) —
   `DROP TABLE IF EXISTS divergences` puis `DROP TABLE IF EXISTS rechecks`.

**Avant d'appliquer** : `pg_dump adscope > ~/adscope-backups/adscope-2026-09-25.sql`,
puis suite verte, puis `launchctl kickstart -k gui/$UID/fr.adscope.api`. La 016
n'est destructive en rien : deux `CREATE TABLE IF NOT EXISTS`, aucun `ALTER`, aucun
`UPDATE`.

---

## 2. Le flux d'une observation, ligne par ligne

### 2.1 Où chaque règle s'accroche

```
POST /v1/observations                         main.py:68
  ├─ quota.guard(session, license_, now)      ← RÈGLE 1, ligne à ajouter en tête du corps
  └─ pour chaque item : observations.record   main.py:72
       ├─ _locked(session, observation, now)          observations.py:82
       ├─ divergence.on_observation(...)              ← RÈGLES 2 et 3, ligne à ajouter ICI
       │    ├─ license_ automated  → _verify()  : écrit les écarts, lève le marqueur
       │    └─ sinon               → recheck.mark() : pose le marqueur
       ├─ point de prix                               observations.py:87-101
       ├─ champs véhicule (écrasent)                  observations.py:103-106
       ├─ last_seen / observations / absences         observations.py:129-131
       ├─ publication.apply (min/max)                 observations.py:133
       └─ usage.bump                                  observations.py:138

POST /v1/disappearances                       main.py:144
  └─ disappearance.observe(..., license_)      disappearance.py:103
       ├─ evidence == "absent" et licence humaine → recheck.mark_absence()   ← RÈGLE 2 (d)
       └─ verdict == "recorded" et licence automated → divergence.on_absence() ← RÈGLE 3 (f)

POST /v1/revisits                             main.py:136
  └─ revisit.due                               revisit.py:100
       ├─ where : or_(marqué, silence ET bail)  ← RÈGLE 2, remplace revisit.py:115-116
       └─ order_by : _rank avec le rang 0 « marqué » ← RÈGLE 2, revisit.py:90-97

digest du matin                               alert_rules.drops_for:58
  └─ condition « dernier relevé automated »    ← RÈGLE 5, désactivée par défaut
```

**Pourquoi l'accroche est juste après `_locked` et pas ailleurs.** `_locked`
(`observations.py:48`) rend l'annonce verrouillée pour toute la transaction : c'est le
premier instant où on tient à la fois la ligne en base **et** l'observation, et le dernier
avant que `record` n'écrase quoi que ce soit. Poser le marquage après le point de prix
mesurerait le prix contre lui-même ; le poser après les champs véhicule comparerait la
déclaration du marchand à elle-même.

**Un seul appel, un seul aiguillage.** `observations.record` est à 140 lignes : il gagne
trois lignes (deux de commentaire, une d'appel), pas deux branches. L'aiguillage vit dans
`divergence.on_observation`, qui décide sur `license_.automated`.

**`license_ is None` ne fait rien.** C'est le cas des appels directs (tests, scripts) :
ni marquage ni vérification. Cela laisse intacts les tests existants qui appellent
`record(..., source="crawler")` sans licence — `test_revisit.py:104`,
`test_disappearance.py`.

### 2.2 Les deux modules neufs, et la règle de nommage

| Fichier | Rôle | Importe | Taille visée |
|---|---|---|---|
| `recheck.py` | pose et lève le marqueur ; `mark`, `mark_absence`, `clear`, `marked()` | `corpus_models`, `revisit.ADDRESS` | ~85 l. |
| `divergence.py` | le journal : `on_observation` (aiguillage), `on_absence`, les six critères | `corpus_models`, `recheck`, `models` | ~110 l. |
| `divergences.py` | **le routeur** `GET /v1/divergences` et ses schémas | `divergence`/`corpus_models`, `operator` | ~75 l. |

**Singulier = la mécanique, pluriel = la route** — la même convention que
`follow_models.py` / `follows.py`. À dire dans les deux en-têtes de fichier, parce que
`divergence.py` et `divergences.py` côte à côte sont un piège de relecture.

Le sens des imports est **`revisit` → `corpus_models`** et **`recheck` → `revisit`** :
`revisit` n'a besoin que du modèle pour son `EXISTS`, `recheck` a besoin de
`revisit.ADDRESS` (§2.4). Pas de cycle. `recheck` n'importe jamais `divergence`.

### 2.3 Comment « à vérifier » passe outre `QUIET` et le bail sans casser `due()`

Aujourd'hui (`revisit.py:110-121`) :

```python
.where(
    Listing.site == site,
    Listing.disappeared_at.is_(None),
    Listing.last_seen <= now - QUIET,
    or_(Listing.next_detail_crawl.is_(None), Listing.next_detail_crawl <= now),
)
.order_by(_rank(now), Listing.last_seen)
```

Demain :

```python
# Le marqueur « à vérifier » : ce que `recheck` a posé et qu'aucun relevé du
# robot n'a encore levé. Il passe outre le silence ET le bail — un marchand
# vient de mettre `last_seen` à maintenant, donc QUIET écarterait précisément
# l'annonce qu'il faut rouvrir.
def _marked():
    return select(1).where(Recheck.listing_id == Listing.id).exists()

.where(
    Listing.site == site,
    Listing.disappeared_at.is_(None),
    or_(
        _marked(),
        and_(Listing.last_seen <= now - QUIET,
             or_(Listing.next_detail_crawl.is_(None), Listing.next_detail_crawl <= now)),
    ),
)
.order_by(_rank(now), Listing.last_revisit_at.nullsfirst(), Listing.last_seen)
```

et `_rank` gagne une première branche, les littéraux existants décalés d'un cran :

```python
return case(
    (_marked(), 0),          # à vérifier : le robot doit trancher, c'est tout
    (_wanted(), 1),
    (Listing.seller_type == "pro", case((Listing.published_at <= old, 2), else_=3)),
    (Listing.published_at <= old, 4),
    else_=5,
)
```

**Ce qui reste vrai, et pourquoi les onze tests de `test_revisit.py` restent verts.**

- `Listing.site == site` et `Listing.disappeared_at.is_(None)` sont **hors** du `or_` : le
  marqueur ne lève ni le site ni la disparition écrite.
  `test_lacentrale_never_enters_the_queue` (116) et
  `test_a_disappeared_listing_leaves_the_queue` (93) tiennent.
- Aucune annonce des tests existants ne porte de marqueur : le `or_` retombe sur sa
  branche droite, littéralement l'ancienne condition.
  `test_a_listing_seen_two_hours_ago_is_not_worth_a_page` (56),
  `test_a_listing_silent_longer_than_the_sweep_is_served` (61),
  `test_serving_a_listing_holds_it_back` (82),
  `test_a_followed_listing_still_owes_the_silence` (208) tiennent inchangés.
- Les tests d'ordre (`test_the_old_professional_comes_first` 69,
  `test_a_followed_listing_comes_before_the_old_professional` 153, 166, 180, 194)
  n'assertent **jamais la valeur** du rang, seulement l'ordre des `site_id` : le décalage
  des littéraux est invisible. Et leurs fiches ont toutes `last_revisit_at` à `NULL`,
  donc la nouvelle clé de tri intermédiaire est une égalité et le tri retombe sur
  `last_seen`.
- `ADDRESS.get(site)` (107) reste le premier refus : rien de marqué n'échappe au
  garde-fou d'adresse.

**La clé de tri ajoutée n'est pas décorative.** `due()` pose
`next_detail_crawl = now + SPACING` (131) sur une fiche servie, y compris marquée — mais
le marqueur passe outre le bail, donc une fiche marquée que le crawler **n'ouvre jamais**
(mur anti-bot, budget épuisé) reviendrait en tête à chaque appel et affamerait le reste
de la file. `last_revisit_at.nullsfirst()` la fait passer derrière les marquées jamais
servies. C'est un départage, pas un seuil : aucune constante n'apparaît.

### 2.4 Ce qu'on refuse de marquer

`revisit.ADDRESS` ne connaît que `lbc` (`revisit.py:73`) : une annonce La Centrale marquée
ne serait **jamais servie**, donc jamais recoupée, donc son marqueur ne se lèverait
jamais et `rechecks` grossirait sans fin. **`recheck.mark` ne marque que
`observation.site in revisit.ADDRESS`.** Le jour où La Centrale entre dans la file (lot à
part, roadmap : il faut une fiche supprimée sauvegardée par Alexis), le marquage suit
sans une ligne de plus.

---

## 3. Le journal des écarts, critère par critère

### 3.1 Ce que le marchand déclare — `recheck.mark`

Appelée pour une licence **non automated**, juste après `_locked`. Pose **une ligne par
réclamation** :

| # | Condition | `field` | `merchant_value` |
|---|---|---|---|
| a | `listing.observations == 0` (l'annonce vient d'être créée par `_locked`) | `unknown_listing` | `"créée"` |
| b | dernier `PricePoint` de l'annonce absent, ou `price` différent | `price` | `str(observation.price)` |
| c | `observation.published_at` et `listing.published_at` présents, `.date()` différents | `published` | `published_at.date().isoformat()` |
| d | (voir §3.2, vient de `/v1/disappearances`) | `absence` | `evidence` |
| e | `observation.bumped_at` présent et (`listing.bumped_at` nul ou antérieur) | `bump` | `bumped_at.isoformat()` |
| f | **au moins une ligne a été posée** et l'observation porte marque/modèle/année/km | `vehicle` | `"Peugeot 208 2013 · 120000 km"`, tronqué à 64 |

`ON CONFLICT (listing_id, field, license_key_hash) DO UPDATE` : une seconde observation
de la même clé sur le même champ remplace sa propre réclamation — c'est sa dernière
déclaration qui sera jugée.

**(f) est une décision, pas le brief.** Le brief ne liste pas le véhicule parmi les
déclencheurs de marquage (§2, a→e) mais le demande parmi les critères du journal (§3) :
sans une réclamation `vehicle` en base, le robot n'aurait rien à comparer. La ligne
`vehicle` est donc posée **en accompagnement** — jamais seule. Conséquence, à trancher
par Alexis : **un marchand qui ne réécrit que le véhicule, sans toucher au prix ni aux
dates, n'est jamais marqué et n'est jamais journalisé.** C'est précisément
l'empoisonnement le moins visible. Le corriger coûte trois lignes (comparer les
`FINGERPRINT_FIELDS` de l'observation à ceux du `listing` et marquer si l'un diffère) ;
je recommande de le faire dans ce lot, la mécanique est déjà là.

### 3.2 L'absence déclarée

`disappearance.observe` gagne un paramètre `license_=None` (la route `main.py:146`
nomme la dépendance qu'elle jette déjà, coût nul en lignes). Deux accroches :

- `evidence == WRITES` et licence **non automated** → `recheck.mark_absence()` pose la
  réclamation `absence`, quel que soit le verdict (`first`, `too_soon`, `already`). La
  fiche est marquée, le robot ira voir.
- licence **automated** et verdict `recorded` → `divergence.on_absence()` (§3.5).

**Trou existant, à signaler à Alexis, hors lot.** `observe` n'exige aucune licence
automated pour **écrire** : deux constatations `absent` à six heures d'écart, venues de
n'importe quelle clé de marchand, posent `disappeared_at`, que le module lui-même
qualifie d'irréversible (`disappearance.py:75-76`). Un marchand peut donc faire
disparaître les annonces de ses concurrents. La correction tient en une condition sur la
branche qui écrit (`disappearance.py:132`) : `license_ is None or license_.automated`.
Je ne la mets pas dans ce lot — elle change le comportement d'une route et de
`test_disappearance.py` —, mais c'est la faille la plus grave que la lecture ait trouvée
et elle vaut un lot à elle seule, avant l'ouverture large.

### 3.3 La vérification — `divergence._verify`

Appelée pour une licence **automated**, juste après `_locked`. Lit toutes les lignes
`rechecks` de l'annonce, écrit un `Divergence` par ligne qui se contredit, puis
**lève le marqueur en entier**.

Pour chaque réclamation, `verified_at = now`, `observed_at = claim.observed_at`,
`delay_seconds = int((now - claim.observed_at).total_seconds())`.

| `field` | Écrit une ligne si | `robot_value` | `delta_pct` |
|---|---|---|---|
| `price` | l'observation porte un prix, `abs(delta_pct) > NOTABLE_PCT` (5), et **aucun relevé intermédiaire** (§3.4) | `str(observation.price)` | `(robot − marchand) × 100 / marchand`, 2 décimales |
| `published` | l'observation porte `published_at` et `.date()` diffère de la réclamation | la date lue, ISO | `NULL` |
| `vehicle` | marque, modèle ou année différents (repliés casse et espaces), ou `abs(km robot − km marchand) > 1000` | le même libellé, pour le robot | `NULL` |
| `absence` | l'observation existe : le robot **voit** l'annonce | `"présente"` | `NULL` |
| `bump` | l'observation ne porte pas de `bumped_at`, ou un antérieur à celui déclaré | la valeur lue ou `"aucune"` | `NULL` |
| `unknown_listing` | jamais ici — le robot trouve l'annonce, donc le marchand disait vrai | — | — |

Un champ que l'observation du robot ne porte pas (prix nul, date absente) **ne produit
rien** : on ne juge pas sur un silence. Le marqueur est levé quand même — sinon la fiche
resterait au rang 0 pour toujours.

**Le kilométrage se compare dans les deux sens.** Ce n'est pas un compteur qui tourne :
c'est le nombre que l'annonce affiche, et il ne change que si le vendeur édite sa fiche.
Une tolérance symétrique de 1 000 km ne produit donc pas de bruit, et c'est celle que la
roadmap pose.

### 3.4 La requête du relevé intermédiaire

« Prix différent de plus de 5 % du relevé du marchand **sans relevé intermédiaire qui
l'explique** » : si quelqu'un d'autre a vu un prix entre la déclaration et le passage du
robot, le prix a bougé deux fois et la déclaration du marchand n'est plus la référence.

```python
def _explained(session, claim, now) -> bool:
    """Un autre relevé s'est glissé entre la déclaration et le passage du robot.

    Trois restrictions, chacune pour une raison :
    - `confirmation.is_(False)` : un point « inchangé ce jour-là »
      (`observations.py:99`) n'explique rien, il répète ;
    - `is_distinct_from(claim.license_key_hash)` : un marchand ne s'absout pas
      lui-même en postant un second prix après le premier ;
    - bornes strictes : la déclaration et le relevé du robot ne s'expliquent pas
      eux-mêmes.
    """
    return session.scalar(
        select(1).where(
            PricePoint.listing_id == claim.listing_id,
            PricePoint.observed_at > claim.observed_at,
            PricePoint.observed_at < now,
            PricePoint.confirmation.is_(False),
            PricePoint.license_key_hash.is_distinct_from(claim.license_key_hash),
        ).limit(1)
    ) is not None
```

`is_distinct_from` et non `!=` : la moitié des points de prix historiques portent
`license_key_hash = NULL` (`models.py:122-123`) et `NULL != 'abc'` rend `NULL`, donc
faux — le relevé du crawler d'avant la colonne n'expliquerait rien.

L'index `ix_price_points_license (license_key_hash, observed_at)` ne sert pas cette
requête ; `ix_price_points_listing_id` (posé par `index=True` sur la colonne,
`models.py:109`) la sert. Rien à ajouter.

### 3.5 L'annonce que le robot ne retrouve pas — `divergence.on_absence`

Appelée depuis `disappearance.observe`, licence automated, **verdict `recorded`**
seulement. C'est le moment où la base accepte la disparition : deux constatations
concordantes séparées de `CONFIRM_DELAY`, garde-fou de flotte passé
(`disappearance.py:125-133`). Écrire dès la première constatation serait plus rapide et
moins sûr — on réutilise la règle qui existe plutôt que d'en inventer une.

| Réclamation en attente | Ligne écrite |
|---|---|
| `unknown_listing` | oui : marchand `"créée"` → robot `"absente"` |
| `absence` | non : le marchand disait vrai |
| tout le reste | non : l'annonce est partie, il n'y a plus rien à comparer |

Puis `recheck.clear(listing_id)`.

### 3.6 Le robot n'est jamais jugé

Une seule ligne le garantit, et c'est l'aiguillage : **seule une licence non automated
pose une réclamation**. Deux relevés automated de suite ne trouvent donc jamais de
marqueur et ne peuvent pas produire de ligne. Le test correspondant (§6, n° 28) le prouve
en cassant cette ligne.

Corollaire : la `licenses.key_hash` du robot n'apparaît **nulle part** dans
`divergences`. La colonne `license_key_hash` désigne toujours le marchand.

---

## 4. Contrats

### 4.1 `POST /v1/observations` — quota (règle 1)

`quota.guard(session, license_, now)`, appelée une fois en tête de `post_observations`,
avant la boucle.

```python
# `usage_days` compte déjà les observations acceptées par licence et par jour UTC
# (`usage.bump`, une ligne par annonce) : le quota lit cette somme, il n'ouvre
# pas un second compteur. Les licences automated n'en ont pas — le robot est
# la source de presque tout.
def guard(session, license_, now) -> None:
    if license_ is None or license_.automated:
        return
    limit = observations_per_day()
    used = session.scalar(
        select(func.coalesce(func.sum(UsageDay.observations), 0))
        .where(UsageDay.license_key_hash == license_.key_hash,
               UsageDay.day == now.date())
    )
    if used >= limit:
        raise HTTPException(status_code=429, detail=(
            f"Quota journalier atteint : {limit} observations par clé et par jour. "
            "Il repart à minuit UTC."
        ))
```

- `429`, corps `{"detail": "…"}` — la forme de toutes les erreurs du service.
- `usage.compact` ne garde le grain fin que `RETENTION_DAYS - 1 = 2` jours
  (`usage.py:90`) : la journée en cours y est toujours, la lecture est donc exacte.
- **Dépassement accepté, à noter** : le garde lit avant le lot, un lot de cent peut
  franchir le plafond de 99 observations, et deux lots simultanés de la même clé ne
  s'attendent pas. C'est une digue contre l'inondation, pas une comptabilité — un verrou
  consultatif par clé coûterait une sérialisation à chaque lot pour rien.
- `config.observations_per_day()` : `int(os.environ.get("ADSCOPE_OBSERVATIONS_PER_DAY",
  "2000"))`, lu à chaque appel comme tout le reste de `config.py`.

### 4.2 `GET /v1/divergences` — `require_operator`

```
GET /v1/divergences?days=30            days : int, défaut 30, ge=1, le=365
```

```json
{
  "since": "2026-08-26T12:00:00Z",
  "total": 41,
  "keys": 3,
  "repeat_keys": 1,
  "truncated": false,
  "licenses": [
    {
      "license_key_hash": "9f2c…",
      "label": "Garage Leclerc",
      "email": "contact@example.test",
      "active": true,
      "count": 22,
      "min_delay_seconds": 5400,
      "items": [
        {
          "listing_id": 41822,
          "site": "lbc",
          "site_id": "3263259495",
          "label": "Peugeot 208 1.2 PureTech 100 Allure 2020",
          "source_url": "https://www.leboncoin.fr/ad/voitures/3263259495",
          "adscope_url": "/v1/listings/lbc/3263259495",
          "field": "price",
          "merchant_value": "9900",
          "robot_value": "12900",
          "delta_pct": 30.3,
          "delay_seconds": 7200,
          "observed_at": "2026-09-23T08:00:00Z",
          "verified_at": "2026-09-23T10:00:00Z"
        }
      ]
    }
  ]
}
```

- **Tri** : `licenses` par `count` décroissant, puis `min_delay_seconds` croissant, puis
  `license_key_hash` (pour que deux clés à égalité sortent toujours dans le même ordre).
  `items` par `verified_at` décroissant.
- **L'entête est exact même tronqué** : `total`, `keys` et `repeat_keys` viennent d'une
  requête d'agrégat (`count(*)`, `count(distinct …)`, et un `having count(*) >= 3`), les
  lignes d'une seconde requête plafonnée à `MAX_ROWS = 500` avec `truncated`. Sans cela,
  la phrase du haut mentirait le jour où elle compte le plus.
- `label` de l'annonce composé par `naming.label(...)` avec `taxonomy.inferred_model`,
  comme `alert_rules._item` (`alert_rules.py:34`) — une seule composition dans le dépôt.
- `source_url` par `urls.build(site, site_id)` (`urls.py:30`).
- **`adscope_url` pointe `/v1/listings/{site}/{site_id}`, et c'est une décision** : le
  site n'a pas de page par annonce (aucune route `web/` ne porte un `site_id`). Cette
  route-là s'ouvre au cookie d'Alexis et rend l'historique de prix — exactement ce qu'il
  faut pour trancher. Du JSON dans un onglet, pour un outil d'opérateur, vaut mieux
  qu'une page à inventer.
- `email` : celui du compte rattaché à la licence (`License.account_id` →
  `Account.email`), `null` pour une clé de machine. Le brief demande « le libellé de la
  licence **et** le compte » ; la route est derrière `require_operator`, Alexis seul la
  lit. Les fixtures de démo n'y mettent que des adresses `@example.test`.
- `repeat_keys` : les clés à **3 écarts ou plus**. Un chiffre d'affichage que le brief
  pose, pas une règle — aucune décision du code n'en dépend.
- `401` sans session, `403` avec une session qui n'est pas celle de l'opérateur, `403`
  avec un Bearer non automated : c'est `require_operator` tel quel (`operator.py:38`).

### 4.3 `ADSCOPE_ALERTS_CONFIRMED_ONLY` — en réserve, désactivé (règle 5)

`config.alerts_confirmed_only()` → `os.environ.get("ADSCOPE_ALERTS_CONFIRMED_ONLY", "") == "1"`.
Défaut faux, comme `docs_enabled`.

Une condition dans `alert_rules.drops_for`, sur la requête des baisses, appliquée
seulement si le drapeau est vrai :

```python
# Un relevé du robot postérieur à la baisse — ou la baisse elle-même vue par le
# robot. `license_key_hash` nul = le crawler d'avant la colonne, qui fait foi
# aussi (`models.PricePoint`).
confirmed = (
    select(1).select_from(PricePoint).outerjoin(License, License.key_hash == PricePoint.license_key_hash)
    .where(PricePoint.listing_id == windowed.c.listing_id,
           PricePoint.observed_at >= windowed.c.observed_at,
           or_(PricePoint.license_key_hash.is_(None), License.automated.is_(True)))
    .exists()
)
```

`observed_at >= observed_at` et non `>` : une baisse **constatée par le robot** est déjà
confirmée par elle-même et ne doit pas attendre un second passage. Rien d'autre ne change
— ni `new_for`, ni `alert_follows`, ni le digest.

---

## 5. Page opérateur `/app/ecarts.html`

### 5.1 Le parcours, écrit avant le code

**Qui.** Alexis, une fois par semaine ou après une alerte étrange. Il a trente secondes
et une seule question : *quelqu'un pourrit-il la base ?*

1. Il ouvre `/app/ecarts.html`. Sa session est dans le cookie ; la page demande `/v1/me`
   pour savoir si elle est là, comme `balayage-page.js:79`.
2. **Première ligne, en gros** : « 41 écarts sur 30 jours, 3 clés concernées, dont 1 avec
   3 écarts ou plus. » Si le nombre est zéro, il a sa réponse et il referme : c'est le
   cas le plus fréquent, et c'est celui que la page doit servir le mieux.
3. Sinon il descend. **La première carte est la clé la plus fautive** : son libellé, son
   compte, « 22 écarts » et « le plus rapide : 1 h 30 » côte à côte. Le délai court est
   ce qui accuse ; le nombre est ce qui classe.
4. Il lit trois ou quatre lignes de cette carte : `prix · 9 900 € → 12 900 € · +30 % ·
   2 h · 23 sept.` Un délai de deux heures sur trente pour cent, répété, se lit tout seul.
5. Il clique le lien sortant vers leboncoin — nouvel onglet, `rel="noopener"`
   (`dom.outLink`) — et voit l'annonce. Verdict.
6. S'il veut l'historique : le second lien, vers `/v1/listings/…`, rend les points de prix.
7. Il ne suspend rien depuis cette page (§5.3). Il sait qui, il sait quoi ; la suite est
   une décision, pas un clic.

**État vide qui rassure** : « Aucun écart sur 30 jours. » et, dessous, en gris, le fait
qui le prouve — « le robot a recoupé N annonces marquées depuis le 26 août. » Une page
vide sans ce second chiffre ne dit pas si tout va bien ou si le recoupement ne tourne pas.
`N` est un `count` sur `divergences`… non : sur rien. **Décision** : le chiffre de
contrôle est le nombre de marqueurs levés, qu'on ne stocke pas. On affiche donc à la
place le nombre de marqueurs **en attente** (`select count(*) from rechecks`), servi par
la même route sous `pending` : « 7 annonces attendent le passage du robot. » Zéro écart
**et** zéro marqueur en attente, c'est la file à jour ; zéro écart et 400 marqueurs en
attente, c'est le crawler à l'arrêt, et Alexis doit le voir sur cette page.

### 5.2 Les fichiers

| Fichier | Rôle | Taille |
|---|---|---|
| `web/ecarts.html` | la coquille, copie de `balayage.html` (titre, favicon, `base.css` + `views.css`, `<main class="vue" id="racine">`) | 15 l. |
| `web/js/ecarts.js` | **pur, sans DOM** : `summarize(payload)`, `sortLicenses(rows)`, `delayLabel(seconds)`, `fieldLabel(field)`, `valueLabel(field, value)` | ~70 l. |
| `web/js/ecarts-page.js` | le rendu, par `el()`/`clear()` de `dom.js` ; états `no-license` / `loading` / `data` / `empty` | ~90 l. |
| `web/js/api-ecarts.js` | `divergences(days)` → `request('/v1/divergences', …)`, fixtures en `?demo=1` — même forme qu'`api-sweep.js` | ~12 l. |
| `web/js/fixtures-ecarts.js` | trois clés, huit écarts, les six `field`, un état vide atteignable par `?demo=1&days=1` | ~65 l. |
| `web/css/views.css` | une section « écarts », dans la veine de `.carte-suivi` | +~22 l. (95 → 117) |

Réemploi strict du registre consumer (`docs/panneau-conception.md`, `base.css`) :
`.vue`, `.vue-t`, `.vue-s`, `.pile`, `.carte`, `.vide`, `.lien-sortant`, `.fait`,
`.fait-raised` pour un écart en hausse, `.fait-dropped` pour une baisse, `.baisse` en
pastille pour le pourcentage. **Aucune couleur neuve, aucun rayon neuf.** Le pourcentage
et le délai sont des faits : ils prennent la typographie des faits (`.fait`, 27 px), pas
celle des étiquettes.

`delayLabel` suit `format.js` : « 45 min », « 2 h », « 1 j », « 6 j », « 1 mois » — pas
de bibliothèque, séparateurs posés à la main comme `format.number` (`format.js:20`), et
tout se lit en UTC (`format.parts`) pour que la capture ne glisse pas d'un jour.

### 5.3 Pas de bouton « suspendre » dans ce lot — tranché

Le brief autorisait le bouton « si ça tient en dix lignes avec la route existante ».
**Il n'y a pas de route existante.** `License.active` existe (`license_models.py:31`) et
`auth.resolve` la lit (`auth.py:27`), mais rien dans le dépôt ne la bascule par HTTP —
la suspension se fait aujourd'hui en SQL ou par script. Ajouter la route correctement
coûte : une route `POST /v1/licenses/{key_hash}/suspend` derrière `require_operator`, le
CSRF (`sessions.check_csrf`), la réponse pour une clé inconnue, un test par cas, et la
confirmation côté page. Une trentaine de lignes et une porte d'écriture neuve sur les
licences — pas dix lignes, et pas à glisser en fin de lot.

**Décision : la page n'a pas de bouton.** Elle affiche `active: false` en pastille grise
pour une clé déjà suspendue, ce qui suffit à ne pas enquêter deux fois. La route de
suspension est un lot à part, à faire avant l'ouverture large, en même temps que la
correction de `disappearance` (§3.2) — les deux sont le même sujet : ce qu'un opérateur
peut décider depuis le site.

### 5.4 La capture

`docs/site-v0-ecarts.png`, en `?demo=1`, fixtures alignées sur la forme exacte de la
route (les six `field`, un délai en minutes, un en heures, un en jours, une clé
suspendue, une clé sans compte). Le parcours du §5.1 se rejoue **sur la capture** avant
de la committer : la phrase du haut se lit-elle sans effort, la première carte est-elle
bien la plus fautive, le délai le plus court saute-t-il aux yeux. C'est le seul fichier
de `docs/` que le lot touche.

---

## 6. Les tests, et la ligne de production que chacun fait rougir

Chaque test est prouvé en cassant la ligne nommée puis en la restaurant. Aucun ne lit
l'horloge : `now` est toujours un paramètre, et les routes passent par la fixture `clock`
(`conftest.py:88`).

### `api/tests/test_quota.py` (neuf)

| # | Test | Ligne qui rougit |
|---|---|---|
| 1 | `test_a_key_past_its_daily_quota_is_refused` | `if used >= limit: raise HTTPException(429…)` — `quota.guard` |
| 2 | `test_the_automated_license_has_no_quota` | `if license_ is None or license_.automated: return` |
| 3 | `test_the_quota_counts_the_utc_day_only` | `UsageDay.day == now.date()` (une observation d'hier ne compte pas) |
| 4 | `test_the_quota_sums_every_listing_of_the_day` | `func.sum(UsageDay.observations)` (et non `func.count()`) |
| 5 | `test_the_refusal_says_the_ceiling_and_when_it_repeats` | le texte du `detail` |
| 6 | `test_the_route_answers_429_and_writes_nothing` | l'appel `quota.guard(...)` dans `post_observations` |
| 7 | `test_the_ceiling_comes_from_the_environment` | `config.observations_per_day` (`monkeypatch.setenv`) |

### `api/tests/test_recheck.py` (neuf)

| # | Test | Ligne qui rougit |
|---|---|---|
| 8 | `test_a_listing_a_merchant_has_just_created_is_marked` | `listing.observations == 0` — critère (a) |
| 9 | `test_a_price_change_by_a_merchant_is_marked` | la comparaison `latest.price != observation.price` — (b) |
| 10 | `test_a_price_unchanged_marks_nothing` | la même ligne, sens inverse |
| 11 | `test_a_different_publication_date_is_marked` | `observation.published_at.date() != listing.published_at.date()` — (c) |
| 12 | `test_a_bump_the_base_did_not_have_is_marked` | `listing.bumped_at is None or observation.bumped_at > listing.bumped_at` — (e) |
| 13 | `test_a_declared_absence_is_marked` | l'appel `recheck.mark_absence` dans `disappearance.observe` — (d) |
| 14 | `test_the_vehicle_claim_never_stands_alone` | la garde « au moins une ligne posée » de (f) |
| 15 | `test_an_automated_observation_never_marks` | `if license_.automated` dans `divergence.on_observation` |
| 16 | `test_a_lacentrale_observation_is_never_marked` | `observation.site in revisit.ADDRESS` (§2.4) |
| 17 | `test_two_merchants_on_the_same_field_both_hold_a_claim` | la clé primaire à trois colonnes |

### `api/tests/test_revisit.py` (ajouts au fichier existant)

| # | Test | Ligne qui rougit |
|---|---|---|
| 18 | `test_a_listing_to_check_comes_before_everything` | `(_marked(), 0)` dans `_rank` |
| 19 | `test_a_listing_to_check_does_not_owe_the_silence` | le `or_(_marked(), and_(last_seen <= now - QUIET, …))` |
| 20 | `test_a_listing_to_check_ignores_the_lease` | le même `or_`, côté `next_detail_crawl` |
| 21 | `test_a_marked_listing_of_another_site_stays_out` | `Listing.site == site`, hors du `or_` |
| 22 | `test_a_marked_listing_already_served_falls_behind_the_others` | `Listing.last_revisit_at.nullsfirst()` |

### `api/tests/test_divergence.py` (neuf, un par critère, `now` injecté)

| # | Test | Ligne qui rougit |
|---|---|---|
| 23 | `test_a_price_more_than_five_percent_apart_is_journaled` | `abs(delta) > NOTABLE_PCT` |
| 24 | `test_a_price_four_percent_apart_is_not` | la même ligne |
| 25 | `test_an_intermediate_relevé_explains_the_price` | la requête `_explained` |
| 26 | `test_a_merchant_cannot_explain_itself` | `is_distinct_from(claim.license_key_hash)` |
| 27 | `test_a_confirmation_explains_nothing` | `PricePoint.confirmation.is_(False)` |
| 28 | `test_a_publication_date_one_day_apart_is_journaled` | la comparaison `.date()` |
| 29 | `test_a_mileage_more_than_a_thousand_apart_is_journaled` | `abs(diff) > MILEAGE_TOLERANCE` |
| 30 | `test_a_brand_rewritten_by_the_merchant_is_journaled` | la comparaison marque/modèle/année |
| 31 | `test_an_absence_the_robot_contradicts_is_journaled` | la branche `field == "absence"` |
| 32 | `test_a_bump_the_robot_does_not_see_is_journaled` | la branche `field == "bump"` |
| 33 | `test_a_listing_the_robot_never_finds_is_journaled` | `divergence.on_absence`, verdict `recorded` |
| 34 | `test_a_merchant_right_about_the_absence_is_not_journaled` | la branche `field == "absence"` de `on_absence` |
| 35 | `test_two_automated_relevés_never_produce_a_line` | l'aiguillage `license_.automated` (§3.6) |
| 36 | `test_the_line_carries_the_delay_not_the_clock` | `delay_seconds = int((now - claim.observed_at)…)`, deux `now` différents |
| 37 | `test_the_marker_is_lifted_even_when_nothing_is_journaled` | `recheck.clear(listing_id)` |

### `api/tests/test_divergences_route.py` (neuf)

| # | Test | Ligne qui rougit |
|---|---|---|
| 38 | `test_the_page_is_reserved_to_the_operator` | `Depends(require_operator)` |
| 39 | `test_the_keys_are_sorted_by_count_then_by_shortest_delay` | la clé de tri |
| 40 | `test_the_window_holds_thirty_days` | `verified_at >= now - timedelta(days=days)` |
| 41 | `test_the_header_counts_the_keys_with_three_or_more` | `having count(*) >= REPEAT` |
| 42 | `test_the_header_stays_exact_when_the_rows_are_capped` | la requête d'agrégat séparée de `MAX_ROWS` |
| 43 | `test_the_empty_page_still_says_how_many_wait_for_the_robot` | le `pending` (§5.1) |

### `api/tests/test_alert_rules.py` (ajouts)

| # | Test | Ligne qui rougit |
|---|---|---|
| 44 | `test_a_drop_last_seen_by_a_merchant_waits_for_the_robot` | la condition `confirmed`, drapeau posé |
| 45 | `test_the_same_drop_passes_once_the_robot_has_followed` | la même, sens inverse |
| 46 | `test_a_drop_the_robot_itself_saw_needs_no_confirmation` | `observed_at >= …` (et non `>`) |
| 47 | `test_the_flag_is_off_by_default` | `if not alerts_confirmed_only(): return query` |

### `api/tests/test_migrations.py` (ajouts)

| # | Test | Ligne qui rougit |
|---|---|---|
| 48 | `to_old_shape` + les deux `DROP TABLE` | la 016 dans le registre (le test de parité `create_all` ↔ migrations existe déjà et couvre le reste) |

### `web/tests/ecarts.test.mjs` (neuf)

| # | Test | Ligne qui rougit |
|---|---|---|
| 49 | `un délai sous l'heure se dit en minutes` | `delayLabel` |
| 50 | `un délai sous deux jours se dit en heures` | `delayLabel` |
| 51 | `un délai au-delà se dit en jours` | `delayLabel` |
| 52 | `les clés se classent par nombre puis par délai le plus court` | `sortLicenses` |
| 53 | `l'entête compte les clés à trois écarts ou plus` | `summarize` |
| 54 | `un écart sans pourcentage n'en affiche pas` | le rendu de `delta_pct === null` |
| 55 | `les six champs ont un libellé français` | `fieldLabel` |

**Comptes attendus** : `api` 943 → ~981 ; `web` 186 → ~193 ; `extension` 438, inchangé
(aucun fichier d'extension touché — l'extension envoie déjà tout ce qu'il faut).

---

## 7. Découpage ≤ 150 lignes

| Fichier | Avant | Après | Comment |
|---|---|---|---|
| `main.py` | **150** | ~147 | `ordered()` (62-66) **part** dans `observations.py` — sa place est là ; `from .observations import ordered, record` ne coûte rien. Gains : +1 `quota.guard(...)`, +1 `include_router(divergences.router)`. `quota` et `divergences` s'ajoutent au `from . import (…)` des lignes 15-18, sans ligne neuve. |
| `observations.py` | 140 | ~148 | +5 (`ordered` et son commentaire), +3 (import, commentaire, appel `divergence.on_observation`). **Au plafond : le prochain lot sortira le point de prix dans un voisin.** |
| `revisit.py` | 133 | ~147 | `_marked()` + son commentaire, le `or_`, le rang 0, la clé de tri. |
| `disappearance.py` | 133 | ~142 | le paramètre `license_`, les deux accroches, leurs commentaires. |
| `alert_rules.py` | 119 | ~130 | la condition `confirmed` et son commentaire. |
| `config.py` | 109 | ~125 | `observations_per_day()`, `alerts_confirmed_only()`, commentaires. |
| `models.py` | 128 | 129 | une ligne d'import réexport, comme `usage_models` (14). |
| `migration_registry.py` | **154** | ~88 | 001→008 partent dans `migration_registry_early.py` ; `MIGRATIONS = EARLY + (009…016)`. |
| `usage.py` | **150** | 150 | **on n'y touche pas** : `quota.py` lit `UsageDay` de son côté. |
| `intake.py`, `gauge.py`, `saved_searches.py` | — | — | intacts. |

Fichiers neufs : `corpus_models.py` (~55), `migration_sql_corpus.py` (~30),
`migration_registry_early.py` (~75), `quota.py` (~45), `recheck.py` (~85),
`divergence.py` (~110), `divergences.py` (~75). Aucun n'approche 150.

---

## 8. Les pièges, et ce que je tranche

**1. La navigation d'Alexis produira des marqueurs et des écarts à son nom. Acceptable ?
Oui, et il ne faut surtout pas l'exempter.**
Sa clé d'extension est une clé de marchand ordinaire, non automated : chaque annonce
qu'il ouvre qui change de prix se marque, le robot repasse, et sur une vraie baisse
rapide (72 écarts de plus de 5 % en moins de 48 h mesurés sur la base) une ligne s'écrit
à son nom. Les premières semaines, **sa clé sera en tête de la page** — simplement parce
qu'elle est la seule clé humaine active. C'est exactement ce qu'il faut : la page sert
d'abord à mesurer **le bruit de fond d'un utilisateur honnête**, et Alexis saura ce que
« 3 écarts » vaut avant qu'un inconnu en fasse trente. Une exemption rendrait la page
muette et ferait perdre le seul étalon disponible. Côté file, l'effet est bénin : ses
marqueurs mettent en tête de la revisite les annonces qu'il vient de regarder, c'est-à-dire
ce que le rang 0 « demandé par quelqu'un » fait déjà, en plus rapide.
**Corollaire à ne pas manquer : ne jamais marquer sa clé `automated` pour se taire.** Cela
lui ouvrirait `require_operator` par Bearer (`operator.py:45`) et lui retirerait son
quota. Son statut d'opérateur passe par le cookie et le compte, pas par la licence.

**2. `disappearance` écrit une disparition irréversible sans exiger le robot.** Deux
constatations `absent` à six heures d'écart depuis n'importe quelle clé de marchand posent
`disappeared_at` (§3.2). C'est la faille la plus grave de la lecture, elle n'est pas dans
le périmètre de ce lot, et elle mérite un lot avant l'ouverture large. Une condition sur
`disappearance.py:132` la ferme.

**3. Un marchand peut ressusciter une annonce disparue.** `observations.record:131` fait
`listing.disappeared_at = listing.absent_since = None` sans regarder qui parle. Existant,
noté, hors lot — mais le marqueur du lot Corpus le rend au moins **visible** : la fiche
ressuscitée repasse au rang 0 et le robot tranche.

**4. Un marchand qui ne réécrit que le véhicule n'est pas marqué** si l'on suit le brief
à la lettre (§3.1, note sur (f)). Je recommande d'ajouter le critère ; à Alexis de couper.

**5. Le marqueur n'expire pas, et c'est voulu — mais il faut le départage.** Sans
`last_revisit_at.nullsfirst()` (§2.3), une fiche marquée que le crawler n'ouvre jamais
tient la tête de la file indéfiniment. Avec, elle recule derrière les autres marquées
sans qu'aucun seuil n'apparaisse dans le code.

**6. `rechecks` ne doit jamais accumuler ce qu'on ne peut pas lever** : d'où le refus de
marquer un site absent de `revisit.ADDRESS` (§2.4). Le compteur `pending` de la page
(§5.1) est la sonde : s'il monte sans redescendre, le recoupement ne tourne plus.

**7. Le quota peut être dépassé de 99 par lot** et deux lots simultanés ne s'attendent
pas (§4.1). Accepté, noté au rapport — c'est une digue, pas une comptabilité.

**8. `test_migrations.py` compare le schéma des migrations à celui de `create_all`** : le
SQL de `migration_sql_corpus.py` et les colonnes de `corpus_models.py` doivent coïncider
au type près — `numeric(6,2)` ↔ `Numeric(6, 2)`, `serial` ↔ `Mapped[int]
mapped_column(primary_key=True)`, `varchar(16)` ↔ `String(16)`. C'est le test qui attrape
la faute, à condition d'avoir ajouté les deux `DROP TABLE` à `to_old_shape`.

**9. Rien n'est écrit rétroactivement.** La 016 crée deux tables vides ; les 570
changements de prix déjà en base, honnêtes par construction, ne sont jamais jugés. Le
journal ne dira quelque chose qu'au premier aller-retour marchand → robot.

**10. Vérifier avant de livrer, en lecture seule** : `select label, automated from
licenses;`. Si la licence du crawler n'est pas `automated`, le lot entier est inerte —
aucun marqueur n'est jamais levé, aucun écart n'est jamais écrit, et **aucun test ne
peut le dire** parce que les tests fabriquent leurs licences.

---

## 9. Ordre de livraison

1. **016 + modèles** (`corpus_models`, `migration_sql_corpus`, le découpage du registre,
   `to_old_shape`) — suite verte, `pg_dump`, migration, `launchctl kickstart`.
2. **Quota** (`quota.py`, `config`, le déplacement d'`ordered`, tests 1-7).
3. **Marqueur et file** (`recheck.py`, `revisit.py`, tests 8-22) — le lot le plus risqué
   pour l'existant, livré seul.
4. **Journal** (`divergence.py`, l'accroche `disappearance`, tests 23-37).
5. **Route et page** (`divergences.py`, les cinq fichiers `web/`, tests 38-43 et 49-55,
   capture).
6. **Réserve** (`alert_rules`, `config`, tests 44-47).

Un lot à la fois, avec sa revue : les points 1 à 3 valent une relecture d'Alexis avant
d'écrire le 4, parce que c'est là que se décide si le marqueur est une table ou une
colonne (§1.1) et si le critère véhicule entre (§3.1).

Rapports à suivre : `.superpowers/corpus-api.md` (1 à 4 et 6),
`.superpowers/corpus-web.md` (5).
