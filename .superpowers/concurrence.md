# Écritures d'observations sous accès simultané

Point de départ : `b506fd9` (branche `feat/api`). Correctif : `5fca593` puis `a16055a`.

## Le défaut, reproduit avant d'être corrigé

`tests/test_concurrency.py` ouvre de vraies connexions distinctes et les lâche sur une
barrière. Sur `b506fd9`, cinq exécutions de suite donnent le même relevé :

| Ce qu'on mesure | Attendu | Sur `b506fd9` |
| --- | --- | --- |
| Compteur, annonce à 1 vue, dix écrivains simultanés | 11 | **2**, cinq fois sur cinq |
| `site_published_first`, une observation à 60 j contre neuf à 2 j | 2026-07-07 | **2026-09-03**, cinq fois sur cinq |
| Dix créations simultanées d'une annonce inconnue | 0 erreur | **9 `IntegrityError`** sur 10 |

Après `a16055a`, les huit tests passent, et huit exécutions consécutives de la suite
complète donnent 149 verts sans un seul faux.

Preuve hors banc d'essai, sur l'API en service et la base de développement : dix `POST
/v1/observations` lancés ensemble sur une annonce neuve rendent dix `200`, une ligne,
`observations = 10`, `site_published_first` à soixante jours et un seul point de prix. La
ligne synthétique a été effacée ; la base garde ses 19 913 annonces.

## Ce qui a été retenu

**Un verrou de ligne par annonce**, pris à l'entrée de `record` et tenu jusqu'au commit.
`_locked` fait un `SELECT ... FOR UPDATE` sur `(site, site_id)`.

C'est la seule forme qui couvre les six invariants d'un coup, parce qu'ils se calculent
tous en Python sur une valeur lue juste avant d'être réécrite : le compteur, les deux
bornes de publication, `published_at`, `bumped_at`, et la lecture du dernier point de prix.
Elle respecte les deux contraintes de conception : le verrou porte sur une ligne, donc deux
marchands sur deux annonces différentes ne s'attendent pas (`test_two_listings_do_not_wait_for_each_other`
le vérifie en bloquant volontairement la première annonce pendant qu'on écrit la seconde) ;
et rien ne commite au milieu du lot, donc cent observations restent une transaction
(`test_a_batch_of_a_hundred_stays_one_transaction` regarde du dehors et ne voit rien avant
le commit).

**`ON CONFLICT DO NOTHING` puis relecture verrouillée** pour l'annonce inconnue. Le verrou
de ligne ne peut rien pour une ligne qui n'existe pas encore ; c'est un cas à part, traité à
part. Celui qui perd la course attend l'insertion concurrente, puis relit et verrouille la
ligne que l'autre a écrite. Un seul aller-retour de plus, et seulement sur la première
observation d'une annonce.

**Un ordre commun sur le lot.** Tenir un verrou par annonce jusqu'au commit ouvre une
possibilité que le code fautif n'avait pas : deux lots portant les deux mêmes annonces en
sens inverse s'attendent l'un l'autre, et Postgres en tue un. `ordered` trie les
observations du lot par identité d'annonce. Ce n'est pas de la prudence de principe — sans
l'appel à `ordered` dans `post_observations`, `test_two_crossed_batches_do_not_deadlock`
rend un `DeadlockDetected` trois fois sur trois. Le tri est stable : deux observations d'une
même annonce gardent leur rang. Ce test a d'abord appliqué le tri lui-même et n'éprouvait
donc que le trieur ; il passe désormais par l'entrée (voir
`.superpowers/tests-discriminants.md`).

## Ce qui a été écarté

**Les incréments atomiques en SQL** (`observations = observations + 1`, `LEAST`/`GREATEST`
sur les bornes). Ils règlent le compteur et les bornes, mais pas la lecture du dernier point
de prix, qui reste un lire-puis-écrire. Il aurait fallu les deux mécanismes ; le verrou seul
suffit, et il dit ce qu'il protège.

