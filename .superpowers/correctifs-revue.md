# Correctifs de la revue

Huit défauts relevés en revue sur la branche `feat/api` — un bloquant, quatre importants,
quatre mineurs — corrigés en huit commits thématiques, test d'abord.

Base : `0251bcd` · commits : `a6dc3ef` → `aa5ad34`
Suites : **189 tests** verts (`cd extension && node --test tests/*.test.mjs`) et
**141 tests** verts (`cd api && ./.venv/bin/pytest tests/ -q`), contre 170 et 115 avant.
La perte de lot et les statistiques vendeur ont été éprouvées sur la base de
développement (16 714 annonces réelles), `pg_dump` pris avant toute manœuvre.

---

## 1. Bloquant — un segment d'URL réduit à des points remonte d'un niveau

**Le défaut.** `encodeURIComponent('..')` rend `..` : le point n'est pas un caractère
réservé. Le segment survit à l'encodage et l'analyseur d'URL le résout *avant* l'appel.
Mesuré avant correction, sur le chemin réellement appelé :

| `site` | `sellerId` | chemin construit | chemin appelé |
| --- | --- | --- | --- |
| `lbc` | `..` | `/v1/sellers/lbc/..` | `/v1/sellers/` |
| `..` | `me` | `/v1/sellers/../me` | `/v1/me` |
| `..` | `..` | `/v1/sellers/../..` | `/` |

`%2E` ne sauve rien : la spécification d'URL traite `%2e` comme un point pour la
résolution des segments. Aujourd'hui `site` est la constante `'lbc'` et un seul niveau
était atteignable, sans effet — mais le commentaire du code et le rapport
`echantillonnage.md` affirmaient l'injection fermée, ce qui était faux.

**Le correctif** — `extension/popup/seller.js`. Un segment qu'on ne peut pas écrire comme
un segment n'est pas un vendeur : la demande n'est pas faite. `segment()` rend `null` sur
une chaîne réduite à des points, et `fetch` rend `null` sans appeler. Le commentaire dit
maintenant pourquoi l'encodage ne suffisait pas ; la note du rapport est corrigée.

**Les tests** — `extension/tests/seller.test.mjs`. Ils passent tous par
`new URL(url).pathname` : c'est le chemin appelé qui est vérifié, jamais la chaîne
construite. `.`, `..` et `...` sont couverts sur les deux segments et sur les deux à la
fois ; deux tests vérifient que l'encodage reste en place pour `/`, `?`, `#` et pour un
identifiant qui écrit ses points en pourcent (`%2e%2e` → `%252e%252e`, un seul segment).
Sept tests écrits, sept rouges pour la bonne raison — chemin `/v1/sellers/`, `/v1/me`,
`/` — puis verts.

---

## 2. Important — un nom de boutique hors gabarit faisait perdre cent observations

**Le défaut, reproduit sur l'API en service et la base réelle.** Un lot de cent
observations dont une portait un nom de 200 caractères :

```
HTTP 422 {"detail":[{"type":"string_too_long","loc":["body","items",42,"seller_name"]…
select count(*) from listings where site='tst'  →  0
```

Aucune des cent n'entrait en base. En sondant plus loin, le défaut s'est révélé plus
large que `seller_name` : `model`, `postal_code` et `year` n'ont **aucune borne dans le
schéma** et une colonne plus étroite qu'eux — ils repartaient en **500**, même perte.
Et `ADS.sync` marque les identifiants comme transmis avant la réponse : rien n'était
rejoué.

**La décision.** Trois traitements, selon ce que le champ est — c'est le sens du champ
qui décide, pas sa longueur :

- **une prose est tronquée** (`brand`, `model`, `version`, `seller_name`) : deux cents
  caractères ne sont pas un modèle, mais ce qu'ils ont de bon tient dans la colonne et le
  reste de l'observation est vrai ;
- **un code ou un identifiant est ignoré** (`seller_id`, `postal_code`) : tronqué,
  `seller_id` désignerait *un autre marchand* et mêlerait deux stocks dans les
  statistiques vendeur — mieux vaut une annonce sans vendeur qu'une annonce mal
  attribuée. Un code postal rogné désigne une autre commune ;
- **un nombre hors des bornes du plausible est ignoré** (`price`, `year`, `mileage`,
  `published_days_ago`) : il ne doit ni fabriquer un point de prix faux, ni déborder la
  colonne. Un prix négatif ne fait plus tomber le lot : il ne devient pas un prix.

L'identité de l'annonce — `site` et `site_id` — ne se rattrape pas : tronquée,
l'observation s'attacherait à une autre annonce. **Cette observation-là est refusée
seule**, et le refus est compté dans la réponse : `{"accepted": 99, "refused": 1}`. Un
refus muet aurait été la perte silencieuse qu'on ferme ici.

