# Lot F1 — Alertes : plan d'exécution

Architecte, 2026-09-21. Aucun code écrit. Périmètre lu : `api/adscope_api/*`
(auth, sessions, login_tokens, follows, feed_query, market*, naming,
migration_registry, models, observations, usage), `api/tests/conftest.py`,
`web/js/*`, `web/css/views.css`, `docs/roadmap.md`, `docs/panneau-conception.md`.

Ce document tranche. Chaque ambiguïté du cahier est décidée ici, avec la raison,
et l'exécution n'a plus à choisir.

---

## 0. Ce qui tient le lot en une phrase

Une **recherche enregistrée** est un jeu de filtres du marché, nommé, rattaché à
un compte. Chaque matin, un script rejoue ces filtres contre `market_query.core`
et le feed des suivis contre `feed_query.feed_for`, garde ce qui n'a jamais été
dit, en fait quinze lignes, et pose un email dans une table locale. Rien de
nouveau n'est calculé sur le marché : **tout le lot est un assemblage de ce qui
existe**, plus un journal d'unicité et un rendu.

---

## 1. Schéma — migration `013_alerts`

### Où le SQL vit

`migration_registry.py` tient **147 lignes** : la migration 013 y ajouterait une
quarantaine de lignes de SQL et casserait le plafond. Le SQL part donc dans
**`migration_sql_alerts.py`** (neuf), sur le précédent exact de
`migration_sql.py` (sorti pour la même raison au lot 3a), et le registre gagne
deux lignes :

```python
from .migration_sql_alerts import ALERTS_TABLES
...
    # Les alertes : quatre tables neuves, rien des 53 000 annonces touché. …
    ("013_alerts", ALERTS_TABLES),
```

Les tables ORM vivent dans **`alert_models.py`** (neuf), réexporté par
`models.py` avec `# noqa: F401`, comme `follow_models` et `usage_models` — sans
quoi `Base.metadata` ne les porte pas et `create_all` des tests ne les crée pas.

### `saved_searches`

| colonne | type | note |
|---|---|---|
| `id` | serial PK | |
| `account_id` | integer NOT NULL → `accounts(id)` ON DELETE CASCADE | **le compte, pas la licence** |
| `name` | varchar(80) NOT NULL | rogné, non vide |
| `query` | text NOT NULL | la chaîne de requête du marché, **normalisée à l'écriture** |
| `notify_drops` | boolean NOT NULL DEFAULT true | |
| `notify_new` | boolean NOT NULL DEFAULT **false** | les sites le font déjà, en temps réel |
| `min_age_days` | integer NOT NULL DEFAULT 30 | seuil de **règle** |
| `min_drop_pct` | integer NOT NULL DEFAULT 3 | |
| `paused` | boolean NOT NULL DEFAULT false | |
| `created_at` | timestamptz NOT NULL | **le point de départ** : rien d'antérieur n'est dit |

Index : `ix_saved_searches_account (account_id, id)`.

`query` est du `text` et non du `varchar` : le vocabulaire des filtres grossira
(le lot 4 en a ajouté six en un jour), il n'a pas de longueur utile à borner.
Borne applicative : 2 000 caractères à l'écriture, 422 au-delà.

### `account_settings`

| colonne | type | note |
|---|---|---|
| `account_id` | integer PK → `accounts(id)` ON DELETE CASCADE | une ligne par compte |
| `digest_enabled` | boolean NOT NULL DEFAULT true | l'email du matin |
| `include_follows` | boolean NOT NULL DEFAULT true | les suivis dans l'email |
| `unsubscribe_token_hash` | varchar(64) NOT NULL UNIQUE | sha256, jamais le secret |
| `created_at` | timestamptz NOT NULL | **l'époque des alertes de suivi** |

`created_at` n'est pas décoratif : les recherches ont leur propre point de
départ, **les suivis n'en avaient pas**. Sans lui, le premier email d'un compte
déverserait six mois de baisses sur les annonces suivies depuis juillet. Le
plancher d'une alerte de suivi est donc `max(follow.followed_at, settings.created_at)`.

La ligne se crée paresseusement (`alert_settings.settings_of`), à la première
lecture du réglage **ou** au premier passage du script : c'est là que le jeton de
désabonnement est frappé.

### `alerts_sent` — le journal d'unicité

| colonne | type |
|---|---|
| `account_id` | integer NOT NULL → `accounts(id)` ON DELETE CASCADE |
| `kind` | varchar(8) NOT NULL — `drop` / `new` / `crossed` / `gone` |
| `listing_id` | integer NOT NULL → `listings(id)` ON DELETE CASCADE |
| `ref` | varchar(40) NOT NULL |
| `sent_at` | timestamptz NOT NULL |

`PRIMARY KEY (account_id, kind, listing_id, ref)` — c'est la contrainte
d'unicité demandée, portée par la clé primaire plutôt que par un index à part.
Index `ix_alerts_sent_listing (listing_id)` : la colonne qui référence, que
Postgres n'indexe pas seule — sans lui, supprimer une annonce balaie le journal
en entier pour honorer la cascade (même raison que `ix_follows_listing`).

**Ce que vaut `ref`, décidé :**

| `kind` | `ref` | pourquoi |
|---|---|---|
| `drop` | l'horodatage ISO-8601 UTC à la seconde du relevé qui constate la baisse | voir ci-dessous |
| `new` | `first_seen` | une annonce n'est neuve qu'une fois |
| `crossed` | `30` / `60` / `90` | un seuil ne se franchit qu'une fois |
| `gone` | `gone` | `disappeared_at` est irréversible |

