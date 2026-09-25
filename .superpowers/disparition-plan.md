# Disparition — plan d'architecture (migration 017)

Écrit le 2026-09-25, branche `feat/api`. Aucun code écrit ici, aucune migration appliquée,
aucune page visitée, aucune écriture en base. Les lignes citées sont celles du dépôt à cette
date. Tient la décision d'Alexis du 2026-09-25, et ferme les deux réserves du lot Corpus
(`.superpowers/corpus-api.md` § « Réserves », points 1 et 2 ;
`.superpowers/corpus-plan.md` §8 points 2 et 3).

Le principe : **une disparition ferme est un fait de marché, elle exige deux voix
indépendantes. Une absence vue par une seule voix est un doute, et un doute n'appartient
qu'à celui qui l'a vu.**

---

## 0. Ce que la base sait aujourd'hui, et ce qui manque

| Fait | Où | Suffit-il ? |
|---|---|---|
| Qu'une annonce est absente depuis tel instant | `models.Listing.absent_since` (88) | Oui pour le délai |
| Qu'elle est disparue | `models.Listing.disappeared_at` (78) | Oui, mais un seul état pour deux degrés de certitude |
| **Qui a constaté l'absence** | **nulle part** — `observe` reçoit `license_` (104) et ne s'en sert que pour `recheck.mark_absence` et `divergence.on_absence` | **Non — c'est le trou de ce lot** |
| Qui a émis un relevé de prix | `models.PricePoint.license_key_hash` (125) | Oui, mais un relevé de prix n'est pas une constatation d'absence : une absence n'a pas de prix |
| Robot ou humain | `license_models.License.automated` (35) | Oui |
| Clé → compte | `license_models.License.account_id` (26) | Oui |
| Clé suspendue | `license_models.License.active` (31), lue par `auth.resolve` (27) | Oui en lecture — **rien ne la bascule par HTTP** |
| Ce qu'un marchand a déclaré, en attente du robot | `corpus_models.Recheck` (016) | Oui, mais **transitoire** : `recheck.clear` la vide au passage du robot |

Le point décisif : **`Recheck` ne peut pas servir de registre des constatations.** Elle est
faite pour être levée (`divergence._verify:127`), elle ne porte que la *dernière*
déclaration d'une clé (`recheck._claim:30`), et elle n'existe pas pour le robot
(`divergence.on_observation:27`). Le registre des constatations d'absence doit être
durable, porter le *premier* instant de chaque voix, et exister pour le robot comme pour
l'humain. D'où une table neuve, et c'est la seule raison de son existence.

Second point : `observe(license_=None)` est appelé par vingt tests et reste possible depuis
un script. Ce n'est pas un trou d'attribution : `alert_rules.py:92` a déjà tranché le sens
d'une licence nulle — « le crawler d'avant la colonne, qui fait foi aussi ». On garde ce
sens, exactement (§3.2).

---

## 1. L'automate d'états d'une annonce

Cinq états, portés par trois colonnes de `listings` et jamais par un champ `state` : la
même discipline que `disappeared_at` aujourd'hui — une date, un fait, pas une étiquette.

```
                     constatation d'absence (1re voix, evidence=absent)
   ┌──────────┐ ─────────────────────────────────────────────────────────▶ ┌───────────────────┐
   │ en ligne │                                                            │ absence constatée │
   └──────────┘ ◀───────────────────────────────────────────────────────── └───────────────────┘
        ▲            observation vivante, n'importe quelle voix                     │
        │                                                                           │ ≥ 6 h
        │                                                                           │
        │                                            ┌──────────────────────────────┴───────┐
        │                                            │                                      │
        │                                   2e constatation                        2e constatation
        │                                   de la MÊME voix                        d'une AUTRE voix
        │                                            │                                      │
        │      observation vivante,                  ▼                                      ▼
        ├───── n'importe quelle voix ───────  ┌──────────────┐                     ┌────────────────┐
        │                                     │  probable    │ ── autre voix ────▶ │     ferme      │
        │                                     └──────────────┘    (≥ 6 h déjà      └────────────────┘
        │                                                          acquis)                 │
        └────────── observation vivante d'une voix DISTINCTE des déclarantes ───────────────┘
```

| État | `absent_since` | `probably_gone_at` | `disappeared_at` | Ce que le monde en voit |
|---|---|---|---|---|
| en ligne | NULL | NULL | NULL | tout le monde la voit |
| absence constatée | posé | NULL | NULL | tout le monde la voit ; elle sort des **alertes** du déclarant et de celles de tous si le déclarant est le robot (§4.3) |
| probable | posé | posé | NULL | **sort du marché et des alertes du déclarant seul** ; les autres la voient avec la mention « disparition probable, à confirmer » ; rang 0 de la revisite |
| ferme | posé | posé ou NULL | posé | personne ne la voit (inchangé : `market_query.core:100`, `main.py:89`, `main.py:101`) |
| revenue | NULL | NULL | NULL | identique à « en ligne » ; l'historique reste, un écart est journalisé |

Qui peut faire quoi :

| Transition | Qui | Où |
|---|---|---|
| en ligne → absence constatée | n'importe quelle voix, preuve `absent` seulement | `disappearance.observe` |
| absence constatée → probable | la **même** voix, ≥ 6 h après la première | `disappearance.observe` |
| absence constatée → ferme | une **autre** voix, ≥ 6 h après la première | `disappearance.observe` |
| absence constatée / probable → ferme | le **robot seul**, sur sa deuxième constatation | `disappearance.observe`, §2.4 — la seule entorse au texte de la décision, argumentée |
| probable → ferme | une voix distincte des déclarantes | `disappearance.observe` |
| toute absence → en ligne | une observation vivante : n'importe quelle voix pour `absent_since`/`probable`, une voix distincte des déclarantes pour `ferme` | `revival.apply`, depuis `observations.record` |
| → rien (écriture suspendue) | le garde-fou de flotte, sur `probable` comme sur `ferme` | `fleet_guard.fleet` |

Ce que l'automate **ne** fait pas : aucune expiration, aucun `state` dérivé stocké, aucune
transition par le temps seul. Une annonce ne disparaît jamais parce que personne ne l'a
regardée — `revisit.py:16-20` l'a déjà tranché, six annonces sur six jamais revues étaient
vivantes.

