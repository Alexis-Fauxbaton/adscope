# Les trois points de concurrence restants, soldés

Point de départ : `8084409` sur `feat/api`, 147 tests d'API verts, 189 côté extension.
Arrivée : 149 et 189. Aucune migration, aucun changement de schéma, base de développement
non touchée (25 617 annonces et 25 618 points de prix avant comme après).

Tout ce qui suit a été mesuré sur `adscope_test`. Le service local (port 8000, base de
développement) n'a servi qu'à vérifier qu'il redémarre : il a été relancé sur le nouveau
code et répond, sans une ligne de plus dans son journal.

---

## Point 1 — le « dernier lire-puis-écrire » n'est pas sur le chemin chaud

**La prémisse était fausse, et c'est le résultat le plus utile de ce point.**

`auth.py:39` n'est pas dans `resolve` mais dans `mark_automated`, sept lignes plus bas :

```python
def resolve(session, key, now=None) -> License | None:      # lignes 18-27
    ...                                                      # aucune écriture

def mark_automated(session, key_or_hash, automated=True):    # ligne 29
    for candidate in (hash_key(key_or_hash), key_or_hash):
        license_ = session.get(License, candidate)
        if license_ is not None:
            license_.automated = automated                   # ligne 39
```

`mark_automated` n'est appelé que par `scripts/mark_automated.py` — un outil d'administration
lancé à la main sur une licence désignée — et par quatre tests. Aucune route ne l'appelle.
Vérifié à la trace plutôt qu'à la lecture : en écoutant `before_cursor_execute` sur le
moteur pendant un `GET /v1/me` puis un `POST /v1/observations` authentifiés, les seules
instructions touchant `licenses` sont deux `SELECT`. Le chemin authentifié n'écrit pas.

**Donc rien à retirer et rien à protéger.** L'écriture existe parce que c'est le corps d'un
mutateur : la retirer viderait la fonction de son sens. Et ce n'est pas un lire-puis-écrire
au sens qui nous occupait ailleurs — la valeur écrite ne dépend pas de la valeur lue. Deux
exécutions simultanées du script avec des drapeaux opposés donnent « le dernier commit
gagne », avec ou sans verrou : `SELECT ... FOR UPDATE` ne changerait pas le résultat, il
n'ordonnerait qu'une course dont l'issue est déjà correcte dans les deux sens.

Cette ligne est déjà surveillée : `auth.py:39` ramenée à `pass` fait rougir
`test_a_license_is_marked_automated_by_its_key`, **et rien d'autre** — un seul échec sur la
suite complète.

### Ce qui a quand même été ajouté

`test_the_authenticated_path_never_writes_a_license` (`tests/test_auth.py`) : un témoin
posé sur le moteur pendant deux requêtes authentifiées, qui exige que toute instruction
mentionnant `licenses` soit un `SELECT`.

La démonstration est ici inversée — le test ne surveille pas une ligne qu'on retire mais une
ligne qu'on **ajoute**, puisque l'invariant est une absence. Elle est dite telle quelle
plutôt que déguisée :

| mutation | résultat |
| --- | --- |
| `license_.automated = True` posé dans `resolve` | **rouge 3 fois sur 3** (avec `test_a_homonym_is_left_alone`) |
| `auth.py:39` (`license_.automated = automated`) ramenée à `pass` | `test_a_license_is_marked_automated_by_its_key` rouge, le témoin reste vert |

Le témoin comporte sa propre garde : `assert touched` échoue si plus aucune requête ne
touche la table, pour qu'il ne devienne pas vert par accident le jour où la résolution
changerait de forme.

---

## Point 2 — plusieurs processus, mesurés

`api/scripts/multiprocess_trial.py` monte N `uvicorn` sur les ports 8801 et suivants (jamais
8000), contre `adscope_test` — un garde-fou en tête du fichier refuse de démarrer sur toute
autre base — puis répartit les requêtes sur les ports, tous les fils lâchés sur une barrière.
Le banc lui-même est dans `api/scripts/uvicorn_fleet.py`.

    ./.venv/bin/python scripts/multiprocess_trial.py [--processes 3] [--rounds 3]