**Décision : `ref` d'une baisse est l'horodatage, pas l'identifiant du point de
prix.** Raison décisive : la même annonce peut être à la fois dans une recherche
enregistrée et dans les suivis. Le chemin « recherche » lit `price_points` en SQL
et connaîtrait l'`id` ; le chemin « suivis » passe par `feed_query`, qui ne rend
que `at`. Avec l'horodatage, les deux chemins produisent **la même clé** et la
baisse est dite une seule fois, dans une seule ligne. Avec l'`id`, elle serait
dite deux fois. Helper unique : `alert_journal.ref_at(dt)`.

### `digests` — la boîte d'envoi

| colonne | type | note |
|---|---|---|
| `id` | serial PK | |
| `account_id` | integer NOT NULL → `accounts(id)` ON DELETE CASCADE | |
| `day` | date NOT NULL | le jour UTC du courrier |
| `token` | varchar(24) NOT NULL UNIQUE | `secrets.token_urlsafe(16)`, 22 caractères |
| `subject` | varchar(200) NOT NULL | |
| `text` | text NOT NULL | |
| `html` | text NOT NULL | |
| `created_at` | timestamptz NOT NULL | |
| `visits` | integer NOT NULL DEFAULT 0 | |
| `first_visit_at` | timestamptz | |

`UNIQUE (account_id, day)` — **c'est elle, et rien d'autre, qui rend le script
idempotent**. Index `ix_digests_account (account_id, created_at)` pour la liste.

**Aucune colonne `email`** : l'adresse se résout à l'envoi par
`accounts.email`. Une adresse recopiée serait une adresse périmée le jour où le
marchand la change, et une donnée personnelle de plus à effacer à la fermeture
d'un compte.

---

## 2. Découpage en fichiers

Tous ≤ 150 lignes, une responsabilité chacun. Neufs sauf mention.

### API

| fichier | responsabilité | ~lignes |
|---|---|---|
| `alert_models.py` | les quatre tables | 90 |
| `migration_sql_alerts.py` | le SQL de la 013 | 55 |
| `market_params.py` | un jeu de filtres du marché : lecture d'une chaîne de requête, réécriture canonique, traduction en arguments de `market_query.core` | 80 |
| `saved_searches.py` | routeur CRUD `/v1/searches` | 120 |
| `alert_settings.py` | la ligne de réglage, le jeton, routeur `/v1/alerts/*` | 110 |
| `alert_rules.py` | les trois règles → candidats d'alerte | 140 |
| `alert_journal.py` | ce qui a déjà été dit : `unseen`, `mark`, `ref_at` | 60 |
| `digest_build.py` | sélection, ordre, quinze lignes, sujet | 100 |
| `digest_text.py` | la version texte, les dates courtes françaises | 90 |
| `digest_html.py` | la version HTML, styles en ligne, échappement | 130 |
| `digest_send.py` | la transaction d'un compte : bâtir, poser, marquer | 90 |
| `digests.py` | routeur `/v1/digests` : liste, lecture, visite | 100 |
| `scripts/send_digests.py` | la ligne de commande | 70 |

Retouches :

- **`auth.py`** (97) : `require_account`, ~12 lignes. La porte des alertes.
- **`market_query.py`** (144) : **une ligne** — `Listing.id` entre dans la liste
  sélectionnée de `core`. Voir § 4.
- **`market.py`** (72) : `get_market` construit un `MarketParams` et lui demande
  ses arguments de `core`, au lieu d'appeler `combined`/`parse_ranges` lui-même.
  Neutre pour le contrat, ±0 ligne.
- **`models.py`** (127) : une ligne d'import.
- **`main.py`** (141) : trois `include_router` et l'ajout aux imports → **145**.
  **Piège : il ne reste la place que pour trois.** Les trois routeurs du lot sont
  `saved_searches`, `alert_settings`, `digests` — pas un de plus.
- **`migration_registry.py`** (147) : deux lignes + un import → 150. À la ligne
  près. Le lot suivant devra sortir autre chose.

### Site

| fichier | responsabilité | ~lignes |
|---|---|---|
| `js/api-alerts.js` | les appels du lot, réutilisant `request` exporté d'`api.js` | 70 |
| `js/fixtures-alerts.js` | le mode démo des alertes | 120 |
| `js/alerts.js` | la vue « Mes alertes » : assemblage des trois cartes | 90 |
| `js/alerts-searches.js` | la liste des recherches : ouvrir, cocher, pause, supprimer | 140 |
| `js/alerts-outbox.js` | « Emails envoyés » + l'iframe bac à sable | 90 |
| `js/save-search.js` | « Enregistrer cette recherche » sur Le marché | 90 |
| `js/follows-sort.js` | les trois tris de Mes suivis, fonction pure | 40 |
| `js/digest-visit.js` | lire `?d=`, compter une fois, nettoyer l'URL | 35 |
| `desabonnement.html` + `js/unsubscribe.js` | la page hors session | 15 + 70 |
| `css/alerts.css` | les cartes de la page, l'iframe | 80 |

Retouches : `api.js` (103 → 106 : `request` exporté), `app.js` (95 → 102 : la
route `#/alertes`, l'entrée de navigation, l'appel à `digest-visit`),
`follows.js` (105 → 130 : le segment de tri), `market.js` (134 → 140 : le
bouton), `index.html` (une feuille de style).

