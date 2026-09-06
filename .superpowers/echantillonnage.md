# Échantillonner le prix dans le temps, et fermer une injection d'URL

Base : `2ab7bb0` · commits `756828c`, `7effdfe`, `6ff368d` (3)
Suites : extension **170 tests** verts (159 au départ), API **115 tests** verts (100 au
départ). Branche `feat/api`, rien n'est poussé. `crawler/`, `scripts/crawler-service.md`
et `scripts/fr.adscope.crawler.plist` n'ont pas été touchés ; jamais de `git add -A`.

`pg_dump` avant migration : `~/adscope-dumps/adscope-20260906-152309.dump` (808 Ko),
hors dépôt. Migration `004` appliquée à la base de développement, qui portait
12 917 annonces et 12 918 points de prix avant, et les porte tous après — les 12 918
points existants sont ressortis marqués comme des changements, ce qu'ils sont.

---

## 1. L'injection d'URL

`sellerId` et `site` sortent de `owner.store_id` dans la charge leboncoin : **une page
tierce les choisit**. Interpolés tels quels dans

```js
`${apiBase}/v1/sellers/${site}/${sellerId}`
```

un `/` ou un `..` déplaçait le chemin appelé, un `?` ou un `#` lui greffait une chaîne de
requête — sur une demande qui porte la clé de licence en en-tête. `encodeURIComponent`
sur chacun des deux segments ferme la porte : deux tests le vérifient, dont un qui compte
les segments du chemin obtenu.

**Le reste du dépôt a été balayé.** Trois autres constructions d'URL, aucune du même
genre : `config.js` (`${base(apiBase)}/v1/me`) et `sw.js` (`apiBase + path`) n'interpolent
qu'un chemin constant après une adresse que l'utilisateur a lui-même enregistrée, et
`popup.js` (`new URL(apiBase).origin`) passe par le constructeur. Côté API, aucune URL
n'est construite par interpolation.

Une **remarque** en marge, non corrigée : `popup.js:showSeller` part au chargement de la
fenêtre vers `base(el('api').value)` sans repasser par `isBase()` ni par la demande de
permission, contrairement à `test` et `api-save`. L'adresse vient du stockage de
l'utilisateur, pas d'une page — ce n'est pas la même classe de défaut —, mais c'est le
seul appel automatique qui envoie la clé sans avoir validé sa destination.

## 2. L'échantillonnage

### Le trou qu'on ne peut pas combler

Un point de prix n'était écrit qu'au changement. Entre le 1er juillet à 10 900 € et le
27 août à 9 900 €, huit semaines restaient muettes — le prix a pu descendre et remonter
sans témoin. `last_seen` ne renseigne que la dernière observation, jamais les intervalles
antérieurs ; un compteur d'observations pas davantage, quarante relevés d'une semaine et
quarante étalés sur deux mois donnant le même nombre. C'est la **distribution sur l'axe
du temps** qui manquait.

Désormais : un point quand le prix change **ou** quand le dernier point remonte à sept
jours, et seulement pour les annonces effectivement revues. `CONFIRM_AFTER = 7 jours`
dans `observations.py`.

### Distinguer une confirmation d'un changement

Colonne `price_points.confirmation`, `false` par défaut — les 12 918 points déjà en base
étaient des changements et le restent. Sans cette marque, `price_history` afficherait
« 9 900 € → 9 900 € → 9 900 € » comme s'il s'était passé quelque chose. Les trois calculs
dérivés ont été repris un par un :

| calcul | avant | après |
|---|---|---|
| `stable_days` | depuis le dernier point | depuis le dernier **changement** — sinon il repartait de zéro chaque semaine |
| `price_delta_since_first` | `points[-1] − points[0]`, si plus d'un point | sur les seuls changements — sinon une annonce jamais bougée annonçait une variation de 0 € au lieu de rien |
| `price_drop_after_days` (vendeur) | jusqu'au dernier point | jusqu'au dernier **changement** — sinon chaque semaine sans changement repoussait la date de la baisse |
| `price_changed_listings` (vendeur) | annonces à plus d'un point | annonces à plus d'un **changement** — sinon un catalogue immobile passait pour un catalogue qui bouge, de zéro |

### Ce que l'utilisateur lit

Deux nombres nouveaux dans les signaux : `price_checks`, combien de fois le prix a été
revu depuis le dernier changement, et `price_gap_days`, **le plus long intervalle pendant
lequel personne ne l'a regardé**, période courante comprise. Le second est celui qui
décide : un simple compteur ne dirait rien de la distribution, l'écart maximal si.

L'encart, sur une annonce stable depuis deux mois, dit maintenant laquelle des trois
situations est la vraie :

```
Prix   stable depuis 1 mois · vérifié chaque semaine
Prix   stable depuis 1 mois · jamais revérifié
Prix   stable depuis 1 mois · non vérifié pendant 1 mois
```

La première ligne est un fait sur le vendeur ; la deuxième n'est qu'un aveu sur notre
suivi ; la troisième nomme un trou au milieu d'un suivi par ailleurs régulier. En dessous
de huit jours de stabilité la mention disparaît — il n'y a rien à dire —, et un relevé
d'avant l'échantillonnage, gardé en cache, n'affirme rien.