Il vide les tables entre deux épreuves, imprime ce qu'il a mesuré, rend 1 au premier écart
et efface derrière lui sa licence et ses lignes.

### Ce qui tient

Cinq épreuves, trois tours par exécution, trois exécutions à trois processus puis une à
deux, quatre et cinq : **0 écart sur 75 épreuves**.

| épreuve | attendu | mesuré, à chaque tour |
| --- | --- | --- |
| compteur, 1 vue + 10 écrivains répartis | 11 | 11 |
| bornes, une observation à 60 j contre neuf à 2 j | 2026-07-08 / 2026-09-04 | idem |
| création simultanée d'une annonce inconnue (×10) | 1 annonce, 10 vues, 0 erreur | idem |
| point de prix, 1 vue à 9 900 + 10 vues à 8 900 | 2 points | 2 |
| lots croisés, 20 annonces en sens inverse, 2 lots par processus | que des 200 | que des 200 |

Le verrou étant pris dans la base, les processus ne changent rien : c'est ce qu'on
attendait, c'est maintenant ce qu'on a mesuré.

### Ce que le banc sait détecter

Il ne prouve rien s'il ne rougit pas. Chaque mutation jouée sur deux tours, trois processus :

| ligne de production retirée | épreuves en écart |
| --- | --- |
| `.with_for_update()` dans `_locked` | compteur (11 → 2 ou 3), bornes (60 j perdus), création (10 → 2), point de prix (2 → 11) |
| `ordered(...)` dans `post_observations` | lots croisés, **`500` deux tours sur deux** (`DeadlockDetected`) |

### Réserves

- Un `uvicorn` par processus, sans `--workers` : ce sont bien des processus distincts avec
  chacun sa réserve de connexions, ce qui est le point, mais ce n'est pas la topologie exacte
  d'un déploiement à `--workers N`.
- Le tour 1 d'une exécution est plus indulgent que les suivants : les processus viennent de
  démarrer et les fils s'échelonnent. Une mutation qui ne rougit qu'à partir du tour 2 a été
  observée sur une variante intermédiaire du code ; la version livrée rougit dès le tour 1.
  L'épreuve tourne trois tours par défaut pour cette raison.
- Le banc n'est pas dans `pytest` : il coûte une dizaine de secondes et ouvre des ports.
  Il se lance à la main, d'une ligne.

---

## Point 3 — la garantie du point de prix, désormais tenue par une seule ligne

### D'abord, un troisième mécanisme que le lot précédent n'avait pas vu

Le rapport précédent nommait deux mécanismes redondants : le verrou explicite et l'`UPDATE`
que SQLAlchemy chasse avant la lecture. Le banc multi-processus en a révélé un **troisième**.

Mesuré à trois processus, verrou retiré *et* autoflush coupé (`sessionmaker(...,
autoflush=False)`), dix observations simultanées d'une même baisse :

- avec **une** licence pour les dix émetteurs : **2 points, 5 tours sur 5** — conforme ;
- avec **dix** licences distinctes : **11 points, 4 tours sur 5** — cassé.

La différence est `usage.bump` : son `INSERT ... ON CONFLICT DO UPDATE` sur `usage_days`
porte sur la même ligne `(licence, jour, annonce)` pour dix émetteurs partageant une licence,
et sérialisait donc les dix — avant la lecture du dernier prix. Trois mécanismes accidentels
au lieu de deux. C'est un argument de plus, pas de moins : une garantie tenue trois fois par
des effets de bord n'est tenue nulle part.

### Le correctif : remonter la lecture, pas ajouter un mécanisme

Les deux pistes proposées ont été examinées.