**Piège nommé : `fixtures.js` tient 149 lignes et `api.js` 103.** Les fixtures
d'alertes ne passent **pas** par `fixtures.js` ; `api-alerts.js` importe
`fixtures-alerts.js` directement. Aucun des deux fichiers historiques ne grossit
au-delà de son plafond.

---

## 3. Contrat HTTP

Porte commune : **`require_account`** — cookie de session, ou clé `Bearer`
**rattachée à un compte**. Implémentation : un mince habillage de
`require_license`, qui tient déjà les deux entrées, le CSRF et le glissement de
session.

```python
def require_account(license_=Depends(require_license)) -> int:
    if license_.account_id is None:
        raise HTTPException(status_code=403, detail="compte requis")
    return license_.account_id
```

Codes communs : **401** sans session ni clé valable · **403** clé sans compte, ou
écriture sans `X-Adscope: 1` · **404** ressource d'un autre compte (jamais 403 :
un 403 confirmerait qu'elle existe) · **422** corps ou chaîne de filtres
invalides.

### Recherches enregistrées

```
GET    /v1/searches                → 200 [SearchOut]      (par `created_at`, puis `id`)
POST   /v1/searches                → 201 SearchOut
GET    /v1/searches/{id}           → 200 SearchOut | 404
PUT    /v1/searches/{id}           → 200 SearchOut | 404
DELETE /v1/searches/{id}           → 204                  (204 aussi si déjà absente)
```

`SearchIn` (POST et PUT, **corps complet** — pas de PATCH) :

```json
{ "name": "Clio IV diesel 59-62", "query": "brand=Renault&model=Clio&fuel=diesel&department=59&department=62",
  "notify_drops": true, "notify_new": false, "min_age_days": 30, "min_drop_pct": 3, "paused": false }
```

