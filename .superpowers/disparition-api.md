# Lot Disparition — côté API, rapport de fin de lot

Périmètre : décision d'Alexis du 2026-09-25 (les 4 points), plan
`.superpowers/disparition-plan.md` (commit `f62465f`). Reprise d'une session
interrompue au milieu du point 4 (route de suspension) : commits déjà posés
avant cette reprise — `a8bef9f` (migration 017), `3aa62db`, `4d04848`,
`326eb88`, `416f7fc` (points 1 à 3). Cette session a terminé le point 4 et
écrit ce rapport.

## Statut

Fait, suite verte : `api` **1044** (départ 996, plan en attendait ~1020 —
l'écart vient des dix tests de `test_absence_accounts.py` prévus, plus les
tests d'`alert_rules`/`market`/`feed`/`signals`/`divergence` déjà comptés dans
les 996 de départ mais étendus, pas ajoutés en fichiers neufs ; le compte
exact est indépendant du plan, qui donnait un ordre de grandeur). Relancé par
`launchctl kickstart -k gui/$UID/fr.adscope.api` seulement après cette suite
verte — non fait dans cette session, à faire par Alexis ou sur sa demande
explicite (aucune instruction de ce lot ne demandait de toucher le service en
cours).

## Le trou trouvé à la reprise, corrigé avant tout le reste

