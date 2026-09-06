# Trois tests de concurrence rendus discriminants

Le correctif de concurrence (`b506fd9..260690c`) n'est pas en cause : il est bon, et il
n'a pas été touché. Ce sont trois de ses tests qui ne prouvaient rien. Le critère appliqué
partout ici est le même : **on nomme une ligne de code de production, on la retire, et on
montre le test qui rougit**. Un test dont cette démonstration est impossible n'a pas sa
place dans la suite.

Base de départ : `260690c` sur `feat/api`, 149 tests verts. Arrivée : 147 verts.

## 1. L'interblocage — le test éprouvait le trieur, pas son emploi

`test_two_crossed_batches_do_not_deadlock` appelait `ordered(batches[index])` lui-même. Il
prouvait que `sorted` trie. La ligne qui compte est ailleurs : `for item in
ordered(payload.items)` dans `post_observations`, et rien ne la surveillait.

Mesuré sur `260690c` : `main.py:38` ramené à `for item in payload.items`, **la suite
complète restait verte, 149 tests passés**. C'est le motif exact que ce lot devait fermer
— une garantie qui tient par une ligne que personne ne regarde, comme le `flush` de la
veille — et le risque avait été **introduit par le correctif** : le code fautif, qui ne
tenait aucun verrou jusqu'au commit, ne pouvait pas s'interbloquer ainsi.

Le test passe désormais par l'entrée : il construit deux `ObservationsIn` portant les vingt
mêmes annonces en sens inverse, ouvre une licence réelle, et appelle `post_observations`
dans deux fils lâchés sur la barrière de `concurrently`. La licence n'est pas décorative :
elle réveille `bump`, dont l'`ON CONFLICT DO UPDATE` sur `usage_days` verrouille lui aussi
une ligne par annonce et referme le cycle une seconde fois.

| code de production | résultat |
| --- | --- |
| `260690c` intact | vert 5 fois sur 5 |
| `main.py:38` → `for item in payload.items` | **rouge 3 fois sur 3**, `OperationalError` / `DeadlockDetected` |
| `record` de `b506fd9` | rouge 3 fois sur 3 |

Le chemin retenu est l'appel direct à `post_observations` plutôt que le client HTTP : le
`TestClient` de Starlette ouvre un portail par requête, et deux fils qui le traversent
ensemble ajoutent une source d'instabilité qui n'apprend rien de plus sur `ordered`. La
session par fil vient de la fabrique `sessions`, donc les connexions sont bien distinctes.

## 2. Un point de prix pour une création — supprimé

`test_a_single_price_point_for_a_single_creation` passait sur le code fautif `b506fd9`.
Mesuré, dix créations simultanées y donnaient : **9 `IntegrityError` sur 10**, 1 annonce,
1 point de prix. Le point unique était le résidu des neuf fils écrasés — le test ne
comptait pas les erreurs et prenait cette casse pour une garantie.

Il n'y a pas de ligne à retirer qui le fasse rougir seul :

- `.with_for_update()` retiré de `_locked` : **vert 5 fois sur 5**. La création reste
  sérialisée par l'`ON CONFLICT DO NOTHING`, qui fait attendre les perdants jusqu'au commit
  du gagnant ; ils relisent alors un point de prix déjà écrit et n'en ajoutent aucun.
- `.on_conflict_do_nothing(...)` retiré : rouge, mais uniquement par les `IntegrityError`
  — exactement ce que `test_ten_simultaneous_creations_of_an_unknown_listing` prouve déjà,
  lui qui compte ses erreurs.

Le test constatait donc un bon résultat produit par un mécanisme cassé, et son seul
pouvoir discriminant doublait un test voisin. Supprimé. Le voisin, lui, rougit sur les deux
mutations ci-dessus.

## 3. Un point de prix pour un changement — supprimé

`test_a_single_price_point_for_a_single_change` passait sur `b506fd9` **et** sur le code
actuel privé de son verrou, 10 fois sur 10. La cause a été isolée, pas devinée.

`record` fait `listing.observations += 1` avant de lire le dernier prix. La ligne est
sale ; SQLAlchemy l'écrit en `UPDATE` au premier autoflush venu — celui de `bump`, ou celui
du `select(PricePoint)` — et cet `UPDATE` prend le verrou de ligne. La sérialisation
accidentelle d'avant le correctif n'a pas disparu : elle double le verrou explicite.

Démonstration croisée, sur le seul chemin du prix :