Les largeurs ne sont pas recopiées : `gauge.width()` les lit sur les colonnes du modèle,
le gabarit ne peut pas diverger du schéma. Et par-dessus, `ObservationsIn` valide chaque
observation **pour elle-même** : celle qui échoue pour une raison qu'on n'a pas prévue
est refusée seule elle aussi. La garantie n'est plus une liste de champs, c'est une
propriété du lot.

**Le rejeu** — `extension/src/sync.js`. Les identifiants sont relâchés quand la réponse
est mauvaise, et la charge suivante les remporte. Le commentaire d'origine avait raison
sur un point : la page produit ses lots de mutations en rafale et chacun rappelle `send`.
D'où une pause de trente secondes après un refus — elle laisse passer la rafale, pas la
page suivante. Un lot partiellement enregistré peut être rejoué : `record` est idempotent
sur l'identité de l'annonce, un doublon ne fait que monter son compteur de passages.

**Vérification sur la base réelle**, même lot de cent, cinq valeurs hors gabarit :
`{"accepted":99,"refused":1}`, 99 annonces en base, nom tronqué à 128, modèle tronqué,
code postal et année aberrante ignorés. Avant : 0 sur 100. Les 99 lignes de contrôle ont
été effacées.

**Les tests** — `api/tests/test_gauge.py` (10 tests, tous rouges avant). Trois tests de
`test_routes.py` et un de `test_signals.py` encodaient l'ancien contrat (« 422 pour une
valeur aberrante ») : ils disent maintenant que la valeur est ignorée et que l'annonce
entre. Côté extension, trois tests dans `sync.test.mjs`, dont un qui vérifie qu'une API
éteinte n'est pas resollicitée à chaque lot de mutations.

Les schémas d'entrée vivent désormais dans `api/adscope_api/intake.py`, avec
`gauge.py` qui porte les règles.

---

## 3. Important — la population des statistiques vendeur

**Le défaut.** `sellers.stats_for` compte les annonces du vendeur **présentes dans notre
base** et revues depuis moins de 30 jours — celles que la navigation de nos utilisateurs
y a mises. La popup l'annonçait « 29 annonces en ligne » : un fait sur son stock. C'est
notre échantillon. Sur la base réelle, ENTREPOT 222 en a 11 chez nous ; combien en
ligne ? Nous n'en savons rien.

**Peut-on chiffrer la couverture ?** Non. La charge leboncoin porte `store_id`, `name`,
`user_id`, `siren` — jamais le nombre d'annonces du marchand ; la fiche ouverte non plus.
Aucune donnée disponible ne borne son stock. La consigne était alors de le dire.

**Le correctif** — `extension/popup/seller.js` et `api/adscope_api/sellers.py`. Ce que la
fenêtre affiche maintenant, relevé réel :

```
Ce vendeur — ENTREPOT 222
11 annonces de ce vendeur vues par adscope
Les annonces de ce vendeur qu'adscope a croisées et revues ces 30 derniers jours.
Son catalogue réel nous est inconnu : il peut être bien plus large, et tout ce qui
suit ne parle que de ces 11.
  3 sur 11 datées depuis plus d'un mois : 27 %
  Médiane d'ancienneté : 7 j
  Baisse moyenne constatée : aucun prix n'a bougé sous nos yeux
```

La ligne de portée est **au-dessus** des chiffres, pas en note de bas de page : elle est
lue avant eux. La part au delà d'un mois porte sa population (`18 sur 29 datées`) — elle
se rapporte aux annonces dont l'ancienneté est connue, pas au nombre vu. La fenêtre
voyage avec le relevé (`window_days`) : un seul seuil, tenu par l'API, jamais réinventé
par l'affichage. Les docstrings de `sellers.py` et `SellerStatsOut` disent désormais que
`listings` n'est pas un stock.

**Vérifié sur la base réelle**, ENTREPOT 222 et ALLOCAR PRO 93, par un appel à l'API en
service.

---

## 4. Important — la mesure d'usage n'avait aucun lecteur

`usage.by_day()` n'avait pour appelants que ses propres tests. `api/scripts/usage_report.py
[jours]` l'affiche, licence par licence :

```
alexis  (73cc90bd…)
  2026-09-06    7081 annonces   11849 passages
  → 1 jour(s) actif(s) sur 1, du 2026-09-06 au 2026-09-06 · 7081 annonces, 11849 passages