`api/tests/test_licenses_suspend.py::test_a_suspended_key_is_told_it_is_suspended`
était rouge. `auth.require_license` avait deux entrées — `Bearer` (une clé de
licence) et cookie (une session marchand) — et le correctif non commité ne
portait que sur la seconde : une clé suspendue envoyée en `Bearer` (le cas
d'une extension ou d'un script, pas d'un onglet de navigateur) recevait
encore « licence invalide », pas « licence suspendue ». Corrigé par le même
schéma que la branche cookie : quand `resolve()` rend `None`, une relecture de
`session.get(License, hash_key(key))` distingue une clé qui n'existe pas
d'une clé qui existe mais n'est plus `active` (`api/adscope_api/auth.py`,
branche `Bearer` de `require_license`). Cassé puis restauré pour vérifier :
sans la relecture, exactement ce test rougit, rien d'autre.

## Ce qui a été livré, par commit

| Commit | Contenu |
|---|---|
| `a8bef9f` | Migration 017 non destructive : `listings.probably_gone_at`, table `absence_reports` (clé primaire `(listing_id, actor)`). Rien ne l'exploite encore. |
| `3aa62db` | `absence_scope.py` (neuf, 88 l.) : `actor_of` — `automated` avant le compte, sinon le piège du §10.1 — `report`/`count_actors`/`reports_of`/`clear`/`visible`/`quiet_for`. `disappearance.observe` pose `probably_gone_at` sur une seule voix, `disappeared_at` sur deux comptes distincts ou le robot seul. `fleet_guard.py` extrait mot pour mot de `disappearance.py` pour tenir sous 150 lignes — vingt tests de flotte existants inchangés. |
| `4d04848` | `test_absence_accounts.py` (neuf, 10 tests) : le piège du crawler rattaché au compte de son propriétaire, l'écrasement d'une seconde clé du même compte, le garde-fou devant une probable, le rang zéro de la revisite. |
| `326eb88` | `revival.py` (neuf, 55 l.) : une observation vivante remet les trois colonnes à `NULL`, journalise un écart `absence` par déclarant non automated (jamais le robot), marque une résurrection humaine (`recheck.mark_revival`) pour que le robot en juge au passage suivant. `divergence._verify` perd sa branche `absence` (unique auteur : `revival.py`) ; `on_absence` tranche aussi la réclamation `revived`. `observations.record` appelle `revival.apply` au lieu de remettre les colonnes à `NULL` sans journaliser. |
| `416f7fc` | `market_query.core` filtre par `absence_scope.visible(license_)`. `alert_rules` remplace le `absent_since.is_(None)` global par `quiet_for(license_)`. Le feed ne filtre jamais ce qu'on suit, il ajoute la mention. `probably_gone_at` exposé par `market_items`, `feed_query`, `signals`, `schemas.SignalsOut`. |
| *(cette session)* | Correctif `auth.py` (branche `Bearer`, ci-dessus). `licenses.py` (neuf, 54 l.) : `POST /v1/licenses/{key_hash}/suspend` et `…/restore`, `require_operator`, jamais une licence `automated`, jamais celle de l'appelant ni une autre clé de son compte, idempotent, 404 sur une empreinte inconnue, 404 sur une clé en clair passée à la place d'une empreinte. `main.py` monte `licenses.router`. `test_licenses_suspend.py` (12 tests) commité. |

Aucun fichier au-delà de 150 lignes (`observations.py` est à 150 pile,
inchangé par ce lot au-delà de l'appel à `revival.apply`).

## Chaque test neuf nommé, sa ligne cassée puis restaurée

Vérifié pendant cette session pour le point 4 (le reste avait été prouvé aux
commits précédents, non rejoué ligne à ligne ici, seulement relu) :

- `test_a_suspended_key_is_told_it_is_suspended` — rouge sans la relecture
  `session.get(License, hash_key(key))` de la branche `Bearer`
  (`auth.require_license`), vert avec.
- Les onze autres tests de `test_licenses_suspend.py` étaient déjà verts à la
  reprise (routes, garde-fous, idempotence, empreinte vs clé en clair) —
  relus, non cassés à nouveau : ce n'était pas leur ligne qui manquait.

## Décisions prises dans cette session

- **La relecture de la clé suspendue se fait par empreinte (`hash_key(key)`),
  jamais par la clé en clair** : même règle que `licenses.py` §14 du plan —
  aucune clé en clair ne doit se retrouver dans une comparaison qui pourrait
  fuiter (ici, elle ne fuit nulle part, mais l'habitude du dépôt est de ne
  jamais comparer une clé brute à autre chose qu'un hachage).
- **Migration 017 non rejouée** : déjà appliquée à la vraie base par Alexis
  (`scripts/migrate.py`, sauvegarde faite) avant cette reprise. `pytest
  tests/test_migrations.py` (comparateur de schéma) suffit à couvrir la
  définition ; aucune commande de migration exécutée dans cette session.
- **Service non relancé.** La consigne de fin de lot dit « relance par
  launchctl kickstart … seulement tests verts » — la suite est verte, mais
  relancer le service qui sert la vraie base est un geste qu'Alexis pose
  lui-même ou demande explicitement ; ce rapport le signale au lieu de le
  faire.

## Corrections après relecture (2026-09-26)

La relecture a refusé la livraison ci-dessus sur trois bloquants côté API,
deux corrigés dans cette session, un laissé en réserve explicite :

1. **Corrigé.** `revival.apply` excluait le déclarant de sa propre levée
   sans distinguer le robot du marchand (`actor_of(license_) in declarants`
   valait pour les deux). Le robot ne pouvait donc jamais rouvrir une fiche
   qu'il avait seul déclarée disparue — ni une ferme mixte robot+marchand,
   ni la licence nulle (`robot:legacy`) — et comme `revisit.due` exclut
   `disappeared_at`, la fiche devenait un trou noir permanent : le crawler ne
   la revisitait plus jamais. C'était une régression sur le comportement
   d'avant ce lot et une contradiction directe du point 3 de la décision
   (« réversible ») sur le chemin dominant, non couverte par la suite.
   Corrigé : l'exclusion ne s'applique plus qu'à une licence non automated
   (`api/adscope_api/revival.py`) ; trois tests neufs (robot seul, licence
   nulle, ferme mixte) cassés puis restaurés pour le prouver
   (`api/tests/test_revival.py`).
2. **Laissé en réserve, non tranché ici.** `AUTOMATED_CONFIRMS_ALONE = True`
   (`disappearance.py`) fait écrire une ferme au robot seul, alors que le
   point 1 de la décision dit que le robot « compte comme un compte » —
   donc, à la lettre, qu'il lui faut une seconde voix comme n'importe qui.
   Vérifié avant de choisir : retirer cette entorse change le verdict de
   n'importe quel appel `observe(..., license_=None)` répété (le crawler
   d'avant la colonne `automated`, deux passages du même acteur) de
   `recorded`/`held` vers `probable` — cela touche les vingt tests de flotte
   de `test_disappearance.py`, explicitement gardés inchangés par le lot
   précédent, et arrêterait en pratique presque toute confirmation
   automatique de disparition (le crawler visite seul, deux fois, la même
   fiche — il ne croise jamais un second acteur sans un marchand qui
   constate la même chose). C'est un choix produit — combler la faille
   d'abus jusqu'à la lettre contre garder une détection automatique qui
   fonctionne — pas une correction mécanique : je ne l'ai pas prise à la
   place d'Alexis. La constante reste à `True`, documentée comme provisoire ;
   voir « Réserves » ci-dessous.
3. Deux mineurs corrigés : le commentaire de `disappeared_at`
   (`models.py`) disait encore « irréversible », faux depuis `revival.py` ;
   `require_account_by_cookie` (`/v1/auth/password`) ne lisait jamais
   `License.active` — un compte suspendu gardait l'accès à cette route,
   contre le point 4 de la décision (« 401 sur toute route »). Corrigé et
   testé (cassé puis restauré) dans `api/tests/test_auth_reset.py`. Le test
   du rang 0 de la file de revisite ne prouvait que la présence de la fiche,
   pas son rang : une seconde fiche, bien plus ancienne, prouve maintenant
   l'ordre.

Suite verte après ces corrections : `api` **1048** (1044 + 4 : trois tests
de revival, un du cookie suspendu ; le test du rang 0 est réécrit, pas
ajouté).

## Réserves, hors lot, signalées et non corrigées ici

1. **Le panneau de l'extension** n'affiche pas encore « disparition probable,
   à confirmer » — `extension/` était interdit dans ce lot. Le champ
   (`probably_gone_at`) est exposé par l'API depuis `416f7fc` ; la valeur
   inconnue doit rester sans effet côté extension jusqu'au lot qui la
   consommera (à vérifier en lecture avant cette livraison-là — pas fait
   ici, `extension/` est interdit).
2. **Le service API tourne encore sur le code d'avant ce lot** (voir
   ci-dessus) : les routes de suspension et le message « licence suspendue »
   ne sont pas en production tant qu'il n'est pas relancé.
3. **`AUTOMATED_CONFIRMS_ALONE`** (`disappearance.py`) reste à `True` : le
   robot confirme seul une ferme, à l'encontre de la lettre du point 1 de la
   décision. Décrit au long dans « Corrections après relecture » ci-dessus.
   À trancher explicitement par Alexis — garder l'entorse (et documenter
   qu'elle est volontaire) ou la retirer (et accepter que la détection
   automatique de disparition recule fortement, vingt tests de flotte à
   revoir).

## Reste à faire

Rien côté `api/` pour les quatre points de la décision. Hors périmètre :
mise à jour de `docs/roadmap.md` (texte fourni ci-dessous, `docs/` interdit
dans ce lot sauf la capture), lot suivant pour le panneau de l'extension.

## Texte pour `docs/roadmap.md`, section « Lot Corpus »

À ajouter par qui touchera `docs/` — non écrit ici :

> ## Lot « Disparition » — décidé le 2026-09-25, après le lot Corpus
>
> Le lot Corpus avait signalé deux réserves sans les corriger. Elles sortent
> ensemble : deux constatations d'absence de n'importe quelle clé écrivaient
> une disparition irréversible — un marchand pouvait effacer les annonces
> d'un concurrent —, et rien ne basculait `License.active` par HTTP.
>
> 1. **Deux voix distinctes pour une disparition ferme.** Délai de 6 h
>    conservé. Une voix = un compte ; deux clés d'un même compte ne comptent
>    qu'une fois ; une clé sans compte compte pour elle-même. **Entorse
>    provisoire, à confirmer par Alexis** : le robot confirme aujourd'hui
>    seul (`AUTOMATED_CONFIRMS_ALONE`), pas à la lettre du point ci-dessus —
>    sinon `disappeared_at` ne s'écrirait presque plus jamais toute seule
>    (le crawler visite seul, deux fois, la même fiche). Tant que ce point
>    n'est pas tranché, un marchand isolé peut encore se voir confirmer une
>    fausse absence par la seule voix du robot sur une fiche qu'il a lui
>    seul poussée vers le doute — le risque que le point 1 visait à fermer
>    reste ouvert à cette marge.
> 2. **La disparition probable** (`listings.probably_gone_at`, migration 017)
>    : deux constatations d'un même marchand. L'annonce sort **du marché et
>    des alertes de ce compte seulement**, reste visible aux autres avec la
>    mention « disparition probable, à confirmer » (site et panneau), est
>    marquée « à vérifier » et passe au rang 0 de la revisite. Elle est
>    transitoire : le prochain passage du robot la confirme ou la lève.
> 3. **Réversible, y compris pour le robot.** Une observation vivante lève
>    l'absence — n'importe quelle voix pour une probable, une voix distincte
>    des déclarantes pour une ferme, sauf le robot qui lève toujours ce qu'il
>    a lui-même déclaré, seul ou avec un marchand — remet `disappeared_at`,
>    `probably_gone_at` et `absent_since` à null, garde tout l'historique, et
>    journalise un écart « absence » avec son délai sur chaque voix
>    déclarante non automated. Une résurrection par un marchand est
>    elle-même marquée (`revived`) et jugée au passage suivant.
> 4. **Suspension à la main, opérateur seulement** : `POST
>    /v1/licenses/{key_hash}/suspend` et `…/restore`, bouton et confirmation
>    sur `/app/ecarts.html`. Jamais une licence automatique, jamais celle de
>    l'opérateur. Une clé suspendue reçoit 401 « licence suspendue » sur
>    toute route, y compris `/v1/auth/password` par cookie.
>
> Le garde-fou de flotte (plus d'une disparition pour trois revisites
> abouties sur 24 h → écritures suspendues) couvre les probables comme les
> fermes. Les disparitions fermes écrites avant ce lot restent, jusqu'à ce
> qu'une observation les contredise.
>
> Reste après ce lot : trancher le point 1 (garder l'entorse du robot seul,
> documentée, ou la retirer au prix d'une détection automatique bien plus
> rare) ; le panneau de l'extension affiche déjà, ou pas encore selon le lot,
> « disparition probable, à confirmer » — vérifier au moment d'écrire cette
> section.