`name` 1–80 après rognage · `query` ≤ 2 000, **validée et renormalisée** par
`MarketParams` (un paramètre inconnu, une valeur hors vocabulaire, une fourchette
à l'envers → 422 avec le détail existant) · `min_age_days` 0–3650 ·
`min_drop_pct` 1–90 · les trois booléens optionnels, aux défauts de la table.

**Décision : PUT complet plutôt que PATCH.** La page a l'objet entier en main
(elle vient de l'afficher), et « champ absent = ne pas toucher » est une règle
qu'aucun test ne protège bien. C'est déjà le choix de `PUT /v1/families`.

`SearchOut` = l'entrée + `id` + `created_at`. `query` est rendue **normalisée**,
pas telle que saisie : deux écrans identiques donnent une seule chaîne.

Plafond : **50 recherches par compte**, au-delà `409 « trop de recherches
enregistrées »`. Ce n'est pas de la défense décorative — c'est le script du matin
qui paie chaque recherche d'une requête sur 53 000 annonces.

### Réglage du compte

```
GET /v1/alerts/settings   → 200 { "digest_enabled": true, "include_follows": true }
PUT /v1/alerts/settings   → 200 (même corps)
```

Le `GET` crée la ligne si elle manque (et frappe le jeton). Le jeton n'est
**jamais** rendu par ces routes : il ne sort que dans le pied d'un email.

### Désabonnement

```
POST /v1/alerts/unsubscribe   { "token": "…" } → 200 { "digest_enabled": false } | 404
POST /v1/alerts/resubscribe   { "token": "…" } → 200 { "digest_enabled": true }  | 404
```

Non authentifiées. `X-Adscope: 1` exigé (le site le pose) — non pour le CSRF
(rien d'ambiant n'authentifie ici) mais parce qu'il **distingue un vrai clic d'une
requête fabriquée par un intermédiaire**.

### Boîte d'envoi

```
GET  /v1/digests?limit=20   → 200 [{ id, day, subject, created_at, visits, first_visit_at }]
GET  /v1/digests/{id}       → 200 { … , text, html } | 404
POST /v1/digests/visit      { "token": "…" } → 204 | 404
```

La liste ne porte **pas** les corps : vingt emails HTML, c'est une réponse à
plusieurs centaines de kilo-octets pour une page qui n'en affiche qu'un.
`POST /v1/digests/visit` est **non authentifiée** — celui qui arrive de son email
n'a pas encore de session — et ne stocke rien du visiteur : elle incrémente
`visits`, et pose `first_visit_at` seulement s'il est nul.

---

## 4. Rejouer une recherche contre `market_query` sans dupliquer les filtres

C'est le point technique du lot. Deux tentations à écarter : réécrire les filtres
dans le moteur d'alertes (ils divergeront), ou rappeler la route HTTP depuis le
script (indirection absurde).

### `market_params.py`

Un modèle Pydantic **ordinaire** (pas une dépendance FastAPI) qui porte
exactement les seize paramètres de filtre de `/v1/market` — `sort`, `limit`,
`offset` **exclus** : une recherche enregistrée est un filtre, pas une page.

```python
class MarketParams(BaseModel):
    brand: str | None = None
    model: str | None = None
    q: str | None = Field(default=None, max_length=120)
    seller_type: SellerType | None = None
    fuel: list[Fuel] = []
    gearbox: list[Gearbox] = []
    department: list[str] = []
    region: list[str] = []
    price_min: int | None = Field(default=None, ge=0)
    …
    min_age_days: int | None = Field(default=None, ge=0)
    dropped: bool | None = None

    @classmethod
    def from_query(cls, raw: str) -> "MarketParams": ...   # 422 sur un nom inconnu
    def to_query(self) -> str: ...                          # la forme canonique
    def core_kwargs(self) -> dict: ...                      # ce que `core` attend
```

`core_kwargs` fait **une seule fois** ce que la route faisait en ligne :
`department=combined(self.department or None, self.region or None)` et
`bounds=parse_ranges(...)`. `market.get_market` l'appelle désormais aussi : la
traduction filtres → `core` n'existe qu'ici, et les deux chemins ne peuvent plus
diverger.

**La dérive résiduelle, et son garde-fou.** La signature de la route doit rester
écrite à la main (FastAPI lit les paramètres de requête dans la signature). Un
filtre ajouté demain à `/v1/market` et oublié dans `MarketParams` serait ignoré
en silence par les alertes. **Un test le ferme** : les noms de paramètres
déclarés par `market.get_market` (via `inspect.signature`), moins
`{session, license_, sort, limit, offset}`, sont exactement les champs de
`MarketParams`.

### Ce que `core` doit rendre en plus

`market_query.core` sélectionne `site, site_id, brand, …` mais **pas
`Listing.id`**. Le moteur d'alertes en a besoin pour joindre les points de prix
à l'ensemble filtré. Réexprimer les filtres serait exactement la duplication
qu'on refuse.

**Décision : `Listing.id.label("id")` entre en tête de la liste sélectionnée de
`core`.** Une ligne. Sans effet sur le contrat : `market_items.item_of` lit la
ligne par nom de colonne et ne prendra pas `id` ; `facet_query` ne sélectionne
que ses propres colonnes sur la sous-requête ; `market_query.total` compte la
sous-requête. Un test garde que `/v1/market` ne rend toujours pas d'`id`.

---

## 5. Les règles, évaluées pour un « maintenant » donné

Signature commune : `(session, search|account, license_, now) -> list[dict]`.
Aucune fonction ne lit l'horloge. Le script est le seul à connaître l'instant, et
`--now` le remplace.

### Baisse (`alert_rules.drops_for`)

1. `query, _age, _delta = core(license_, now, **params.core_kwargs() | {"min_age_days": …})`
2. Trois conditions **propres à l'alerte**, ajoutées sur la requête :
   - `Listing.last_seen >= now - timedelta(hours=48)` — « vue il y a moins de 48 h ».
     **`last_seen`, jamais `last_revisit_at`** : le second dit seulement que la file
     a servi la fiche, pas qu'on l'a vue vivante.
   - `Listing.absent_since.is_(None)` — une absence en attente de confirmation
     n'est pas un argument de négociation.
   - `Listing.disappeared_at.is_(None)` est déjà dans `core`.
3. Les baisses, en SQL, avec une fenêtre :

```sql
lag(price)       OVER (PARTITION BY listing_id ORDER BY observed_at, id) AS prev
lag(observed_at) OVER (PARTITION BY listing_id ORDER BY observed_at, id) AS prev_at
WHERE confirmation IS FALSE AND listing_id IN (<les ids de la requête filtrée>)
```
   puis, à l'extérieur de la fenêtre :
   `prev IS NOT NULL AND price < prev AND observed_at > search.created_at
    AND (prev - price) * 100 >= min_drop_pct * prev`

   **La fenêtre porte sur toute la série, le filtre `created_at` s'applique
   après** : sinon le premier relevé postérieur à l'enregistrement n'aurait pas
   de prédécesseur et la baisse la plus récente serait invisible.
   `confirmation IS FALSE` est indispensable : un relevé hebdomadaire « inchangé »
   se lirait comme une variation de zéro.

4. Les lignes de l'étape 3 donnent les `listing_id` retenus ; on relit alors
   `query.where(Listing.id.in_(ids))` pour l'item complet (label, département,
   ancienneté, **baisse cumulée depuis le premier prix** = `price_delta_since_first`
   que `core` calcule déjà), et on assemble en Python.

   L'ordre compte : les baisses pilotent, l'item suit. L'inverse chargerait dix
   mille annonces pour en garder six.

5. `prev_at → observed_at` est **la fenêtre honnête** : « constatée entre le 14 et
   le 17 sept. ». Jamais « baissé le 17 » : on ne sait pas quel jour le vendeur a
   changé son prix, seulement entre quels deux relevés.

**Le `min_age_days` qui veut dire deux choses.** Le filtre du marché en porte un
(le marchand peut avoir enregistré « plus de 60 jours ») et la règle en a un
autre (défaut 30). Ils s'appliquent **tous les deux**, donc :
`min_age_days = max(params.min_age_days or 0, search.min_age_days)`. Commenté des
deux côtés.

### Nouvelle annonce (`alert_rules.new_for`)

Calculée **seulement si `search.notify_new`** — défaut faux, et c'est un choix
produit, pas une prudence : leboncoin et La Centrale poussent déjà cette alerte
en temps réel, nous arrivons après eux.

`query.where(Listing.first_seen > search.created_at)`, mêmes trois conditions
d'alerte. `ref = "first_seen"`.

### Suivis (`alert_rules.follows_for`)

**`feed_query.feed_for` est réutilisée telle quelle, jamais réécrite.**

Elle prend une **licence**, les recherches prennent un **compte** : le pont est
`auth.of_account(session, account_id, now)`. Un compte sans licence valable n'a
ni suivi ni marché — son courrier est vide, et le script ne doit pas trébucher
dessus (test nommé).

`since_days = 7`, et non 1. **Décision, avec sa raison** : le journal d'unicité
interdit déjà de redire une alerte ; une fenêtre de sept jours fait qu'un matin
manqué (machine éteinte, script non lancé) **se rattrape de lui-même** au matin
suivant, là où une fenêtre d'un jour perdrait cette journée pour toujours.

De chaque item du feed on tire au plus trois candidats :
`changes` → `drop` (un par changement en baisse, `ref = ref_at(change["at"])`) ·
`flags.crossed` → `crossed` (`ref = "30"|"60"|"90"`) · `flags.disappeared` →
`gone`. Plancher : `at > max(followed_at, settings.created_at)`.

---

## 6. Une alerte n'est dite qu'une fois

`alert_journal.unseen(session, account_id, candidates) -> list[dict]` : une
requête `IN` sur les clés des candidats, et l'on garde ceux qui n'y sont pas.

`alert_journal.mark(session, account_id, lines, now)` : `INSERT … ON CONFLICT DO
NOTHING` — deux exécutions concurrentes du script ne se marchent pas dessus.

**Déduplication dans le courrier lui-même, avant la base.** Une annonce peut être
à la fois suivie et dans une recherche : `digest_build` dédoublonne sur
`(kind, listing_id, ref)` **en gardant la première**, et les suivis sont
construits en premier. La ligne de suivi gagne, la ligne de recherche disparaît.
C'est pour cela que `ref` d'une baisse est un horodatage (§ 1).

---

## 7. L'email du matin

### Construction (`digest_build.py`)

- Suivis d'abord, dans l'ordre du feed (disparition, baisse, seuil).
- Puis les baisses des recherches, triées par **baisse cumulée** (la plus forte
  d'abord) puis **ancienneté** (la plus vieille d'abord) — ordre stable clos par
  `(site, site_id)`.
- Puis les nouvelles annonces, s'il en reste de la place.
- `MAX_LINES = 15`.
- **`if not lines: return None`** — rien à dire, pas de ligne de boîte d'envoi,
  pas d'email. C'est la règle qui décide si le produit est supportable.
- Sujet : `adscope — 6 baisses et 2 mouvements ce matin`, composé des comptes par
  nature. Jamais de nom de vendeur, jamais de modèle particulier dans le sujet.

### Une ligne

Libellé (`naming.label`, celui du site) · `23 900 € → 22 700 €` · `−1 200 €
depuis le premier prix` · `en ligne depuis 412 jours` · `constatée entre le 14 et
le 17 sept.` · `Hauts-de-Seine (92)` (`department_labels`) · lien vers le site
source (`urls.build`) · lien vers adscope.

**Jamais** : photo, nom ou identifiant de vendeur, le mot « vendue », un jugement
sur le vendeur. Un test lit les deux corps rendus et le vérifie mot par mot,
`seller_name` compris.

Les mois courts français (`janv.`, `févr.`, …) sont la même liste que
`web/js/format.js` : ils vivent dans `digest_text.py`, et `digest_html.py` les
importe de là. Une seule écriture des dates.

### Les liens

`config.public_url()` — jamais l'en-tête `Host`, et `http://localhost:8000` par
défaut, jamais `127.0.0.1` (le cookie de session est par hôte).

- ligne de recherche : `{base}/app/?d={token}#/marche?{query de la recherche}`
- ligne de suivi : `{base}/app/?d={token}#/suivis`
- « tout voir » : `{base}/app/?d={token}#/alertes`
- pied de désabonnement : `{base}/app/desabonnement.html?t={jeton brut}`

**`?d=` est dans la chaîne de requête, `#/route` dans le fragment** : le site lit
`location.search` pour `d` et `location.hash` pour la route. Les inverser rendrait
la mesure aveugle.

### HTML

Styles en ligne uniquement (aucune feuille externe ne survit à un client de
messagerie), registre du site : sol `#F4F5F7`, cartes blanches rayon 22 (rayon
assumé même si Outlook le carre), Manrope avec repli système, accent `#4F46E5`.
Une ligne = une carte, une chose par carte. Largeur fixe 600 px, table de mise en
page. Aucune image, donc aucun pixel espion nulle part.

**Tout texte venu d'une annonce passe par `html.escape`** — le libellé le premier :
il est composé à partir de ce que les sites écrivent, et un site peut écrire
`<`. Un test le prouve sur un libellé forgé.

### Envoi (`digest_send.py`, `scripts/send_digests.py`)

Aucun fournisseur d'email dans ce lot. **Une transaction par compte**, dans cet
ordre exact :

1. jeton frappé en Python (`token_urlsafe(16)`) — **avant** l'insertion, c'est
   pourquoi les liens peuvent le porter et qu'une seule écriture suffit ;
2. `INSERT INTO digests … ON CONFLICT (account_id, day) DO NOTHING RETURNING id` ;
3. **rien en retour → la journée est déjà servie : `rollback`, on passe au
   compte suivant, et le journal n'est pas marqué** ;
4. sinon `alert_journal.mark(...)`, puis `commit`.

L'ordre est l'idempotence. Marquer avant d'insérer condamnerait des alertes à ne
jamais être dites pour un courrier qui n'a jamais existé.

Ligne de commande :

```
cd api && ./.venv/bin/python -m scripts.send_digests [--dry-run] [--now 2026-09-21T07:00:00Z]
```

`--dry-run` : construit tout, écrit le résumé sur la sortie standard, **ne
commite rien**. `--now` : rejoue une date (l'instant est un paramètre partout, y
compris ici). Le script prend une fabrique de sessions en paramètre, pour qu'un
test l'appelle sur la base de test — **jamais sur `adscope`**.

Pas de planification dans ce lot (`scripts/` est hors périmètre). Le rapport de
fin de lot dira comment le lancer : une ligne de `launchd` ou de `cron` à 7 h,
qu'Alexis posera lui-même, quand le fournisseur d'email existera.

**Limite assumée, à écrire dans le rapport :** la ligne de boîte d'envoi vaut
« envoyé ». Tant qu'aucun fournisseur n'est branché, c'est vrai. Le jour où il le
sera, l'échec d'envoi devra soit rejouer, soit défaire le marquage.

---

## 8. Le désabonnement — mécanisme retenu

**Retenu : un jeton aléatoire long, propre au compte, stocké haché dans
`account_settings.unsubscribe_token_hash`, présenté en clair seulement dans le
pied des emails, consommé par un POST depuis une page statique du site.**

Écartés, et pourquoi :

- **`login_tokens`** (le lien magique) : un usage, un quart d'heure. Un email lu
  trois jours plus tard trouverait un lien mort, et un lien qui *connecte*
  donnerait une session à qui voulait juste ne plus rien recevoir.
- **Un HMAC signé** : impose un secret d'application, sa configuration, sa
  rotation, et son absence du dépôt à surveiller. Le dépôt n'a aucun secret
  aujourd'hui ; ce lot n'a pas à en introduire le premier.
- **Un GET qui désabonne** : les clients de messagerie et les analyseurs de liens
  **préchargent** les URL. Un GET mutant désabonnerait des gens qui n'ont jamais
  cliqué. C'est le piège classique, il est réel.

Le mécanisme retenu reprend exactement la forme des deux secrets déjà en place
(`sessions.hash_token`, `login_tokens`) : le secret ne rencontre aucune
comparaison octet par octet, il est réduit à son empreinte, et c'est l'empreinte
qui est en base. Il ne périme pas — un email vieux de six mois doit encore
pouvoir désabonner — et il n'ouvre **qu'un seul pouvoir** : basculer
`digest_enabled` sur un compte. Ce n'est pas une session.

Parcours : pied de l'email → `/app/desabonnement.html?t=…` (page statique, sans
session) → la page poste `{token}` avec `X-Adscope: 1` → « Vous ne recevrez plus
l'email du matin » + un bouton **Réactiver** (qui poste `resubscribe` avec le
même jeton). Un clic malheureux se répare sans se connecter.