---

## 2. Le schéma — migration 017, non destructive

Aucun `UPDATE`, aucun `DROP`, aucun `NOT NULL` ajouté à une colonne existante. **Les
`disappeared_at` existants restent** : ils ne sont ni relus, ni annulés, ni rétro-comptés.

### 2.1 `listings.probably_gone_at`

```sql
ALTER TABLE listings ADD COLUMN IF NOT EXISTS probably_gone_at timestamptz;
CREATE INDEX IF NOT EXISTS ix_listings_probable
  ON listings (probably_gone_at) WHERE probably_gone_at IS NOT NULL;
```

Une date, pas un booléen : c'est la date de la **première** constatation, celle que
`disappeared_at` porterait si une seconde voix venait — même règle qu'aujourd'hui
(`disappearance.py:143`). Index partiel parce que la population est minuscule et
transitoire (§5.1) : c'est lui qui rend le filtre par compte gratuit (§4.2).

`models.Listing` gagne la colonne juste sous `disappeared_at`, avec son commentaire : « le
doute, à la différence du fait : une seule voix l'a constatée ».

### 2.2 `absence_reports` — le registre des voix

```sql
CREATE TABLE IF NOT EXISTS absence_reports (
  listing_id       integer     NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  actor            varchar(72) NOT NULL,
  license_key_hash varchar(64) REFERENCES licenses (key_hash) ON DELETE SET NULL,
  automated        boolean     NOT NULL DEFAULT false,
  evidence         varchar(16) NOT NULL,
  first_at         timestamptz NOT NULL,
  last_at          timestamptz NOT NULL,
  PRIMARY KEY (listing_id, actor)
);
CREATE INDEX IF NOT EXISTS ix_absence_reports_actor ON absence_reports (actor, listing_id);
```

- **Clé primaire `(listing_id, actor)`**, pas `(listing_id, license_key_hash)` : l'unité de
  la règle est le compte, pas la clé. Deux clés d'un même compte s'écrasent l'une l'autre —
  c'est exactement « ne comptent qu'une fois », tenu par la base plutôt que par une requête
  `count(distinct)` qu'on pourrait oublier d'écrire (§9, piège du crawler + extension).
- `license_key_hash` **nullable** et `ON DELETE SET NULL`, comme
  `price_points.license_key_hash` (127) et `divergences.license_key_hash` : la preuve
  survit à son émetteur, et une constatation du crawler d'avant les licences n'en porte
  aucune. C'est la clé de la **première** constatation de cet acteur — celle qu'on
  journalise si l'annonce revient.
- `automated` dénormalisé : il évite une jointure sur `licenses` dans le filtre des alertes
  (§4.3), qui tourne sur 56 000 lignes. Il est vrai pour le robot et faux pour un marchand,
  et la colonne est posée à l'écriture, jamais recalculée.
- `first_at` / `last_at` : le délai journalisé part de la **première** constatation (§5.3) ;
  `last_at` sert la lecture opérateur et le diagnostic, aucune décision n'en dépend.
- **Pas d'`id` sériel** : la table n'est jamais référencée.
- Lignes **conservées** quand la disparition devient ferme : sans elles, la règle de levée
  d'une ferme (§1) n'aurait plus de déclarant à comparer. Elles sont effacées à la levée
  (§5.3) et par la cascade si l'annonce est supprimée.

### 2.3 Registre

`migration_registry.MIGRATIONS` gagne `("017_absence", ABSENCE_REPORTS)`, le SQL dans
`migration_sql_absence.py` (même manœuvre que `migration_sql_corpus.py`). `models.py`
réexporte `AbsenceReport` pour que `Base.metadata` la porte, sinon `test_migrations.py`
compare deux schémas dont l'un ignore la table.

### 2.4 La seule entorse au texte de la décision, et pourquoi

Le texte dit : « le robot (licence `automated`) compte comme un compte ». Lu à la lettre,
**deux constatations du robot ne font qu'un compte et ne produisent donc qu'une
« probable »**. Conséquence mesurable : le robot est aujourd'hui la seule source de
revisites systématiques (`main.py:134`, `revisit.due`), donc la quasi-totalité des
disparitions resterait « probable » pour toujours — et une « probable » du robot ne sort du
marché de personne, puisque le robot n'a pas de marché. `disappeared_at` deviendrait une
colonne morte, et avec elle `facts.js:33` (« a disparu »), `feed_query.FlagsOut.disappeared`,
et la durée de vie des annonces pro (`revisit.py:29-32`).

Je tranche : **le robot confirme seul.** C'est déjà la règle du lot Corpus (« le robot fait
foi, il n'est jamais jugé », `docs/roadmap.md` § Lot Corpus, point 3) ; sa clé est locale,
elle n'est jamais livrée dans l'extension, et la faille qu'on ferme est « un marchand peut
effacer les annonces d'un concurrent », jamais « le robot se trompe ». Deux constatations
d'un **marchand** ne font qu'une probable ; deux constatations du **robot** font une ferme,
comme avant ce lot.

Une constante, une ligne, pour qu'Alexis puisse trancher l'inverse sans relire le module :

```python
# Le robot confirme seul (docs/roadmap.md § Lot Corpus : « le robot fait foi »).
# À `False`, il lui faut une seconde voix comme à un marchand — et la base
# n'écrit alors presque plus de disparition ferme (.superpowers/disparition-plan.md §2.4).
AUTOMATED_CONFIRMS_ALONE = True
```

---

## 3. « Deux comptes distincts », à partir de quoi

### 3.1 L'acteur

Une fonction pure, dans `absence_scope.py`, et c'est le seul endroit du dépôt qui décide ce
qu'est « une voix » :

```python
def actor_of(license_) -> str:
    if license_ is None:
        return LEGACY                      # "robot:legacy"
    if license_.automated or license_.account_id is None:
        return f"key:{license_.key_hash}"
    return f"acct:{license_.account_id}"
```

Trois cas, dans cet ordre, et l'ordre est la règle :

