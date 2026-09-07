# L'échantillonnage passe au jour, la lecture reste sobre

Base : `579c43c` · commits `c6529d7` → `6692a00` (3)
Suites : API **159 tests** verts (149 au départ), extension **289 tests** verts (287 au
départ). Branche `feat/api`, rien n'est poussé. `crawler/`, `scripts/crawler-service.md`,
`scripts/fr.adscope.crawler.plist`, les `.html` de la racine et
`docs/crawl-planifie-a-decider.md` n'ont pas été touchés ; jamais de `git add -A`.

Aucune migration : `price_points.confirmation` existe depuis `003`, et rien du schéma ne
bouge. Donc pas de `pg_dump` — le lot n'écrit ni ne réécrit une seule ligne existante.
La base de développement porte toujours ses 30 151 annonces.

---

## 1. Pourquoi la base ne portait aucune confirmation

C'était la première question, et elle pouvait annuler le reste du lot : si l'écriture ne
se déclenchait pas, la corriger était le sujet, et passer au jour n'aurait rien changé.

**C'est la première cause : la base est trop jeune, de beaucoup.** L'écriture fonctionne.

```
30 152 points de prix, 0 confirmation
premier point   2026-09-06 02:06:54+02
dernier point   2026-09-07 08:39:09+02        → la base entière tient dans 30 h
```

Le délai à franchir était de sept jours. Le plus long suivi de la base :

```sql
select max(last_seen - first_seen) from listings;   -- 21:53:53
```

**Vingt-et-une heures cinquante-trois.** Aucune annonce n'a jamais pu être revue plus de
sept jours après son dernier point, puisque aucune annonce n'a plus de vingt-deux heures
d'existence dans la base. L'échantillonnage hebdomadaire lui-même n'est en place que
depuis `7effdfe`, le 2026-09-06 à 15 h 28 — soit **après** le premier point écrit.

Restait à écarter l'hypothèse d'un chemin mort — une base jeune et une écriture cassée
donnent le même zéro. Trois relevés l'écartent :

| Relevé | Valeur | Ce qu'il montre |
|---|---|---|
| Annonces revues au moins deux fois | **13 275** sur 30 151 | Le bloc de prix est traversé une seconde fois, souvent |
| Observations totales | **46 057** pour 30 151 annonces | Une annonce a été revue jusqu'à 204 fois |
| Annonces à plus d'un point | **1** | 29 990 € → 24 990 €, 76 s d'écart, `confirmation = false` |

Le bloc est donc atteint, la lecture du dernier point aboutit, et la seule fois où le
prix a réellement bougé, le point a été écrit sur-le-champ. Ce qui n'a jamais été vrai,
c'est `due` — jamais, et pour la seule raison que la base n'a pas encore l'âge de son
propre délai. Le lot pouvait continuer.

**Un effet de bord du passage au jour :** ce zéro va se remplir dès la prochaine journée
de relevés, là où il aurait fallu attendre le 13 septembre pour voir la première
confirmation hebdomadaire. C'est aussi ce qui rendra le mécanisme observable en
production plutôt que seulement dans les tests.

## 2. Le stockage : un point par jour, en jour UTC

`observations.py` ne compare plus une durée, il compare deux dates :

```python
due = latest is not None and _utc_day(latest.observed_at) < _utc_day(now)
```

**Le jour calendaire, et non un délai de vingt-quatre heures.** Un délai laisserait passer
un jour sur deux d'un relevé quotidien : le crawler qui tourne à 9 h 00 puis, la dérive
aidant, à 8 h 55 le lendemain, se présente à 23 h 55 du délai et n'écrit rien ; il faut
attendre le surlendemain. Le jour calendaire ne connaît pas cette dérive.

**Et le jour d'UTC, jamais celui du fuseau local.** Ce n'est pas de la prudence de
principe : l'API en service rend ses horodatages en `+02:00`, parce que Postgres les
convertit dans le fuseau de la connexion. Lire `.date()` sans conversion donnerait la date
de Paris. Le test `test_the_day_that_counts_is_the_utc_one` pose deux observations à 23 h 30
et 00 h 30 UTC — le même jour à Paris, deux jours en UTC — et repasse par la base
(`session.expire_all()`) pour que l'horodatage revienne du serveur et non de la mémoire.
Il rougit sur la ligne `return moment.astimezone(timezone.utc).date()`, et sur elle seule.

Le volume : une annonce leboncoin vit soixante jours et porte désormais soixante points au
lieu de neuf. Trente octets pièce — c'est le prix, et il est dérisoire.

## 3. La lecture : une confirmation par semaine, les changements jamais

`signals.thinned` éclaircit **la seule liste servie**. La cadence retenue est
**hebdomadaire**, et voici pourquoi :

| Cas | Points stockés | Points servis |
|---|---|---|
| Annonce leboncoin, vue chaque jour de ses 60 jours | 60 | **11** |
| Annonce La Centrale de cinq ans, vue chaque jour | 1 810 | **261** |

- **La courbe.** Onze points sur quatre mois se dénombrent d'un regard et se lisent
  « vérifié chaque semaine ». Quatre-vingts ne sont plus qu'une ligne pointillée — le
  défaut des pastilles « moins d'un jour », transposé au graphique.