**`ON CONFLICT DO UPDATE` sur l'annonce entière**, comme le fait `usage.bump`. L'écriture
d'une observation n'est pas un `upsert` : chaque champ a sa règle propre — un vendeur
particulier efface, une observation muette n'efface pas, l'empreinte se recalcule sur l'état
fusionné. Tout cela n'entre pas dans un `SET`.

**La reprise sur `IntegrityError`.** Elle rattrape l'erreur de création, mais après coup et
sur une transaction déjà cassée : dans un lot de cent, il faudrait rejouer les
quatre-vingt-dix-neuf autres. `ON CONFLICT` évite l'erreur au lieu de la réparer.

**Sérialiser l'endpoint** (verrou d'avis, `SERIALIZABLE`). Écarté par la première contrainte
de conception.

## La garantie qui tenait par accident — et qui tient toujours par accident aussi

« Un point de prix par changement réel » résistait déjà sous concurrence, mais par l'ordre
des instructions : le `session.flush()` prenait le verrou de ligne avant la lecture du
dernier prix. Un effet de bord, déjà déplacé une fois pour donner `listing.id` au compteur
d'usage.

Le `flush` explicite a disparu : `listing.id` est acquis dès `_locked`, et le verrou porte
désormais la garantie. **Mais il ne la porte pas seul, et cette version du rapport l'a
d'abord affirmé à tort.** `listing.observations += 1` salit la ligne ; SQLAlchemy la chasse
en `UPDATE` avant la lecture du dernier prix, et cet `UPDATE` reprend le verrou de ligne.
La sérialisation accidentelle d'avant le correctif est donc toujours là, à côté du verrou
explicite.

Mesuré : verrou commenté, `test_a_single_price_point_for_a_single_change` passait dix fois
sur dix — l'affirmation « le second échoue si l'on retire le verrou » était fausse. Il
passait aussi sur le code fautif de `b506fd9`, comme son jumeau
`test_a_single_price_point_for_a_single_creation`, dont le point unique n'était que le
résidu de neuf écrivains sur dix écrasés par `IntegrityError`. Les deux tests ont été
retirés : voir `.superpowers/tests-discriminants.md`. La règle elle-même reste éprouvée
séquentiellement dans `tests/test_observations.py`.

## Les invariants, écrits noir sur blanc

Ils sont désormais dans la docstring de `adscope_api/observations.py`, pas seulement ici :

- `site_published_first` ne recule jamais — toute la détection de republication en dépend ;
- `site_published_last` n'avance jamais à rebours ;
- `published_at` ne recule jamais, `bumped_at` n'avance jamais à rebours ;
- `observations` compte toutes les observations reçues ;
- un point de prix par changement réel, un par semaine sans changement.

## Réserves

**Le lot devient plus long à tenir.** Le verrou d'une annonce court du moment où le lot la
touche jusqu'à son commit. Deux marchands sur la même page de résultats se sérialisent donc
sur toute la durée d'un lot, pas d'une observation. Sur cent annonces le lot dure quelques
dizaines de millisecondes ; c'est le prix de « un lot reste un lot », et l'ordre commun
garantit qu'ils s'attendent au lieu de s'entretuer.

**Le tri déplace les clés primaires.** L'ordre d'insertion d'un lot ne suit plus l'ordre
d'arrivée. Un test s'y appuyait (`test_gauge`, `session.get(Listing, 43)`) ; il désigne
maintenant son annonce par son `site_id`, ce qui est de toute façon plus honnête. Aucun code
de production ne dépend de cet ordre.

**Le module est lié à PostgreSQL** par `ON CONFLICT`, comme `usage.py` l'était déjà.

**Aucune migration** : la contrainte `uq_listing_site_id` sur laquelle repose `ON CONFLICT`
existe déjà en base de développement comme dans le modèle. La base n'a pas été touchée.

## Vérifications

- `api` : 149 tests verts (141 d'origine, 8 nouveaux), huit exécutions de suite sans faux.
- `extension` : 189 tests verts, inchangés.
- API en service redémarrée, dix `POST` simultanés vérifiés en base puis nettoyés.