| verrou `.with_for_update()` | autoflush avant la lecture du prix | résultat |
| --- | --- | --- |
| présent | présent | vert |
| **retiré** | présent | **vert 5 fois sur 5** |
| présent | **coupé** (`with session.no_autoflush:`) | vert 3 fois sur 3 |
| **retiré** | **coupé** | **rouge 3 fois sur 3** |

Deux mécanismes redondants tiennent la garantie ; aucun ne se retire seul sans que l'autre
la rattrape. Il faut en couper deux à la fois, dont un qui n'est pas une ligne mais un
comportement de SQLAlchemy. **Aucun test de concurrence ne peut donc rougir à coup sûr sur
cette garantie**, et c'est dit ici franchement plutôt que déguisé en test décoratif. Le
test est supprimé.

Ce n'est pas une perte de couverture : la règle « un point par changement réel, un par
semaine sans changement » est éprouvée séquentiellement, et là de façon discriminante, par
neuf tests de `tests/test_observations.py`
(`test_same_price_twice_does_not_add_a_point`, `test_changed_price_adds_a_point`,
`test_an_unchanged_price_is_confirmed_after_a_week`, …).

Une note en tête de `tests/test_concurrency.py` disait pourquoi ce test manquait, pour que
personne ne le remette par zèle.

**Amendement (`.superpowers/concurrence-solde.md`) : le test est revenu, et il rougit.** Le
constat ci-dessus était juste sur le code d'alors — et incomplet : les mécanismes étaient
trois, pas deux, le troisième étant l'upsert de `usage.bump`. La lecture du dernier prix a
été remontée immédiatement après la prise du verrou, où plus rien ne la double.
`test_a_single_price_point_for_a_single_change` est rouge 5 fois sur 5 quand on retire
`.with_for_update()`, et vert 5 fois sur 5 si l'on remet la lecture à sa place d'origine
avec le verrou retiré — c'est le déplacement, et lui seul, qui l'a rendu discriminant.

## Ce que la suite surveille maintenant, ligne par ligne

Matrice complète, chaque mutation jouée trois fois — sur la suite entière pour les deux
premières, sur `tests/test_concurrency.py` pour la troisième, dont les autres échecs
n'apprendraient rien.

| ligne de production retirée | tests qui rougissent |
| --- | --- |
| `ordered(...)` dans `post_observations` (`main.py:38`) | `test_two_crossed_batches_do_not_deadlock` |
| `.with_for_update()` dans `_locked` (`observations.py`) | `test_the_counter_holds_under_ten_simultaneous_writers`, `test_the_lower_bound_survives_two_ages_observed_at_once`, `test_ten_simultaneous_creations_of_an_unknown_listing` |
| `record` entier ramené à `b506fd9` | les quatre ci-dessus, ensemble |

Les deux tests restants du fichier n'étaient pas visés par la revue ; ils passent le même
critère, sur des mutations qui leur sont propres.

| ligne de production altérée | tests qui rougissent |
| --- | --- |
| verrou de ligne remplacé par `LOCK TABLE listings IN EXCLUSIVE MODE` | `test_two_listings_do_not_wait_for_each_other`, **rouge 3 fois sur 3** (il attend dix secondes puis constate l'attente) |
| `session.commit()` ajouté en fin de `record` | `test_a_batch_of_a_hundred_stays_one_transaction`, **rouge 3 fois sur 3** |

## Stabilité

Les tests concurrents ne sont pas jugés sur un vert unique.

- `api` : 8 exécutions complètes, **147 passés** à chaque fois.
- `tests/test_concurrency.py` seul : 10 exécutions, **6 passés** à chaque fois.
- `extension` : 3 exécutions, **189 passés**, 0 échec.

L'ordre des tests est fixe : `pytest-randomly` n'est pas installé dans cet environnement.
La répétition ne couvre donc que l'aléa d'ordonnancement des fils et de la base, pas celui
de l'ordre des tests — c'est bien l'aléa qui compte ici, mais la réserve mérite d'être
écrite.

## Le rapport corrigé

`.superpowers/concurrence.md` affirmait que `test_a_single_price_point_for_a_single_change`
« échoue si l'on retire le verrou ». C'est faux, et mesuré comme tel. La section « La
garantie qui tenait par accident » dit désormais que la garantie tient toujours par
accident *aussi*, nomme l'`UPDATE` d'autoflush comme second mécanisme, et renvoie ici. La
phrase sur l'ordre commun du lot précise que le tri n'a de valeur que là où l'entrée le
pose.
