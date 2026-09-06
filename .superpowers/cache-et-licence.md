# Cache local de l'extension et rattachement des observations à leur licence

Base : `1a773b7` · commits : `8defdb2`, `b53f742`, `6204484`, `aa922d5`
Suites : extension **136 tests** verts (91 au départ), API **71 tests** verts (61 au
départ).

> Une session voisine a posé `12b2853` (« Acte les statistiques par vendeur… », document
> de conception uniquement) pendant le travail ; il s'est intercalé entre le commit d'API
> et les trois commits d'extension. Aucun fichier commun. `crawler/`,
> `scripts/crawler-service.md` et `scripts/fr.adscope.crawler.plist` n'ont pas été
> touchés, rien n'est poussé, la branche reste `feat/api`.

---

## 1. Le cache local — `b53f742`, `6204484`, `aa922d5`

### Où il vit

Dans le service worker, qui portait déjà l'appel API et la clé de licence. Le content
script ne connaît pas `chrome.storage` : il envoie deux messages et reçoit deux réponses.

```
content script                 service worker                    API
──────────────                 ──────────────                    ───
send(listings)
   ├─ {type:'cached', ids} ───▶ get(['a:lbc:…', …])  ── un seul appel
   │  ◀── signaux connus ──────┘                        (24 cartes, 1 lecture)
   │  encart posé tout de suite
   │
   └─ {type:'sync', listings} ▶ ce qui manque, a vieilli
                                ou dont le prix a bougé ─▶ POST /v1/observations
                                                          POST /v1/listings/batch
      ◀── signaux frais ───────┴─ écrit en cache ◀────────┘
      encart réécrit
```

Une clé par annonce, `a:lbc:3254194817`, portant `{ at, sig, signals }`. `_meta` retient
la date de la dernière purge. Aucune permission nouvelle : ni `unlimitedStorage`, ni
`alarms`.

### Le seuil de fraîcheur : six heures

**Ce que l'encart affiche se compte en jours pleins** — « 12 j en ligne », « suivie
depuis 3 mois · 4 vues », « stable depuis 5 j », « ▼ −800 € en 12 j ». Aucune de ces
lignes ne peut changer d'apparence en moins d'une journée. Un seuil de six heures ne
retient donc jamais rien de visible.

Ce qu'il fait gagner est concret : un marchand parcourt et reparcourt les mêmes pages de
résultats dans la journée. Sans seuil, chacun de ces passages coûte deux requêtes et
vingt-quatre observations qui n'apprennent rien à personne.

Ce qu'il ne compromet pas :

- **le compteur de fraîcheur partagé avec le crawler** (§ 10 de la spec) reste juste à la
  journée — une annonce consultée est rafraîchie au moins quatre fois par jour ;
- **la mesure d'usage par licence** (point 2) reste juste à la journée pour la même
  raison ;
- **un prix qui bouge passe outre le seuil.** L'entrée porte la signature de la dernière
  observation émise (`prix | published_at | bumped_at`) ; si elle diffère, l'annonce
  repart quel que soit son âge en cache. Le seuil range les passages répétés, il ne
  retient jamais une nouvelle.

Six heures plutôt que vingt-quatre parce que le quart de journée est la granularité
utile : elle sépare le marchand qui source le matin de celui qui source le soir, ce que
la spec cite comme mesure d'usage attendue.

### Les deux protections contre l'arrêt silencieux

Ce sont les seules raisons pour lesquelles le cache ne s'arrête pas d'enregistrer un jour
sans que personne ne le voie.

**Plafonnement de l'historique.** Le premier point plus les vingt plus récents. Le
premier porte la baisse depuis l'origine — c'est lui qui donne son sens à « ▼ −800 € » ;
les intermédiaires anciens n'ont pas de lecteur. Sans ce plafond, quelques annonces
suivies pendant des mois suffisent à remplir le quota.

**Interception du quota en écriture.** `chrome.storage.local.set` lève quand le quota est
atteint ; sans rattrapage, l'échec est silencieux et le cache cesse simplement de se
mettre à jour. À la première erreur : purge d'urgence, puis **une seule** nouvelle
tentative. Si elle échoue aussi, l'écriture est abandonnée — l'affichage, lui, n'est
jamais bloqué.