### Le plafond du cache

Le premier point plus les vingt plus récents : rempli de confirmations, il aurait évincé
les changements, qui sont le seul signal. Les changements passent d'abord, les
confirmations ne prennent que la place qui reste, les plus récentes. Un test écrit avant
le code montrait l'ancien plafond ne conservant qu'**un seul** changement sur dix.

Au passage, `slice(-room)` avec `room === 0` rend le tableau entier au lieu de rien :
sans le garde, une annonce à plus de vingt changements laissait quand même passer des
confirmations. C'est le test « des changements plus nombreux que le plafond » qui l'a
attrapé, après coup — il avait été écrit pour ça.

### Éprouvé sur la vraie base

Pas seulement sur des fixtures. Dans une transaction annulée à la fin, sur la base de
développement :

- `signals_for` calculé sur les **12 917 annonces réelles**, sans incident ;
- `stats_for` sur les cinq plus gros marchands de la base ;
- **200 annonces réelles observées chaque jour pendant soixante jours** : 1 601 points
  ajoutés, soit **9 points par annonce** pour 198 d'entre elles — un changement d'origine
  et huit confirmations, exactement la borne annoncée. L'annonce dont le prix a été baissé
  au trentième jour du rejeu ressort à « stable depuis 29 j, écart maximal 7 j,
  variation −500 » ;
- après `rollback`, la base compte à nouveau 12 918 points et 12 917 annonces.

### Une soustraction fausse, trouvée en chemin

Le test du trou attendait 43 jours et en obtenait 42. La cause n'est pas dans le calcul :
**deux dates tirées de la même base portent le même objet de fuseau, et Python les
retranche alors en heure murale, sans consulter le décalage.** À la bascule de l'heure
d'été, l'écart perd une heure — et `.days` un jour entier. Le défaut ne datait pas de ce
travail : `signals.py` comparait déjà `bumped_at` à `published_at`, et `sellers.py` un
point de prix à `published_at`, de la même façon. `utc()` ramène les horodatages avant
toute soustraction, aux trois endroits.

## 3. Le lot jamais relu : `9869a6f..2ab7bb0`

Signalé, non corrigé — la revue s'en chargera. Rien n'a été réécrit.

**a. Un seul nom de boutique trop long fait tomber un lot de cent.** `seller_name` est
plafonné à 128 caractères dans `ObservationIn`, et `seller_id` à 32. Ce sont du texte
libre venu de la page. Une seule annonce hors gabarit fait répondre **422 à tout le lot** :
vérifié sur le service local, deux annonces envoyées dont une avec un nom de 200
caractères, aucune des deux n'entre en base. Et `ADS.sync` marque les identifiants comme
`queued` **avant** la réponse : rien n'est rejoué. Une page entière d'observations est
perdue à cause d'une annonce. C'est le champ le plus récemment ajouté et le seul en texte
libre non contraint côté page.

**b. `usage.by_day()` n'a aucun appelant.** Ni route, ni script, ni commande. La fonction
est écrite et testée, la mesure s'accumule, mais elle ne se lit que par `psql`. La mesure
d'usage est le point du lot dont il ne reste rien de consultable.

**c. `usage_days` grandit sans borne ni rétention.** Le grain est (licence, jour,
annonce). Une seule journée de la base de développement porte déjà **3 292 lignes pour
2,8 Mo** — presque la taille de `price_points`, qui couvre tout l'historique de prix. À ce
rythme la table devient la plus grosse du schéma en quelques semaines, et rien ne la
purge. La docstring du modèle annonce « sans table d'événements » : le grain retenu en est
pourtant très proche.

**d. `record()` appelle `session.flush()` sur chaque observation**, déplacé hors du bloc
de prix pour que `bump` dispose de l'identifiant. Un lot de cent observations fait cent
`flush` et cent `upsert`. Correct, mais c'est le chemin le plus chaud de l'API.

**e. Détails.** `mint_license.py` refuse tout libellé commençant par `--` ;
`UPDATE licenses SET automated = true WHERE label = 'crawler'` s'appuie sur un libellé qui
n'est pas unique ; `price_changed_listings` est calculé, rendu par l'API et jamais affiché
par la popup.

## 4. Ce qui reste ouvert

- **Le volume en production.** Neuf points par annonce, c'est la borne d'une annonce vue
  tous les jours pendant toute sa vie. Sur 12 917 annonces, l'échantillonnage complet
  représenterait de l'ordre de cent mille points — mais seules les annonces réellement
  consultées en produisent, et le seuil de fraîcheur de six heures du service worker ne
  change rien à la cadence hebdomadaire.
- **Le seuil des huit jours** de l'affichage est un jour de battement au-dessus de la
  semaine d'échantillonnage. Une annonce revue le neuvième jour dira « non vérifié pendant
  9 j » alors que le suivi est presque régulier. À revoir sur des données réelles étalées :
  la base de développement a été semée aujourd'hui, elle ne porte encore aucun historique
  de plus de treize heures.
- **`disappeared_at` n'est posé par personne**, comme au lot précédent : la fenêtre de
  trente jours reste la seule borne du stock en ligne.