**La contrainte en base** (une colonne de rang sur `price_points` et un index unique
`(listing_id, rang)` qui rendrait deux points pour un même changement physiquement
impossibles) tient techniquement : elle est testable sans concurrence et sans ordonnancement.
Elle a été écartée. Elle ajoute un **quatrième** mécanisme là où le problème est qu'il y en a
trois de trop ; elle demande une migration et un remplissage sur 25 618 lignes réelles pour
surveiller un invariant qui n'a jamais cédé ; elle introduit une colonne dont aucune lecture
n'a l'usage ; et le dépôt a déjà écarté les incréments atomiques SQL sur le motif exact
« le verrou seul suffit, et il dit ce qu'il protège » (`.superpowers/concurrence.md`).

**Rendre la dépendance à l'autoflush explicite** ne suffisait pas non plus : la rendre
visible ne la rend pas surveillable, puisque le verrou rattrape toujours.

Ce qui a été retenu est le tiers chemin que la mesure a rendu évident : **déplacer la lecture
du dernier prix immédiatement après la prise du verrou**, avant toute autre écriture de
`record`. Les deux mécanismes de doublure disparaissent d'eux-mêmes — il n'y a plus rien
entre le `SELECT ... FOR UPDATE` et la lecture du prix : ni `UPDATE` d'autoflush (aucun champ
de l'annonce n'a encore été touché), ni upsert de `bump` (il vient après). Zéro ligne ajoutée
au code de production ; un bloc déplacé, un commentaire réécrit.

### La démonstration

`test_a_single_price_point_for_a_single_change` revient dans `tests/test_concurrency.py` —
le test que le lot précédent avait supprimé faute de pouvoir le faire rougir.

| code de production | résultat |
| --- | --- |
| livré (lecture remontée, verrou présent) | **vert 10 fois sur 10** |
| `.with_for_update()` retiré de `_locked` | **rouge 5 fois sur 5** (`[9900, 8900, 8900, …]`, 10 ou 11 points) |
| lecture remise à sa place d'origine **et** `.with_for_update()` retiré | **vert 5 fois sur 5** |

La troisième ligne est celle qui compte : elle nomme le déplacement comme le changement de
production qui rend le test discriminant, et redit franchement que sur le code d'avant ce
test-là n'aurait rien prouvé — c'est exactement le constat du lot précédent, corrigé plutôt
que contourné.

Hors banc d'essai, à trois processus : l'épreuve « point de prix » du script multi-processus
donne 2 points quand tout est en place, et **11 sur les deux tours** quand le verrou est
retiré. La garantie est la même de dedans et de dehors.

### Ce que le déplacement ne change pas

La décision d'écrire un point ne lit que `observation.price`, `latest` et `now` : aucun
champ de l'annonce mis à jour plus bas. Les 149 tests le confirment, dont les neuf tests
séquentiels de `tests/test_observations.py` qui portent la règle « un point par changement
réel, un par semaine sans changement ». L'ordre des `INSERT` dans la transaction change ;
rien n'en dépend.

---

## Vérifications

- `api` : **149 verts** (147 d'origine + 2), huit exécutions complètes de suite, sans un faux.
- `tests/test_concurrency.py` seul : dix exécutions, **7 verts** à chaque fois.
- `extension` : **189 verts**, trois exécutions.
- Banc multi-processus : 3×3 tours à 3 processus, puis 3 tours à 2, 4 et 5 processus —
  **0 écart**, 75 épreuves.
- Base de développement : 25 617 annonces, 25 618 points de prix, 4 licences, avant et après.
- Service local relancé (`launchctl kickstart -k`), répond `401` sans clé, journal muet.

## Amendements aux rapports précédents

`.superpowers/concurrence.md` et `.superpowers/tests-discriminants.md` affirmaient qu'aucun
test de concurrence ne pouvait rougir à coup sûr sur le point de prix. C'était vrai du code
d'alors et faux du code d'aujourd'hui ; les deux fichiers portent désormais une note qui
renvoie ici, et le dénombrement des mécanismes y passe de deux à trois.