La purge d'urgence ne peut pas être celle des trente jours : au moment où le quota est
atteint, tout peut être récent. Elle sacrifie la moitié la plus ancienne, quel que soit
son âge.

### La purge ordinaire

Opportuniste, au chargement, **une fois par jour au plus**, gardée par `_meta.purged` :
suppression au-delà de trente jours. Le balayage complet du stockage coûte trop pour être
refait à chaque page, et une alarme demanderait une permission de plus.

### Hors ligne

La lecture du cache ne touche pas au réseau et répond même sans licence. Une
synchronisation qui échoue laisse le cache intact et n'annule pas ce que l'encart affiche
déjà. C'est vérifié par deux tests (`tests/sw.test.mjs`) et par la construction : les
deux réponses sont indépendantes.

### Le nœud posé porte son origine

Correctif nécessaire et non évident : la pastille et le panneau se court-circuitent sur
une estampille (`data-adscope-src`) pour ne pas se repeindre à chaque lot de mutations.
Elle valait `sync` ou `page` — donc identique pour des signaux venus du cache et pour
ceux venus du réseau. **L'encart serait resté sur les premiers.** L'estampille porte
maintenant `cache`, `network` ou `page`. Deux tests le verrouillent
(`tests/cache-render.test.mjs`).

### Ce que la popup en dit

```
Annonces lues                     24
Pastilles posées                  24
Signaux affichés     20 du cache · 4 du réseau
Transmises depuis l'ouverture      4
Cache            42 annonces · 117 Ko sur 10 Mo   [Vider le cache]
```

Sans la ligne « Signaux affichés », une API muette passerait pour une API qui répond : le
lecteur verrait les mêmes signaux à l'écran. Corollaire traité : **« rien de transmis »
n'est une alerte que si le cache n'a rien servi non plus** — une page dont toutes les
annonces sont fraîches ne transmet rien, c'est le fonctionnement attendu, et le marquer
en rouge aurait été un faux défaut quotidien.

Le rendu du relevé est sorti dans `popup/report.js` : fonctions pures, testées sans
document (`tests/report.test.mjs`), et `popup.js` repasse sous la limite de 150 lignes.

### Vérification en conditions réelles

Le vrai `sw.js`, chargé comme le fait Chrome (`importScripts`), contre l'API locale et sa
licence :

| étape | résultat |
|---|---|
| cache vide, lecture | `{}`, aucune requête |
| première synchronisation | 2 requêtes HTTP, 2 signaux, 2 entrées écrites |
| **même page rejouée** | **0 requête HTTP**, `sent=0`, `skipped=2` |
| prix modifié sur une des deux | 1 seule annonce repart, historique à 2 points |
| relevé | `{entries: 2, bytes: 1359, quota: 10485760}` |

---

## 2. Le rattachement à la licence — `8defdb2`

### La colonne

`price_points.license_key_hash`, nulle par défaut, clé étrangère vers
`licenses.key_hash` en `ON DELETE SET NULL` — supprimer une licence ne doit pas effacer
de l'historique de marché. Index `ix_price_points_license (license_key_hash,
observed_at)`, nommé explicitement dans le modèle pour que `create_all` et la migration
produisent le même schéma.

`require_license` résolvait déjà la licence et la jetait ; `post_observations` la passe
maintenant à `record()`. Le crawler, qui appelle `record()` sans licence, écrit `NULL`.
**Rien de plus n'est collecté** : on note l'émetteur de ce qu'on enregistrait déjà.

### La requête d'usage

```sql
SELECT l.label,
       date_trunc('day', p.observed_at)::date AS jour,
       count(DISTINCT p.listing_id)           AS annonces,
       count(*)                               AS observations
  FROM price_points p
  JOIN licenses l ON l.key_hash = p.license_key_hash
 GROUP BY 1, 2
 ORDER BY 2 DESC, 1;
```

Jouée sur la base de développement pendant le travail :

```
 label  |    jour    | annonces | observations
--------+------------+----------+--------------
 alexis | 2026-09-06 |      263 |          264