```

Les jours actifs sur les jours écoulés répondent à « a-t-il décroché au bout de trois
jours ». Le regroupement (`usage.by_license`) se fait sur l'empreinte de la clé, jamais
sur le libellé : la base porte deux licences homonymes, elles ne doivent pas fondre en
une ligne — la sortie ci-dessus le montre. Quatre tests dans `test_usage.py`.

---

## 5. Important — `usage_days` grandissait sans borne

**Mesure.** 5 615 lignes et 3,2 Mo pour la seule journée du 6 septembre au moment de la
correction (7 089 lignes et 3,5 Mo en fin de journée), contre 3,7 Mo pour `price_points`
qui porte tout l'historique de prix.

**La décision : rétention courte du grain fin, résumé permanent.** Le grain (licence,
jour, annonce) ne sert **qu'à dédoublonner les annonces tant que la journée dure**. Une
fois close, il ne dit rien de plus que son compte. La journée passée est donc résumée
dans `usage_summaries` — une ligne par licence et par jour, `listings` et `observations` —
puis ses lignes fines sont effacées. Les deux questions qui font la mesure se répondent
aussi bien sur le résumé, et lui se garde sans borne : trois lignes par jour au lieu de
sept mille, quelques dizaines de kilo-octets par an.

Trois jours de grain fin sont gardés : la journée en cours en a besoin, les deux suivantes
absorbent une horloge décalée ou une observation en retard.

**Rien à lancer à la main.** La fermeture a lieu au premier lot du jour, comme le cache de
l'extension se purge au premier passage — même motif, `purgeDaily`. Elle est prise dans un
point de sauvegarde : une mesure qui trébuche n'emporte pas les observations du lot, ce
serait rouvrir le défaut du § 2. `api/scripts/usage_compact.py` la force sur une base
laissée de côté.

**Mesuré sur une copie des 7 089 lignes réelles** (base de contrôle, jetée depuis) :

| | lignes | taille |
| --- | --- | --- |
| avant | 7 089 | 3 704 ko |
| après | 3 résumés | 24 ko |

et `usage_report.py` rend exactement les mêmes nombres après la fermeture qu'avant.
Sept tests dans `test_usage.py`, dont l'idempotence, l'observation arrivée en retard sur
une journée déjà fermée, et le câblage de la route (vérifié en le débranchant : le test
rougit).

---

## 6. Mineurs

**`migrations.py:53`** — `UPDATE licenses SET automated = true WHERE label = 'crawler'`
s'appuyait sur un libellé qui n'identifie rien. La base porte deux licences homonymes, et
l'émetteur qui produit 7 081 lignes d'usage par jour s'appelle « alexis » : la migration
marquait au hasard. Elle pose maintenant la colonne et ne devine plus ;
`api/scripts/mark_automated.py <clé|empreinte> [--non]` la met sur une licence désignée,
via `auth.mark_automated` (quatre tests). Le test de migration qui attendait le marquage
au libellé dit maintenant l'inverse.

**`mint_license.py:14`** — tout argument commençant par `--` était écarté en silence, les
positionnels se décalaient, et la licence était frappée sous le mauvais libellé ; sans clé
pour la retrouver, elle ne se corrige plus. Un argument inconnu, un libellé absent ou plus
large que sa colonne arrêtent maintenant la commande (vérifié à la main sur la base de
test : code de sortie 1, rien de frappé).

**`sellers.py:71`** — `price_changed_listings` était calculé, rendu, jamais affiché. Il
sert : la ligne de baisse distingue désormais « aucun prix n'a bougé sous nos yeux » de
« aucune sur 4 changements de prix vus ». Ce n'est pas la même chose, et la seconde est un
renseignement — ce marchand tient ses prix.

**`popup.js:showSeller`** — c'était le seul appel automatique qui envoyait la clé de
licence sans avoir validé sa destination. Sans geste de l'utilisateur, l'accès ne se
demande pas : il se vérifie (`permissions.contains`). Adresse mal formée, accès non
accordé ou clé absente, et rien ne part. Trois tests.

---

## Ce qui reste ouvert

**L'émetteur automatique n'est pas marqué.** La licence `73cc90bd…`, libellée « alexis »
et *non* automatique, a produit 7 081 annonces et 11 849 passages le 6 septembre — c'est
le crawler, qui pilote un Chrome portant l'extension et poste donc avec **sa** clé. La
mesure d'usage compte ce volume comme de l'usage humain. La marquer automatique
effacerait du même coup la navigation réelle de son porteur : la vraie réparation est une
clé propre au crawler, ce qui touche `crawler/`, hors de ce lot. La commande est prête :
`./.venv/bin/python scripts/mark_automated.py <clé>`.

**Le lot rejoué peut doubler des passages.** Si l'API a enregistré les cent premières
observations puis échoué sur les suivantes, le rejeu repasse les cent premières : leur
compteur d'observations et leur usage montent d'un. Aucune donnée n'est faussée — les
points de prix sont dédoublonnés — mais la mesure d'usage surcompte d'autant, rarement.