1. **`automated` d'abord**, avant le compte. Sans cela, le crawler d'Alexis rattaché à son
   compte (ce que `attach_account.py` sait faire, et que rien n'interdit) fusionnerait avec
   sa clé d'extension : **une seule voix, aucune disparition ferme jamais écrite**. C'est le
   piège le plus coûteux de ce lot (§9.1). Le robot est toujours sa propre voix.
2. **compte** ensuite : deux clés d'un même compte sont la même voix, par construction de la
   clé primaire (§2.2).
3. **clé** enfin : une clé sans compte compte pour elle-même, comme le dit la décision.

### 3.2 La licence nulle

`observe(license_=None)` rend l'acteur `"robot:legacy"`, `automated=True`. Ce n'est pas une
commodité de test : `alert_rules.py:92` a déjà posé que `license_key_hash` nul désigne « le
crawler d'avant la colonne, qui fait foi aussi ». Aucune route ne peut y arriver —
`require_license` rend toujours une licence (`main.py:143`) —, seuls les scripts et les
tests le font. Effet secondaire heureux : **les vingt tests de flotte de
`test_disappearance.py` restent verts sans être touchés**, et ce qu'on ajoute au fichier
porte une licence explicite.

### 3.3 Le comptage

`absence_scope.report(session, listing, license_, evidence, now)` fait un `INSERT … ON
CONFLICT (listing_id, actor) DO UPDATE SET last_at = now` — jamais `first_at`, qui est le
premier instant et ne recule ni n'avance — et rend le nombre d'acteurs distincts sur
l'annonce (`SELECT count(*) FROM absence_reports WHERE listing_id = …`, la clé primaire le
rend exact sans `distinct`). Deux instructions, une par constatation, sur une table dont la
population est de l'ordre du millier.

---

## 4. Le filtrage par compte du marché et des alertes

### 4.1 Faisable ?

Oui, partout, et sans compromis. Les deux chemins connaissent déjà l'appelant :
`market_query.core(license_, now, …)` reçoit la licence (elle lui sert déjà pour
`followed`, ligne 84) et `alert_rules._alert_query(search, license_, now)` aussi. Il n'y a
rien à faire remonter.

### 4.2 Le marché — coût

Un module neuf, `absence_scope.py`, porte la clause partagée :

```python
def visible(license_):
    """Ce qu'une licence a le droit de voir : jamais une ferme, jamais une
    probable qu'elle a elle-même déclarée."""
    mine = select(1).where(AbsenceReport.listing_id == Listing.id,
                           AbsenceReport.actor == actor_of(license_)).exists()
    return (Listing.disappeared_at.is_(None),
            or_(Listing.probably_gone_at.is_(None), ~mine))
```

`market_query.core:100` passe de `.where(Listing.disappeared_at.is_(None))` à
`.where(*visible(license_))` — même ligne, un import de plus.