```

Un test la joue telle quelle sur deux licences et deux jours
(`api/tests/test_usage.py::test_usage_counts_distinct_listings_and_observations_per_day`) :
c'est la requête du rapport, pas une paraphrase.

### La manœuvre de migration

`create_all` ne crée que ce qui manque ; il ne touche jamais à une table existante. La
base de développement porte des milliers d'annonces réelles, la recréer n'était pas une
option.

`adscope_api/migrations.py` tient un registre : chaque migration est une suite
d'instructions **idempotentes** (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT
EXISTS`, contrainte posée dans un bloc `DO` qui absorbe `duplicate_object`), appliquée une
fois et inscrite dans `schema_migrations`. Double filet volontaire : le registre évite le
travail inutile, l'idempotence rattrape une base déjà modifiée à la main.

```sh
cd api && ./.venv/bin/python scripts/migrate.py     # create_all + migrations en attente
```

Déroulé réel, documenté dans `scripts/api-service.md` :

1. sauvegarde `pg_dump -d adscope -Fc` (531 Ko, conservée hors dépôt) ;
2. `scripts/migrate.py` → `001_price_points_license` ;
3. contrôle : 8 395 annonces et 8 396 points de prix avant, autant après ; colonne,
   index et clé étrangère présents ; toutes les lignes existantes à `NULL` ;
4. `launchctl kickstart -k gui/$UID/fr.adscope.api` ;
5. observation réelle postée avec la licence `adsc_3076…` → attribuée, puis retirée.

Cinq tests couvrent la migration (`api/tests/test_migrations.py`), dont celui qui compte :
la table est ramenée à son ancienne forme, remplie, migrée, et les lignes en ressortent
intactes.

---

## Ce qui reste ouvert

1. **La mesure compte des points de prix, pas des pages vues.** Un point n'est écrit que
   si le prix diffère du dernier connu (§ 8 de la spec). Un marchand qui reparcourt
   chaque jour des annonces stables ne produit **aucune ligne** : la requête le dira
   inactif alors qu'il travaille. « Combien de pages par jour » et « a-t-il décroché au
   bout de trois jours » ne sont donc répondus que pour la part du flux qui bouge —
   nouvelles annonces et changements de prix. Répondre exactement demanderait une table
   d'événements par observation (une ligne par annonce vue, ~500/jour/marchand), ce que
   la consigne excluait. À trancher avant de s'appuyer sur ce chiffre pour juger un
   compte.
2. **Le crawler local passe par l'API avec la même licence.** Pendant ce travail, la base
   a gagné 261 annonces attribuées à `alexis` sans que j'aie rien envoyé : le service de
   crawl poste sur `/v1/observations` avec la clé du poste, et la route force
   `source='user'`. Ses observations sont donc indistinguables de celles d'un marchand.
   Correctif d'une ligne le jour où la mesure compte : une licence dédiée par émetteur.
3. **Le seuil de six heures réduit le volume d'observations par construction.** La mesure
   d'usage compte au plus quatre passages par jour et par annonce, pas les rafraîchisse-
   ments réels. C'est sans effet sur « annonces distinctes par jour », qui est la mesure
   utile ; c'en est un sur « observations », qui n'est plus un compteur de trafic.
4. **`at` est l'horodatage du dernier rafraîchissement, pas de la dernière consultation.**
   Les deux ne divergent jamais de plus de six heures tant que l'API répond. Hors ligne
   pendant plus de trente jours, une annonce pourtant consultée serait purgée. Deux
   horodatages par entrée corrigeraient le cas, au prix d'une écriture par page même
   quand rien ne change.
5. **Rien n'a été observé dans un vrai navigateur.** Le service worker a été exercé contre
   l'API réelle par un harnais Node qui le charge comme Chrome le fait, et les deux
   content scripts par le monde de fabrique — mais aucune capture de la popup ni de
   l'encart avec le cache en place.
6. **Le quota supposé est celui de Chrome 114+** (10 Mo). Le relevé lit
   `chrome.storage.local.QUOTA_BYTES` quand il existe et se contente du compte d'octets
   sinon.
7. **La dette de concurrence de § 9 bis n'est pas touchée.** Elle joue désormais aussi sur
   la nouvelle colonne : rien n'y est perdu, mais `record()` reste sans verrou.