- **Le cache de l'extension**, plafonné au premier point plus les vingt plus récents :
  à la semaine, ces vingt places couvrent près de cinq mois de suivi ; au jour, vingt
  jours. C'est la différence entre un cache qui garde toute la vie d'une annonce
  leboncoin et un cache qui évince les vrais changements avant qu'elle ne meure.
- **La réponse de l'API** : sept fois moins de points, sans qu'un seul changement de prix
  n'ait été perdu.

Ce qui survit à l'éclaircissement, et ce que chaque clause paie :

| Ce qui survit | Pourquoi | Ce qui rougit sans lui |
|---|---|---|
| Tout changement de prix | C'est le sujet, jamais du bruit | `test_a_price_change_is_never_thinned_away` |
| Le premier point | Il porte l'origine de la baisse | `test_the_first_and_the_last_point_always_survive` |
| Le dernier point | Il porte le prix courant | idem, et `…_five_years_…` |
| La confirmation qui borde un changement | Elle prouve que le prix tenait encore la veille de bouger | `test_the_confirmation_bordering_a_change_survives` |
| Une confirmation par semaine | La cadence lisible | `test_the_served_history_keeps_one_confirmation_a_week` |

Chacune de ces cinq lignes a été vérifiée en la retirant de la production : la table
ci-dessus nomme le test qui tombe, et il tombe seul.

La cadence se compte depuis le dernier point **gardé**, changements compris, et non depuis
la dernière confirmation gardée : sinon un changement au milieu d'une semaine laisserait
deux points servis à un jour d'écart, ce que l'éclaircissement est justement censé éviter.

## 4. Les valeurs dérivées

**Aucune ne bouge de sens, deux changent d'unité.** Vérifié une par une.

`stable_days` compte depuis le dernier **changement** — `changes = [p for p in points if
not p.confirmation]`, inchangé. `price_delta_since_first` se calcule sur les seuls
changements, inchangé. Les deux se lisent sur la série complète, où tous les changements
sont présents : l'éclaircissement ne peut pas les atteindre.

`price_checks` et `price_gap_days` **se lisent sur la série complète, jamais sur
`price_history`**. C'était la seule vraie chausse-trape du lot : ils décrivent la
couverture d'observation, et les lire sur l'historique allégé ferait passer une annonce
revue tous les jours pour une annonce vue dix fois avec un trou de sept jours — l'exact
contraire de ce qu'elle a vécu. `test_the_coverage_is_measured_on_the_full_series` rougit
sur cette permutation.

Ce qu'ils deviennent :

- **`price_checks` change d'unité.** Il comptait les semaines confirmées depuis le dernier
  changement, il compte désormais les **jours où l'annonce a été vue** : une annonce stable
  et bien suivie passe de huit à soixante sur sa vie. Le sens — « combien de fois a-t-on
  regardé » — est le même ; le nombre est sept fois plus grand. Le seul lecteur du produit
  ne teste que sa nullité (`if (!r.price_checks)`), il n'est donc pas trompé.
- **`price_gap_days` garde son sens et gagne sa précision.** Il ne mesurait la cadence
  d'observation qu'au travers de celle des écritures : une annonce revue chaque jour
  affichait **sept**, l'écart entre deux confirmations hebdomadaires, et non ce qu'elle
  avait vécu. Il affiche désormais **un**. Le nombre était plafonné par le mécanisme
  d'écriture, il ne l'est plus.

Cette précision gagnée était invisible : la ligne disait « vérifié chaque semaine » aussi
bien pour un gap de sept que de un. `view.js` gagne donc un palier — `· vérifié chaque
jour` en deçà d'un jour — et le seuil ne s'arrondit pas : à deux jours, la mention
redevient hebdomadaire.

Côté vendeur, `price_drop_after_days` se mesure jusqu'à la baisse, `changes(l)[-1]` : déjà
juste, mais éprouvé seulement sur des points fabriqués à la main. Un test le repasse par
`record` à la cadence quotidienne, où dix-neuf confirmations séparent maintenant la baisse
du dernier relevé, contre deux en hebdomadaire.

## 5. Ce qui reste ouvert

- **Le cas des cinq ans reste gros** : 261 points servis. C'est sept fois moins que 1 810,
  et le cache n'en garde que vingt-et-un ; mais une annonce La Centrale suivie longtemps
  restera la plus lourde réponse de l'API. Une borne au nombre de points servis — les N
  plus récents — serait le tour de vis suivant, s'il devient nécessaire. Il ne l'est pas :
  la base ne connaît pas encore d'annonce de plus de deux jours.
- **Le palier « vérifié chaque jour » ne se verra pas avant une semaine de relevés** :
  `checked()` ne s'affiche qu'au-delà de huit jours de stabilité. Le mécanisme est vrai en
  test, il n'est pas encore observable en production.
- **`price_checks` a changé d'unité sans changer de nom.** Aucun consommateur ne s'en sert
  comme d'un nombre, seulement comme d'un booléen, donc rien ne casse aujourd'hui. Si un
  affichage venait à l'énoncer, il faudra dire « vue N jours » et non « N vérifications ».