---

## 9. Mesure d'usage interne

`?d={token}` sur chaque lien. À l'arrivée, `js/digest-visit.js` :

1. lit `d` dans `location.search` ;
2. en mode `?demo=1`, **ne fait rien** ;
3. poste `/v1/digests/visit` (sans attendre la réponse, un échec ne doit rien
   casser) ;
4. retire `d` de l'URL par `history.replaceState` — sans quoi un rechargement de
   page compterait une visite de plus.

Le jeton est un opaque de 22 caractères : il n'identifie aucune personne, il
n'est pas devinable (un `id` sériel le serait, et n'importe qui pourrait gonfler
le compteur d'un autre compte). Aucun pixel, aucun outil tiers, aucun cookie
ajouté. Déclarable tel quel dans la politique de confidentialité.

---

## 10. Le site

### Le marché — « Enregistrer cette recherche »

Un bouton dans la ligne du compte (`.compte-ligne`, à côté du tri). Cliqué, il
déplie **dans la page** un champ de nom et deux boutons (Enregistrer / Annuler) —
**jamais `window.prompt`**. Le nom est pré-rempli à partir des filtres posés
(« Renault Clio · diesel · Nord »), modifiable. `query` = `String(filterParams(filters))`,
la même fonction que l'URL et les facettes utilisent déjà : **le site n'a pas de
second sérialiseur**. Déconnecté ou en `?demo=1` : le bouton renvoie vers la
connexion plutôt que d'échouer.