Coût, raisonné : le `or_` court-circuite sur `probably_gone_at IS NULL`, vrai pour plus de
99,9 % des lignes, et Postgres n'évalue l'`EXISTS` que pour le reste. Sur la population
probable (quelques dizaines à quelques centaines, §5.1), l'`EXISTS` est une sonde d'index
sur `ix_absence_reports_actor`. Aucun `GROUP BY`, aucune jointure ajoutée — donc
`facet_query.py` et `coverage.py`, qui réutilisent `core` tel quel, héritent du filtre sans
une ligne. **Tranché : on filtre, sans dégrader.** (La variante `Listing.id.notin_(…)` sur
un sous-ensemble pré-calculé serait équivalente ; elle ne survivrait pas à une population
probable qui grossirait, et `or_` s'en moque.)

### 4.3 Les alertes

`alert_rules._alert_query:53-56` porte aujourd'hui `Listing.absent_since.is_(None)`,
**global** : une seule constatation d'une seule clé éteint les alertes de tout le monde.
C'est la même faille en plus petit, et elle sort avec la grande. Remplacé par :

```python
def quiet_for(license_):
    """Ce sur quoi on n'alerte pas ce compte : ce qu'il a constaté absent, et ce que
    le robot a constaté absent — lui fait foi pour tout le monde."""
    hush = select(1).where(
        AbsenceReport.listing_id == Listing.id,
        or_(AbsenceReport.actor == actor_of(license_), AbsenceReport.automated.is_(True)),
    ).exists()
    return (~hush,)
```

Appliquée en plus de `visible(license_)` (que `core` a déjà posée). Trois conséquences
voulues : le déclarant n'est plus alerté sur ce qu'il croit parti ; le robot éteint l'alerte
pour tous dès sa première constatation, exactement comme le faisait `absent_since` ; un
marchand n'éteint plus rien chez son concurrent. `automated` dénormalisé (§2.2) est ce qui
rend cette clause gratuite — sans lui, une jointure sur `licenses` par annonce candidate.

Ici l'`EXISTS` n'est pas court-circuitable (il n'y a pas de colonne de `listings` à lire
d'abord), mais la requête d'alerte tourne déjà réduite par le filtre de la recherche
enregistrée et par `last_seen >= now - 48 h` (ligne 54) : quelques centaines de lignes par
recherche, une sonde d'index chacune, une fois par digest.

### 4.4 Le feed des suivis — on ne filtre pas, on dit

`/v1/follows/feed` ne porte que ce qu'une licence **a demandé à suivre** : faire disparaître
d'un feed l'annonce qu'on suit serait la perdre de vue au pire moment. L'item gagne
`probably_gone_at` et `flags.probably_gone`, et reste. C'est la différence entre le marché
(un inventaire, dont on retire ce qu'on croit vendu) et le feed (une surveillance, dont on
ne retire rien).

---

## 5. Les effets sur ce qui existe

### 5.1 `revisit.due` — rien à changer, et c'est la bonne nouvelle

Une probable est forcément déclarée par un marchand (§2.4), donc
`recheck.mark_absence:83` lui a déjà posé une réclamation `absence`
(`disappearance.py:120-121`), donc `revisit._marked()` la met au **rang 0** et lui fait
sauter `QUIET` **et** le bail (`revisit.py:127`). Le filtre `disappeared_at.is_(None)` de
`due` (124) la garde dans la file, puisqu'une probable n'a pas de `disappeared_at`.
**`revisit.py` n'est pas touché par ce lot** — à vérifier par un test, pas par confiance
(§8).

Corollaire : une probable est **transitoire par construction**. Au prochain passage du
robot, ou il la voit en ligne (levée, §5.3), ou il la voit absente (sa voix s'ajoute,
ferme). Elle ne peut stagner que si le crawler ne tourne pas — et c'est alors le compteur
`pending` de `/v1/divergences` qui le dit déjà (`divergences.py:95`).

### 5.2 `recheck` — une réclamation de plus, `revived`

Symétrie nécessaire, sinon on ferme une arme et on en ouvre une autre : puisqu'une
observation vivante lève une disparition ferme (§1), un marchand peut **ressusciter** en
boucle l'annonce vendue d'un concurrent pour qu'elle ne quitte jamais le marché
(`corpus-plan.md` §8 point 3, resté ouvert). La parade est celle du lot Corpus, pas une
nouvelle : on marque et le robot juge. `recheck.mark_revival(session, listing, license_,
now)` pose une réclamation `revived` quand une licence **non automated** lève une
disparition ferme ; `divergence.on_absence` (déjà appelée quand le robot confirme,
`disappearance.py:142`) la journalise comme elle journalise `unknown_listing`.

Le tableau des champs de `recheck` passe donc de six à sept, et `web/js/ecarts.js`
`FIELD_LABELS` gagne `revived: 'résurrection'`.

### 5.3 `divergence` — l'écart « absence » change de main

Aujourd'hui `divergence._absence:94-97` écrit la ligne « absence » quand le robot recoupe
une réclamation. Si `revival.apply` écrivait aussi la sienne, **la même contradiction
produirait deux lignes** : `_verify` tourne à `observations.record:92`, `revival` à la ligne
141, dans la même transaction.

Tranché : **`revival` devient l'unique auteur des lignes `field="absence"`**, et
`divergence._verify` perd sa branche `absence` (−4 lignes, bienvenues sur un fichier à
141). Meilleur sous trois angles : le délai part de `absence_reports.first_at` (la première
constatation) plutôt que de `Recheck.observed_at` (la dernière, `recheck._claim:32`) ; la
ligne s'écrit aussi quand le leveur n'est **pas** le robot, ce que la décision demande ; et
elle s'écrit même si le robot avait déjà levé la réclamation entre-temps.

Ce que `revival` écrit, une ligne par acteur déclarant :

| Colonne | Valeur |
|---|---|
| `field` | `"absence"` |
| `license_key_hash` | `report.license_key_hash` (nul si la clé est partie) |
| `merchant_value` | `report.evidence` (`"absent"`) |
| `robot_value` | `"présente"` si le leveur est `automated`, sinon `"revue en ligne"` |
| `observed_at` | `report.first_at` |
| `verified_at` | `now` |
| `delay_seconds` | `int((now - report.first_at).total_seconds())` |

Deux valeurs de `robot_value` et non une : l'opérateur doit pouvoir distinguer « le robot a
vu l'annonce en ligne » de « un marchand dit l'avoir vue en ligne ». Sans cette nuance, deux
marchands pourraient se fabriquer des écarts l'un contre l'autre et la page ne saurait pas
lesquels croire (§9.4).

**Un acteur `automated` n'est jamais journalisé** — « le robot fait foi, il n'est jamais
jugé ». Sa ligne de `absence_reports` est effacée comme les autres, sans écrire de
`Divergence`.

### 5.4 Le garde-fou de flotte — inchangé, et il couvre les deux

`fleet()` compte au numérateur `absent_since IS NOT NULL` (`disappearance.py:95`), vrai pour
une probable comme pour une ferme, et la porte se franchit **avant** l'écriture, quelle
qu'elle soit : `held` reste `held`, et rien n'est posé. Le seul changement est
d'emplacement : `fleet()` et ses trente lignes de justification partent dans
`fleet_guard.py` pour faire tenir `disappearance.py` sous 150 (§7). Aucune constante ne
bouge (`GUARD_WINDOW`, `GUARD_MIN`, `GUARD_SHARE`), aucun test de flotte ne change d'un
caractère hors l'import.

### 5.5 `observations.record` — une ligne remplacée, pas une de plus

La ligne 141, `listing.disappeared_at = listing.absent_since = None`, devient
`revival.apply(session, listing, license_, now)`. Le fichier est **à 150 pile** : l'import
se glisse dans `from . import divergence, publication` sans ligne neuve.

`revival.apply` sort immédiatement si `listing.absent_since is None and
listing.disappeared_at is None and listing.probably_gone_at is None` — trois lectures en
mémoire, zéro requête, sur le chemin chaud des 7 000 observations par jour. Ce n'est qu'en
présence d'une absence qu'il lit `absence_reports`.

La règle de levée, telle que la décision la pose :

- `absent_since` seul, ou `probably_gone_at` : **n'importe quelle voix** lève. Les trois
  colonnes repassent à NULL, les `absence_reports` de l'annonce sont effacées, un écart est
  journalisé par acteur non automated.
- `disappeared_at` : **une voix distincte de toutes les déclarantes** lève. Le leveur qui
  figure parmi les déclarantes ne lève rien et n'écrit rien (il se contredit lui-même ; sa
  propre constatation reste, le robot tranchera).
- `disappeared_at` **sans aucune ligne `absence_reports`** — toutes les disparitions fermes
  écrites avant ce lot : il n'y a pas de déclarant, donc n'importe quelle voix la lève, et
  c'est exactement le comportement d'aujourd'hui. « Les disparitions fermes existantes
  restent telles quelles jusqu'à ce qu'une observation les contredise. »
- L'historique n'est jamais touché : ni `price_points`, ni `first_seen`, ni
  `site_published_first`, ni `observations`. Une annonce revenue est la même annonce.

---

## 6. La route de suspension

### 6.1 Contrat

| Route | Porte | Corps | Rend |
|---|---|---|---|
| `POST /v1/licenses/{key_hash}/suspend` | `require_operator` | aucun | `{"key_hash", "label", "active": false}` |
| `POST /v1/licenses/{key_hash}/restore` | `require_operator` | aucun | `{"key_hash", "label", "active": true}` |

- **`key_hash` seulement, jamais une clé en clair.** `session.get(License, key_hash)`, pas
  `auth.by_key_or_hash` (34) : une clé de licence dans un chemin d'URL finirait dans les
  journaux d'accès et dans l'historique du navigateur. La page opérateur ne connaît de
  toute façon que l'empreinte (`divergences._grouped`).
- `404` `"licence inconnue"` si l'empreinte n'existe pas.
- `403` `"licence automatique"` si `target.automated` : suspendre le robot arrêterait la
  base entière, et `corpus-api.md` § Réserves point 3 dit déjà que cette marque ne se touche
  pas.
- `403` `"licence de l'opérateur"` si `target.key_hash == actor.key_hash`, ou si
  `target.account_id is not None and target.account_id == actor.account_id` : l'opérateur ne
  se ferme pas la porte au nez, même par une seconde clé de son compte.
- **Idempotente** : suspendre une licence déjà suspendue rend `200` et `active: false`.
  Alexis clique deux fois, la page n'a pas à savoir laquelle a gagné.
- CSRF : acquis. La branche cookie de `require_operator` appelle `sessions.check_csrf` (51).
- La branche `Bearer automated` de `require_operator` reste ouverte comme le brief le
  demande : c'est la clé du crawler, elle est locale.

### 6.2 Ce qu'une clé suspendue reçoit

`auth.resolve:27` lit déjà `active` et rend `None` : **la suspension est effective sur
toutes les routes dès le prochain appel**, sans invalidation à propager. Vérifié en lecture,
à prouver par un test (§8). Ce qui manque est le mot : `require_license` répond « licence
invalide » (86, 90, 94), ce qui laisserait un marchand suspendu chercher une panne.

Deux ajouts de trois lignes dans `auth.py` (123 → ~129) :

- branche `Bearer` : si `resolve` rend `None`, relire `session.get(License, hash_key(key))`
  — si elle existe et que `not active`, `401 "licence suspendue"`.
- branche cookie : si `of_account` rend `None`, si le compte porte au moins une licence
  inactive, `401 "licence suspendue"`.

`401` et non `403` : la clé ne vaut plus, c'est bien un défaut d'authentification, et le
site le traite déjà (`api.AuthError` → « Connectez-vous d'abord sur /app »).
`operator.py` n'est pas touché : on ne suspend jamais une `automated`, et son unique autre
chemin est le compte opérateur.

### 6.3 La page

`/app/ecarts.html`, par carte de clé (la pastille « clé suspendue » existe déjà,
`ecarts-page.js:50`) :

- clé active → bouton « Suspendre cette clé ». Un clic remplace le bouton par une
  confirmation **dans la page** — « Suspendre *Garage Leclerc* ? Ses appels seront refusés. »
  + « Oui, suspendre » / « Annuler ». Jamais `confirm()` : rien du site n'en ouvre, et une
  boîte du navigateur ne se capture pas.
- clé suspendue → pastille « clé suspendue » + bouton « Rétablir », même confirmation.
- pendant l'appel : boutons désactivés ; au retour, la carte se repeint depuis la réponse
  (`active`) sans recharger la page ; en cas d'échec, une ligne d'erreur sous la carte et
  l'état d'avant.
- clé sans licence (`label === 'clé supprimée'`, `license_key_hash` nul) → aucun bouton.
- `?demo=1` : les boutons basculent l'état local sans réseau (`fixtures-ecarts.js`), ce qui
  permet la capture des deux états.

Capture `docs/site-v0-ecarts.png` refaite en `?demo=1`, montrant les deux boutons et une
confirmation ouverte. C'est le seul fichier de `docs/` que ce lot touche.

---

## 7. Le contrat HTTP complet

### 7.1 `POST /v1/disappearances` (existant)

Corps inchangé (`intake.AbsenceIn`). `AbsenceOut.verdict` gagne **un** membre :

```python
verdict: Literal["unknown", "logged", "already", "first", "too_soon",
                 "held", "probable", "recorded"]
```

| Verdict | Quand | Ce qui est écrit |
|---|---|---|
| `unknown` | annonce inconnue | rien |
| `logged` | preuve autre qu'`absent` | rien (journalisé) |
| `already` | `disappeared_at` déjà posé | la constatation est enregistrée, la réclamation `absence` posée |
| `first` | première constatation de cette voix | `absent_since`, `next_detail_crawl`, une ligne `absence_reports` |
| `too_soon` | même annonce, moins de 6 h depuis `absent_since` | la ligne `absence_reports` (créée ou rafraîchie) |
| `held` | garde-fou de flotte | la ligne `absence_reports` seulement |
| `probable` | ≥ 6 h, une seule voix (marchand) | `probably_gone_at = absent_since` |
| `recorded` | ≥ 6 h, deux voix distinctes, ou le robot seul (§2.4) | `disappeared_at = absent_since` |

`probable` n'est pas un échec : le panneau peut l'annoncer tel quel (« absence signalée, à
confirmer »). L'extension lit ce champ aujourd'hui pour afficher un état
(`extension/` est hors périmètre de ce lot : la valeur inconnue doit rester sans effet chez
elle, à vérifier en lecture avant livraison).

### 7.2 Ce que les lectures exposent

| Route | Ajout |
|---|---|
| `GET /v1/market` | `ItemOut.probably_gone_at: datetime \| None` — posé pour tous, y compris ceux à qui l'annonce reste visible ; c'est la mention « disparition probable, à confirmer » |
| `GET /v1/follows/feed` | `probably_gone_at` + `flags.probably_gone: bool` (§4.4) |
| `GET /v1/listings/{site}/{site_id}` | `SignalsOut.probably_gone_at: datetime \| None` — le panneau et la fiche du site |
| `POST /v1/listings/batch` | hérite de `SignalsOut` ; le filtre `disappeared_at.is_(None)` de `main.py:89` **ne change pas** : une probable continue d'être servie |
| `GET /v1/divergences` | rien de neuf dans la forme ; le champ `revived` apparaît dans les `field` possibles |

Le site affiche la mention sur la carte de marché (`web/js/facts.js`, qui porte déjà « a
disparu ») et sur la fiche. Le panneau de l'extension la portera au lot suivant : `extension/`
est interdit ici, et la valeur est disponible dès celui-ci.

### 7.3 Les deux routes neuves

Voir §6.1. Réponse typée dans `licenses.py` (`LicenseStateOut`), pas dans `schemas.py`
(145 lignes).

---

## 8. Le découpage — aucun fichier au-delà de 150 lignes

| Fichier | Avant | Après | Ce qu'il porte |
|---|---|---|---|
| **`absence_models.py`** *(neuf)* | — | ~40 | `AbsenceReport` et la justification de sa clé primaire |
| **`absence_scope.py`** *(neuf)* | — | ~75 | `actor_of`, `report`, `count_actors`, `reports_of`, `clear`, `visible`, `quiet_for` — le seul module qui sache ce qu'est une voix |
| **`fleet_guard.py`** *(neuf)* | — | ~50 | `fleet()` et ses trois constantes, déménagées mot pour mot de `disappearance.py` |
| **`revival.py`** *(neuf)* | — | ~65 | `apply()` : la levée, sa règle par état, l'écart journalisé |
| **`licenses.py`** *(neuf)* | — | ~60 | `POST …/suspend`, `POST …/restore`, `LicenseStateOut` |
| **`migration_sql_absence.py`** *(neuf)* | — | ~35 | le SQL de 017 |
| `disappearance.py` | 144 | ~140 | −35 (`fleet` sort), +30 (probable/ferme, `absence_scope`) ; le docstring passe de trois règles à quatre |
| `divergence.py` | 141 | ~139 | −4 (`_absence` sort, §5.3), +2 (`revived` dans `on_absence`) |
| `recheck.py` | 89 | ~99 | `mark_revival` |
| `observations.py` | **150** | **150** | une ligne remplacée, import glissé dans l'existant |
| `market_query.py` | 148 | 149 | un import, une clause, une colonne au `select` sur une ligne existante |
| `alert_rules.py` | 135 | ~137 | `quiet_for` en place de `absent_since.is_(None)` |
| `auth.py` | 123 | ~129 | « licence suspendue » sur les deux branches |
| `models.py` | 129 | 131 | `probably_gone_at` + réexport |
| `market_items.py` | 74 | 76 | le champ et sa sortie |
| `feed_query.py` | 122 | 125 | le champ et le drapeau |
| `signals.py` | 147 | 148 | une entrée du dictionnaire |
| `schemas.py` | 145 | 146 | `SignalsOut.probably_gone_at` |
| `main.py` | 148 | 149 | `include_router(licenses.router)`, import dans le tuple existant |
| `migration_registry.py` | 37 | 41 | l'entrée 017 |
| `revisit.py` | 149 | **149** | **inchangé** (§5.1) |
| `web/js/suspension.js` *(neuf)* | — | ~45 | l'automate de confirmation, pur, sans DOM |
| `web/js/ecarts-page.js` | 107 | ~135 | les boutons et la confirmation |
| `web/js/api-ecarts.js` | 11 | ~28 | `suspend`, `restore` |
| `web/js/fixtures-ecarts.js` | 84 | ~95 | la bascule locale en démo |
| `web/js/ecarts.js` | 92 | 93 | `revived` dans `FIELD_LABELS` |
| `web/css/views.css` | — | +~15 | le bouton, la confirmation |

Trois fichiers frôlent la limite (`observations.py` 150, `market_query.py` 149,
`main.py` 149) : toute addition ultérieure passe par un voisin, comme d'habitude.

---

## 9. Les tests, avec la ligne qu'ils font rougir

Compteurs de départ : `api` **996**, `web` **196**, `extension` **438** (inchangé, hors
périmètre). Attendu à la livraison : `api` **~1020**, `web` **~206**.

Chaque test neuf est prouvé en cassant la ligne nommée puis en la restaurant. Aucun ne lit
l'horloge : `NOW`/`LATER` de `test_disappearance.py`, `clock` pour les routes.

### `api/tests/test_absence_accounts.py` *(neuf)*

| Test | Ligne rendue rouge |
|---|---|
| `test_two_sightings_from_one_merchant_only_make_it_probable` | `disappearance`, la branche `probable` (`listing.probably_gone_at = listing.absent_since`) |
| `test_two_merchants_six_hours_apart_confirm_the_disappearance` | la condition `count_actors(…) >= 2` |
| `test_two_keys_of_one_account_never_confirm_alone` | `absence_scope.actor_of`, `return f"acct:{license_.account_id}"` |
| `test_the_crawler_and_its_owners_extension_are_two_voices` | `absence_scope.actor_of`, l'ordre `if license_.automated or …` **avant** le compte (§3.1) |
| `test_a_key_without_account_counts_for_itself` | `absence_scope.actor_of`, `return f"key:{…}"` |
| `test_the_robot_confirms_alone` | `disappearance.AUTOMATED_CONFIRMS_ALONE` |
| `test_the_second_sighting_keeps_the_first_instant` | `absence_scope.report`, le `on_conflict_do_update` qui ne touche pas `first_at` |
| `test_a_second_voice_too_soon_writes_nothing` | `if now - listing.absent_since < CONFIRM_DELAY` (inchangée — test de non-régression du délai, obligatoire : c'est la seule qui retient deux comptes complices) |
| `test_the_fleet_guard_holds_a_probable_too` | l'appel au garde-fou **avant** la branche `probable` |
| `test_a_probable_stays_in_the_revisit_queue_at_rank_zero` | `revisit.due`, `Listing.disappeared_at.is_(None)` (124) — prouve que `revisit.py` n'avait pas à changer |

### `api/tests/test_revival.py` *(neuf)*

| Test | Ligne rendue rouge |
|---|---|
| `test_any_key_lifts_a_probable` | `revival.apply`, la branche `probably_gone_at is not None` |
| `test_a_declarant_never_lifts_its_own_firm_disappearance` | le test d'appartenance `actor in declarants` |
| `test_a_distinct_account_lifts_a_firm_disappearance` | la remise à NULL des trois colonnes |
| `test_a_firm_disappearance_written_before_this_lot_is_lifted_by_anyone` | `if not declarants:` (les fermes existantes, §5.5) |
| `test_the_lift_journals_one_divergence_per_declaring_actor` | l'ajout de `Divergence(field="absence", …)` |
| `test_the_delay_counts_from_the_first_sighting` | `observed_at=report.first_at` |
| `test_the_robot_is_never_journalled` | `if report.automated: continue` |
| `test_a_human_lift_says_so_in_the_journal` | `robot_value = "présente" if … else "revue en ligne"` |
| `test_the_history_survives_a_revival` | l'absence de toute écriture sur `price_points`/`first_seen` dans `revival.apply` |
| `test_a_listing_never_absent_costs_no_query` | la sortie immédiate en tête d'`apply` (compteur de requêtes) |
| `test_a_merchant_reviving_a_firm_disappearance_is_marked` | `recheck.mark_revival` |

### `api/tests/test_licenses_suspend.py` *(neuf)*

| Test | Ligne rendue rouge |
|---|---|
| `test_the_operator_suspends_a_key` | `licenses.suspend`, `target.active = False` |
| `test_a_suspended_key_is_refused_everywhere` | `auth.resolve:27`, `not license_.active` (existante — prouve la promesse du §6.2) |
| `test_a_suspended_key_is_told_it_is_suspended` | la branche « licence suspendue » d'`auth.require_license` |
| `test_the_operator_restores_a_key` | `licenses.restore` |
| `test_suspending_twice_changes_nothing` | l'absence de garde sur l'état d'avant (idempotence) |
| `test_an_automated_license_is_never_suspended` | `if target.automated: raise 403` |
| `test_the_operator_cannot_suspend_itself` | la comparaison `key_hash`/`account_id` avec l'appelant |
| `test_an_unknown_hash_is_a_404` | `if target is None: raise 404` |
| `test_a_merchant_cannot_suspend_anyone` | `require_operator` sur les deux routes |
| `test_the_route_refuses_a_raw_key_in_the_path` | `session.get(License, key_hash)` et non `by_key_or_hash` |

### Additions aux fichiers existants

| Fichier | Test | Ligne |
|---|---|---|
| `test_market.py` | `test_a_probable_leaves_the_market_of_the_account_that_declared_it` | `absence_scope.visible`, le `~mine` |
| `test_market.py` | `test_a_probable_stays_visible_to_everyone_else` | le `or_(probably_gone_at.is_(None), …)` |
| `test_market.py` | `test_the_market_says_a_listing_is_probably_gone` | `market_items.item_of`, `"probably_gone_at"` |
| `test_alert_rules.py` | `test_no_alert_on_what_this_account_believes_gone` | `absence_scope.quiet_for`, `actor ==` |
| `test_alert_rules.py` | `test_the_robots_doubt_silences_everyones_alerts` | `quiet_for`, `AbsenceReport.automated.is_(True)` |
| `test_alert_rules.py` | `test_a_merchant_no_longer_silences_a_competitors_alerts` | la disparition de `Listing.absent_since.is_(None)` de `_alert_query` |
| `test_feed.py` | `test_a_followed_listing_probably_gone_stays_in_the_feed_and_says_so` | `feed_query._feed_item`, `"probably_gone"` |
| `test_signals.py` | `test_the_panel_sees_the_doubt` | `signals_for`, `"probably_gone_at"` |
| `test_divergence.py` | `test_the_robot_no_longer_journals_the_absence_itself` | la suppression de `_absence` de `_verify` (le test existant `absence` **déménage** vers `test_revival.py`) |
| `test_divergence.py` | `test_a_resurrection_the_robot_contradicts_is_journalled` | `divergence.on_absence`, la branche `revived` |
| `test_migrations.py` | couvert par le comparateur de schéma existant | `migration_sql_absence.ABSENCE_REPORTS` |

### `web/tests/suspension.test.mjs` *(neuf)* et `ecarts.test.mjs`

| Test | Ligne |
|---|---|
| `une clé active propose la suspension` | `suspension.actionFor`, le cas `active` |
| `une clé suspendue propose le rétablissement` | le cas `!active` |
| `une clé supprimée ne propose rien` | `if (!lic.license_key_hash) return null` |
| `la confirmation nomme la clé` | le libellé de `confirmLabel` |
| `annuler referme la confirmation sans appel` | la transition `pending → idle` |
| `un échec rend l'état d'avant` | la branche d'erreur de `ecarts-page` |
| `le libellé du champ « résurrection »` | `ecarts.FIELD_LABELS.revived` |

---

## 10. Les pièges

**10.1 Le crawler d'Alexis ET son extension : deux clés, un même compte.** Le piège coûteux.
Si `actor_of` regardait le compte avant `automated`, et que la clé du crawler est rattachée
au compte d'Alexis (`attach_account.py` sait le faire, rien ne l'interdit, et
`auth.of_account:56-62` prévoit explicitement « une machine rattachée au même humain »),
alors robot et extension seraient **une seule voix** : plus aucune disparition ferme ne
s'écrirait jamais, et aucun test qui ne regarde qu'une clé ne le dirait. D'où l'ordre du
§3.1 et le test `test_the_crawler_and_its_owners_extension_are_two_voices`. À vérifier en
lecture seule avant de livrer : `select label, automated, account_id from licenses;` — si
la clé du crawler porte un `account_id`, ce lot est précisément ce qui la sauve.

**10.2 Une disparition ferme existante contredite.** La base en porte, écrites sans aucun
`absence_reports`. Ne pas les rétro-remplir (ce serait inventer des déclarants), ne pas les
annuler (ce serait perdre des faits vrais), ne pas les traiter comme « déclarées par
personne donc indéboulonnables » (ce serait un changement de comportement silencieux). La
règle `if not declarants: n'importe quelle voix lève` est **exactement** le comportement
d'aujourd'hui (`observations.record:141`), et c'est la seule qui ne surprenne personne.
Un test à elle.

**10.3 Une annonce republiée à l'identique n'est pas une résurrection.** Deux mécaniques
voisines qu'il ne faut pas coudre ensemble : la **republication** du lot E
(`signals.py:96-101`, `publication.apply`, `bumped_at` ≥ `BUMP_MIN_DAYS` après
`published_at`) dit qu'un vendeur a réactualisé ou reposté **la même annonce, même
`site_id`** ; la **résurrection** de ce lot dit qu'une annonce qu'on croyait partie répond
encore. Elles peuvent arriver ensemble et restent indépendantes : `revival.apply` ne lit ni
n'écrit `bumped_at` ni `site_published_*`, et `publication.apply` (appelé ligne 143, après)
ne lit aucune colonne d'absence. Une annonce vraiment repostée par le vendeur porte un
**autre `site_id`** : c'est une autre `listings`, l'ancienne disparaît pour de bon, et
`fingerprint` les rapproche sans les confondre. Rien à écrire, tout à ne pas mélanger — et
un commentaire dans `revival.py` qui le dit, parce que la prochaine lecture y pensera.

**10.4 Le journal des écarts devient écrivable par un marchand.** Une observation vivante
d'un marchand journalise une ligne contre la clé qui avait déclaré l'absence. Deux marchands
pourraient donc se noircir mutuellement. Trois remparts, aucun automatique : `robot_value`
distingue « présente » (le robot) de « revue en ligne » (un humain) (§5.3) ; la page
opérateur classe et ne conclut jamais (`docs/roadmap.md` § Lot Corpus, point 3) ; la
suspension reste à la main. Ce qu'il ne faut **pas** faire : pondérer, scorer, ou suspendre
automatiquement.

**10.5 La résurrection en boucle.** Fermée par `recheck.mark_revival` (§5.2), pas par un
refus : refuser la levée rendrait `disappeared_at` de nouveau irréversible et on aurait
tourné en rond.

**10.6 `already` enregistre quand même.** Une constatation sur une annonce déjà ferme doit
écrire sa ligne `absence_reports` avant de rendre `already` : sinon un deuxième déclarant
n'est jamais enregistré, et la règle de levée (§5.5) le prendrait pour une voix distincte.

**10.7 Le compteur d'acteurs se lit sous le verrou.** `observe` prend déjà
`with_for_update()` sur l'annonce (108). Le `INSERT … ON CONFLICT` et le `count` se font
après, donc sous ce verrou : deux constatations simultanées de deux comptes ne peuvent pas
lire « un acteur » toutes les deux. À prouver avec la fixture `concurrently` si le temps le
permet — sinon c'est le verrou existant qui répond, et il est déjà éprouvé
(`test_concurrency.py`).

**10.8 `probably_gone_at` n'est jamais effacé par l'écriture de la ferme.** On pose
`disappeared_at` et on laisse `probably_gone_at` : il dit quand le doute est né, la seconde
dit quand il a été tranché. Deux dates, deux faits. La lecture n'expose la probable que
lorsque `disappeared_at` est nul.

---

## 11. Ce que la feuille de route devra dire (docs/ interdit ici)

Section à ajouter à `docs/roadmap.md`, après « Lot Corpus », rédigée par qui livrera le
lot :

> ## Lot « Disparition » — décidé le 2026-09-25, après le lot Corpus
>
> Le lot Corpus avait signalé deux réserves sans les corriger. Elles sortent ensemble :
> deux constatations d'absence de n'importe quelle clé écrivaient une disparition
> irréversible — un marchand pouvait effacer les annonces d'un concurrent —, et rien ne
> basculait `License.active` par HTTP.
>
> 1. **Deux voix distinctes pour une disparition ferme.** Délai de 6 h conservé. Une voix =
>    un compte ; deux clés d'un même compte ne comptent qu'une fois ; une clé sans compte
>    compte pour elle-même ; **le robot est toujours sa propre voix et confirme seul** — sa
>    clé est locale, il fait foi (point 3 du lot Corpus), et exiger de lui une seconde voix
>    rendrait `disappeared_at` presque mort.
> 2. **La disparition probable** (`listings.probably_gone_at`, migration 017) : deux
>    constatations d'un même marchand. L'annonce sort **du marché et des alertes de ce
>    compte seulement**, reste visible aux autres avec la mention « disparition probable, à
>    confirmer », est marquée « à vérifier » et passe au rang 0 de la revisite. Elle est
>    transitoire : le prochain passage du robot la confirme ou la lève.
> 3. **Réversible.** Une observation vivante lève l'absence — n'importe quelle voix pour une
>    probable, une voix distincte des déclarantes pour une ferme — remet `disappeared_at`,
>    `probably_gone_at` et `absent_since` à null, garde tout l'historique, et journalise un
>    écart « absence » avec son délai sur chaque voix déclarante (jamais sur le robot). Une
>    résurrection par un marchand est elle-même marquée (`revived`) et jugée au passage
>    suivant.
> 4. **Suspension à la main, opérateur seulement** : `POST /v1/licenses/{key_hash}/suspend`
>    et `…/restore`, bouton et confirmation sur `/app/ecarts.html`. Jamais une licence
>    automatique, jamais celle de l'opérateur. Une clé suspendue reçoit 401 « licence
>    suspendue ». Jamais automatique : le journal classe, l'humain tranche.
>
> Le garde-fou de flotte (plus d'une disparition pour trois revisites abouties sur 24 h →
> écritures suspendues) couvre les probables comme les fermes. Les disparitions fermes
> écrites avant ce lot restent, jusqu'à ce qu'une observation les contredise.
>
> Reste après ce lot : le panneau de l'extension doit afficher « disparition probable, à
> confirmer » (`extension/` était hors périmètre) ; le champ est exposé par l'API depuis ce
> lot.

---

## 12. L'ordre de livraison

1. `absence_models.py`, `migration_sql_absence.py`, registre 017 — `test_migrations.py` seul
   juge, rien d'autre ne bouge.
2. `pg_dump` vers `~/adscope-backups/`, puis application de 017.
3. `fleet_guard.py` (déménagement pur, suite verte sans test neuf).
4. `absence_scope.py` + `disappearance.py` : `probable`, `recorded`, `already`.
   `test_absence_accounts.py`.
5. `revival.py` + `observations.py:141` + `divergence.py` + `recheck.mark_revival`.
   `test_revival.py`.
6. Le filtrage : `market_query`, `alert_rules`, `market_items`, `feed_query`, `signals`,
   `schemas`.
7. `licenses.py` + `auth.py` + `main.py`. `test_licenses_suspend.py`.
8. Le web : `suspension.js`, `api-ecarts.js`, `ecarts-page.js`, `fixtures-ecarts.js`, CSS.
9. Capture `docs/site-v0-ecarts.png`.
10. Suites vertes (`api`, `web`, `extension`), **puis seulement**
    `launchctl kickstart -k gui/$UID/fr.adscope.api`.

Les étapes 4 et 5 ne se livrent pas séparément en production : entre les deux, une probable
existe sans pouvoir être levée. Un seul commit les porte, ou deux commits et un seul
redémarrage.