### « Mes alertes » — `#/alertes`, entrée de navigation

Trois cartes, une chose par carte, registre consumer :

1. **Mes recherches** — une ligne par recherche : le nom, un résumé lisible des
   filtres, « Ouvrir » (qui pose `#/marche?<query>`), trois cases à cocher
   (baisses / nouvelles / en pause), les deux seuils, « Supprimer » (avec
   confirmation en place).
2. **L'email du matin** — deux interrupteurs : l'email actif, les suivis inclus.
3. **Emails envoyés** — la boîte d'envoi : jour, sujet, visites. Un email
   sélectionné se rend dans un `<iframe srcdoc="…" sandbox="">`. **`sandbox=""`
   est la restriction maximale** (ni scripts, ni même origine, ni formulaires).
   Vérifié : `dom.el` écarte `null` et `false`, **pas la chaîne vide** — `sandbox: ''`
   pose bien l'attribut, `sandbox: false` le supprimerait en silence. Piège nommé.

### Mes suivis — tri

Un segment à trois positions (baisse cumulée · ancienneté · récence), sur le
modèle de la bascule 24 h / 7 j déjà en place. Le tri est **pur et côté client**
(`follows-sort.js`) : le feed tient dans une poignée d'items, déjà chargés.
Clés : `price_delta_since_first` croissant (la plus forte baisse d'abord),
`age_days` décroissant, `last_change_at` décroissant. Égalités closes par
`(site, site_id)` pour un ordre stable entre deux affichages.

### Mode démo et mobile

`fixtures-alerts.js` sert trois recherches, un réglage, et trois emails dont un
avec un vrai corps HTML rendu (assez riche pour la capture). Toutes les dates
dérivent de `DEMO_NOW` (`fixtures-data.js`) — **aucune capture ne lit l'horloge**.
Rendu mobile : les cartes passent en colonne sous 640 px, l'iframe prend la
largeur, le segment de tri reste atteignable.

### Captures (exception nommée à l'interdit `docs/`)

`docs/site-v0-alertes.png` · `docs/site-v0-alerte-email.png` ·
`docs/site-v0-suivis-tri.png` · `docs/site-v0-alertes-mobile.png` — en `?demo=1`,
avec un navigateur lancé par l'exécutant.

---

## 11. Les tests à écrire, avec la ligne visée

Chaque test nomme la ligne de production qui le fait rougir, et l'exécutant le
**prouve en cassant cette ligne puis en la restaurant**. Aucun ne lit l'horloge.

### API — `api/tests/`

**`test_market_params.py`**
1. une chaîne enregistrée rejoue vers les mêmes arguments que la route →
   `MarketParams.core_kwargs`, la ligne `department=combined(...)`
2. **garde de dérive** : les paramètres déclarés par `market.get_market` moins
   `{sort, limit, offset, session, license_}` = les champs de `MarketParams`
3. un paramètre inconnu → 422 → la vérification des noms dans `from_query`
4. `to_query` est canonique : deux écritures du même filtre donnent une chaîne
5. `/v1/market` ne rend toujours pas d'`id` → la liste de `market_items.ItemOut`

**`test_saved_searches.py`**
6. création → relecture, `query` normalisée → le `where(account_id == …)` de la lecture
7. **IDOR** : la recherche d'un autre compte est 404 en GET, PUT, DELETE → le même `where`
8. clé `Bearer` sans compte → 403 → `if license_.account_id is None` d'`require_account`
9. POST sans `X-Adscope` → 403 → `sessions.check_csrf`
10. `notify_new` vaut faux par défaut → le `DEFAULT false` de la colonne
11. 51ᵉ recherche → 409 → la ligne du plafond
12. fourchette à l'envers dans `query` → 422 → `market_ranges.parse`

**`test_alert_rules.py`**
13. une baisse antérieure à `created_at` n'alerte pas → `observed_at > search.created_at`
14. une baisse sous le seuil n'alerte pas → la clause `(prev - price) * 100 >= pct * prev`
15. une annonce plus jeune que le seuil n'alerte pas → le `max(...)` du `min_age_days`
16. le `min_age_days` du filtre l'emporte s'il est plus haut → le même `max(...)`
17. une annonce non vue depuis 48 h n'alerte pas → `Listing.last_seen >= now - SEEN`
18. une annonce `absent_since` n'alerte pas → `Listing.absent_since.is_(None)`
19. un relevé `confirmation` n'est pas une baisse → `CHANGED` dans la fenêtre
20. la fenêtre honnête va du relevé précédent au relevé de la baisse → `lag(observed_at)`
21. la baisse cumulée part du **premier** prix, pas du précédent → `price_delta_since_first`
22. une recherche en pause ne rend rien → `where(paused.is_(False))`
23. `notify_new` faux → aucune nouvelle annonce → `if search.notify_new`
24. une nouvelle annonce antérieure à `created_at` n'alerte pas → `first_seen > created_at`
25. les suivis passent par `feed_for` et rien d'autre → l'appel dans `follows_for`
26. un compte sans licence valable rend une liste vide sans lever → le garde sur `of_account`

**`test_alert_journal.py`**
27. la même baisse deux jours de suite → une seule ligne → `unseen`
28. une seconde baisse, un autre horodatage → une ligne de plus → `ref_at`
29. suivi et recherche sur la même annonce → une seule ligne → la déduplication de `digest_build`
30. deux exécutions concurrentes ne lèvent pas → `on_conflict_do_nothing` de `mark`

**`test_digest.py`**
31. rien à dire → aucune ligne en boîte d'envoi → `if not lines: return None`
32. relancé le même jour, rien de plus → `ON CONFLICT (account_id, day) DO NOTHING`
33. relancé le même jour, **le journal n'a pas bougé** → le `rollback` de l'étape 3
34. quinze lignes au plus → `[:MAX_LINES]`
35. suivis d'abord, puis baisse cumulée, puis ancienneté → la clé de tri
36. un libellé portant `<` est échappé dans le HTML → `escape(...)`
37. ni nom de vendeur, ni « vendue », ni `<img` dans les deux corps → la liste des champs d'une ligne
38. les liens portent `?d={token}` avant le `#` → le constructeur de liens
39. le pied porte le jeton brut, et la base n'en a que l'empreinte → `hash_token`
40. `--dry-run` n'écrit rien → le `rollback` du script
41. `--now` rejoue une date donnée → le paramètre `now` du script

**`test_alert_settings.py`**
42. `GET` crée la ligne et frappe le jeton → `settings_of`
43. se désabonner coupe l'email, et le script saute le compte → `where(digest_enabled.is_(True))`
44. un jeton inconnu → 404, aucune ligne modifiée → la recherche par empreinte
45. se réabonner rallume → `resubscribe`

**`test_digests_routes.py`**
46. l'email d'un autre compte → 404 → le `where(account_id == …)`
47. la liste ne porte pas les corps → la liste de colonnes du `select`
48. une visite incrémente, la seconde n'écrase pas `first_visit_at` → `if row.first_visit_at is None`

**`test_migrations.py` (complété)**
49. la 013 s'applique sur une base vide et deux fois de suite sans erreur
50. le schéma après migration = le schéma de `create_all`

### Site — `web/tests/`

51. `api-alerts.test.mjs` — les requêtes bâties : chemins, `X-Adscope` sur les
    écritures, corps JSON → `buildRequest`
52. `follows-sort.test.mjs` — les trois ordres, égalités stables → chaque
    comparateur de `sortFeed`
53. `alerts-searches.test.mjs` — un nom vide n'enregistre pas ; aucun
    `window.prompt` ; la pause bascule ; la suppression demande confirmation
54. `save-search.test.mjs` — `query` = `String(filterParams(filters))`, le même
    sérialiseur que l'URL → la ligne d'appel
55. `digest-visit.test.mjs` — `d` lu, posté une fois, retiré de l'URL ; rien en
    `?demo=1` → `if (api.isDemo()) return`
56. `fixtures-alerts.test.mjs` — les formes démo collent au contrat des routes

Total attendu : **~50 tests API** (737 → ~787) et **~25 tests site** (111 → ~136).

---

## 12. Les pièges repérés

1. **`migration_registry.py` : 147 lignes.** Le SQL de la 013 va dans
   `migration_sql_alerts.py`, sinon le plafond saute.
2. **`main.py` : 141 lignes.** Trois routeurs entrent, pas quatre.
3. **`fixtures.js` : 149 lignes ; `api.js` : 103.** Les alertes ne passent pas
   par eux (`api-alerts.js` importe `fixtures-alerts.js` directement).
4. **Un lien de désabonnement en GET serait déclenché par les analyseurs de
   liens.** D'où la page + le POST.
5. **Le corps de l'email doit porter l'identifiant de l'envoi.** Le jeton est
   frappé en Python **avant** l'insertion — un `id` sériel obligerait à insérer,
   relire, puis mettre à jour.
6. **Marquer le journal avant d'insérer le courrier** condamnerait des alertes à
   ne jamais être dites. Ordre : insérer, puis marquer, dans la même transaction.
7. **`since_days=1` sur le feed perdrait un matin manqué.** Sept jours + journal
   d'unicité : la journée sautée se rattrape d'elle-même.
8. **`min_age_days` désigne deux choses** (filtre du marché, seuil de règle) :
   `max(...)` des deux, commenté des deux côtés.
9. **`feed_for` prend une licence, une recherche prend un compte.** Le pont est
   `auth.of_account` ; un compte sans licence valable ne doit pas faire tomber le
   script.
10. **`core` écarte déjà `disappeared_at`** : l'alerte « disparition » ne peut
    venir que du feed, jamais du chemin marché. Cohérent, à ne pas « corriger ».
11. **Les relevés `confirmation` ne sont pas des baisses.** Sans `CHANGED` dans
    la fenêtre, une confirmation hebdomadaire deviendrait une variation de zéro.
12. **Le `lag` doit courir sur toute la série**, le filtre `created_at` venant
    après : sinon la première baisse postérieure à l'enregistrement n'a pas de
    prédécesseur et disparaît.
13. **48 h se mesure sur `last_seen`, pas `last_revisit_at`** — le second dit que
    la file a servi la fiche, pas qu'on l'a vue.
14. **Le jour du courrier est la date UTC de `now`**, comme partout dans le dépôt
    (`observations._utc_day`). Un marchand français à 8 h est dans la même
    journée UTC ; ne pas introduire un second calendrier.
15. **`dom.el` écarte `false`, pas `''`.** `sandbox: ''` pose l'attribut ;
    `sandbox: false` le supprimerait sans bruit.
16. **`?d=` va dans `location.search`, la route dans le fragment.** Inversés, la
    mesure ne voit rien.
17. **`http://localhost:8000`, jamais `127.0.0.1`** : le cookie de session est par
    hôte. `config.public_url()` le donne déjà — ne rien recomposer.
18. **Aucun test ni aucune sonde n'écrit dans `adscope`.** Le script prend sa
    fabrique de sessions en paramètre ; les tests lui donnent celle d'`adscope_test`.
19. **Avant de relancer le service** (ce qui applique la 013 à la vraie base) :
    `pg_dump` de `adscope` vers `~/adscope-backups/` (nom daté), puis
    `launchctl kickstart -k gui/$UID/fr.adscope.api` — jamais autrement.
20. **Aucune adresse email du propriétaire dans le dépôt.** Les fixtures gardent
    `demo@adscope.fr`, déjà en place.

---

## 13. Ordre d'exécution conseillé

1. `market_params.py` + la ligne `Listing.id` de `core` + le branchement de
   `market.get_market` — tests 1 à 5. Le socle : rien ne marche sans lui.
2. `alert_models.py`, `migration_sql_alerts.py`, la 013 — tests 49, 50.
3. `require_account`, `saved_searches.py`, `alert_settings.py` — tests 6 à 12, 42 à 45.
4. `alert_rules.py`, `alert_journal.py` — tests 13 à 30.
5. `digest_build/text/html/send.py`, `scripts/send_digests.py` — tests 31 à 41.
6. `digests.py` (routeur) — tests 46 à 48.
7. Le site : `api-alerts.js`, la page `#/alertes`, le bouton du marché, le tri
   des suivis, le désabonnement, la mesure de visite — tests 51 à 56.
8. Les quatre captures, en `?demo=1`.
9. Sauvegarde, relance du service, vérification à la main sur `localhost:8000`.
