## Revue finale — branche `feat/api` (composant API)

État vérifié : `39 passed` (conforme à l'attendu du plan), dépôt propre, aucun fichier au-dessus de 82 lignes, aucun sélecteur ni contenu d'annonce (description, photo) stocké. Les six routes et modules du plan sont là, dans les interfaces annoncées. Le socle est bon ; ce qui suit porte sur des écarts vérifiés expérimentalement, pas sur des impressions de lecture.

---

### Bloquants

**1. Le seuil de 7 jours n'est verrouillé par aucun test** — `adscope_api/signals.py:5` et `:34`, `tests/test_signals.py:47` et `:58`

C'était la question posée : la réponse est non. J'ai muté `REPUBLICATION_THRESHOLD_DAYS` et relancé la suite complète :

```
seuil=2 : 39 passed    seuil=20 : 39 passed
seuil=3 : 39 passed    seuil=40 : 39 passed
seuil=6 : 39 passed    seuil=71 : 39 passed
```

Les deux tests encadrent l'intervalle `[1, 72]` : le négatif produit un écart de 1 jour, le positif un écart de 72. N'importe quelle valeur de 2 à 71 est verte. La constante qui porte la fonction distinctive du produit (spec §9) n'est pinnée par rien. Il faut deux cas à la borne : écart de 7 jours → `republished is False` (le `>` strict), écart de 8 jours → `True`.

**2. Faux positif de republication garanti dès qu'un libellé est grossier** — `signals.py:34`, `schemas.py:19`, `observations.py:39-44`

Le seuil de 7 jours est dimensionné pour l'arrondi de « publiée il y a N jours », soit ±1 jour. Mais la cascade d'extraction de la spec §5 parse `/(\d+) (jour|mois|an)/` : « il y a 2 mois » reste constant pendant ~30 jours. Un `published_days_ago` constant pendant que `now` avance fait avancer `site_published_last` d'un jour par jour, `site_published_first` restant fixe. Mesuré :

```
libellé constant « il y a 60 j » observé 29 jours d'affilée
  -> écart site_published_last - first = 29 j, republished: True
```

Le faux positif tombe au 8ᵉ jour d'observation, pour toute annonce de plus de deux mois. C'est l'affichage « ⚠ Republiée le … » de la spec §11 déclenché à tort — exactement la contre-vérité affichée à un marchand que la spec §16 dit vouloir éviter. Le contrat `published_days_ago: int` ne peut pas porter la précision du libellé, et c'est cette branche qui fige le contrat que l'extension consommera. À trancher maintenant : soit un champ de précision (`published_precision: "day"|"month"|"year"`) et un seuil dépendant de l'unité, soit l'obligation faite à l'extension de ne jamais émettre autre chose qu'une précision au jour, écrite dans `schemas.py` et dans la spec.

**3. Une seule observation aberrante empoisonne l'annonce définitivement** — `schemas.py:19` et `:12`, `observations.py:40-44`

`published_days_ago` n'a aucune borne. Mesuré avec une valeur négative (extraction erronée, horloge client faussée, appel direct du crawler) :

```
published_days_ago=-400 -> first: 2026-07-07  last: 2027-10-10  republished: True
après une observation saine  -> republished: True   (irréversible)
```

Les bornes étant monotones par construction — `min` d'un côté, `max` de l'autre — aucune observation ultérieure ne peut réparer. La date de publication passe dans le futur sans être rejetée. `Field(ge=0, le=3650)` sur `published_days_ago` et `Field(ge=0)` sur `price` coûtent deux lignes et ne relèvent pas de la validation défensive superflue : ils protègent un invariant explicitement irréversible.

---

### Importants

**4. Perte de mises à jour concurrentes sur `observations` et sur les deux bornes de publication** — `observations.py:35-44`

`record()` lit l'annonce sans verrou, calcule en Python, puis émet un `UPDATE … SET colonne = <littéral>`. Aucun `with_for_update()`, aucun incrément SQL atomique. Mesuré avec dix threads synchronisés sur une barrière :

```
10 observations simultanées, annonce connue, même prix
  -> points de prix : 1 (attendu 1)  ✓
  -> observations   : 2 (attendu 11) ✗
```

Le compteur est celui affiché « · 3 vues » (spec §11) : il sous-compte massivement dès que la base installée grandit, c'est-à-dire précisément dans le régime que la mutualisation vise.

Le même mécanisme atteint les bornes de publication. Avec deux observations concurrentes portant des anciennetés différentes (90 j et 60 j sur une annonce connue à 30 j) :

```
borne basse perdue (elle a avancé) sur 10/12 essais concurrents
```

`site_published_first` avance — violation directe de l'invariant que vous nommez. Le cas ne se manifeste pas quand les deux écritures calculent la même valeur, SQLAlchemy omettant alors la colonne de l'`UPDATE` ; il se manifeste dès que deux observations divergent, ce qui est le cas normal entre une fiche et une carte de résultats.

Bonne nouvelle sur le même terrain : **la règle « un point de prix par changement réel » tient sous concurrence** (1 point pour 10 requêtes simultanées). Le `session.flush()` de `observations.py:47` prend le verrou de ligne avant le `SELECT` du dernier prix, ce qui sérialise les écrivains sur une même annonce. C'est correct, mais par effet de bord et non par intention écrite : un déplacement du `flush` casserait la garantie sans qu'aucun test ne le signale.

**5. Première observation simultanée d'une annonce inconnue → erreur 500** — `observations.py:15-25`

Pas d'`INSERT … ON CONFLICT`, pas de reprise sur `IntegrityError`. Mesuré :

```
10 premières observations simultanées -> 2 requêtes en IntegrityError,
                                         2 observations comptées sur 10
```

Deux utilisateurs ouvrant la même annonce neuve au même instant : l'un reçoit un 500. C'est le scénario que la spec §8 met en avant pour justifier la mutualisation.

**6. Empreinte constante `45ca31c3315a` pour toute annonce sans détail véhicule** — `observations.py:32`

Confirmé : l'empreinte est recalculée inconditionnellement ; les cinq champs à `None` donnent la constante du vecteur vide, jamais `None`.

```
empreinte sans détails véhicule : 45ca31c3315a  ==  fingerprint(None×5)
```

`Listing.fingerprint` (`models.py:18`) et `SignalsOut.fingerprint` (`schemas.py:40`) sont tous deux `str | None` : `None` était la valeur prévue pour l'inconnu, rien ne l'écrit jamais. Toutes les annonces sans tuple se regroupent sur la même clé, indexée, et c'est la clé de jointure que la spec §4 dit stocker maintenant « parce que les empreintes du passé ne se recalculent pas ». `tests/test_signals.py:68` construit exactement ce cas sans rien asserter dessus. Corriger en ne calculant que si au moins un champ est renseigné.

Effet connexe, `observations.py:32` toujours : l'empreinte est réécrite à chaque observation. Un kilométrage qui évolue la change silencieusement, alors que le kilométrage est dans la clé par choix explicite.

```
0c4dca96a7dc -> ec824e289d81   (62686 km -> 63500 km)
```

Le rapprochement d'annonces au kilométrage différent devant se faire « par distance » (spec §4), écraser l'empreinte d'origine détruit l'ancre. À arbitrer : figer l'empreinte à la première valeur complète, ou assumer explicitement la réécriture dans `fingerprint.md`.

**7. La parité JS/Python n'est vérifiée que d'un seul côté, et le contrat écrit ne suffit pas à la garantir** — `shared/fingerprint.md:9-13` et `:17-19`

Le point positif d'abord, puisque c'était une question : **les vecteurs partagés sont réellement la source de vérité du test Python**. `tests/test_fingerprint.py:8-17` charge `shared/fingerprint-vectors.json` (chemin `parents[2]` correct), paramétrise dessus et n'assert aucune valeur recopiée. Rien n'est moulé sur l'implémentation.

Mais il n'existe aucun `extension/` dans le dépôt : l'égalité annoncée par la spec §4 n'est aujourd'hui attestée par aucun test exécutable, et `fingerprint.md:33` affirme déjà que les vecteurs sont « asserté[s] par les tests de l'extension » qui n'existent pas. Surtout, le document ne pin pas les deux points où les deux langages peuvent diverger :

- « suppression des caractères de catégorie `Mn` » sans donner l'expression JS. La recette courante `/[\u0300-\u036f]/g` n'est **pas** équivalente à `\p{Mn}` : elle laisse passer tout diacritique hors du bloc Combining Diacritical Marks. Il faut écrire `.replace(/\p{Mn}/gu, '')` dans le document.
- « `year` et `mileage` convertis en chaîne » sans imposer le type entier. Vérifié :

```
fingerprint_key("A","B","C", 2018.0, 62686.0) -> 'A|B|C|2018.0|62686.0'
équivalent JS String(2018.0)                  -> 'A|B|C|2018|62686'
```

Par la route HTTP le risque est nul, Pydantic coerce `2018.0 → 2018` et rejette `2018.5` (vérifié). Mais **le crawler écrit directement en base** (spec §10) et appellera `fingerprint()` sans passer par Pydantic. Une ligne dans `fingerprint.md` et un vecteur non entier suffisent. Cela reprend et durcit le point T1, qui était classé mineur à tort dès lors qu'on tient compte du chemin crawler.

**8. `source` est piloté par le client** — `schemas.py:23`, `main.py:26`

N'importe quelle licence peut poster `{"source": "crawler"}`. Or la spec §8 dit que `source` « est ce qui permettra de mesurer l'apport réel de la base installée » : la mesure devient infalsifiable. `License` n'a aucun attribut permettant de distinguer une clé crawler d'une clé utilisateur. Le plus simple ici : forcer `source="user"` sur la route, le crawler écrivant en base sans passer par l'API.

---

### Mineurs à corriger avant fusion (coût faible, gain réel)

**9. N+1 sur `/v1/listings/batch`** — `main.py:32-36`, `signals.py:10`. Mesuré : **31 SELECT pour 30 identifiants**. La route existe précisément pour que les 24 cartes « tiennent en un aller-retour » (spec §7). Un `.options(selectinload(Listing.prices))` sur la requête ramène à 2. Corriger en même temps `signals.py:8` : le paramètre `session` est inutilisé, il devient le vecteur naturel du chargement groupé, sinon le supprimer.

**10. `signals.py:10`** — `sorted(listing.prices, key=…)` duplique le `order_by="PricePoint.observed_at"` de `models.py:42`. Tri défensif redondant, contraire à la règle du brief. À supprimer (validé par 9 : la relation reste ordonnée avec `selectinload`).

**11. `observations.py:51`** — `order_by(observed_at.desc()).limit(1)` sans départage. Ajouter `PricePoint.id.desc()` : une ligne, et cela rend déterministe le cas où le crawler passe un `now` explicite identique pour un lot.

**12. Couverture manquante de la règle centrale à travers HTTP** — `tests/test_routes.py`. Aucun test ne poste deux fois la même observation sur la route et ne vérifie qu'un seul point de prix existe. La règle est prouvée en unitaire (`test_observations.py:26`), jamais de bout en bout, alors que c'est le chemin réel des trente utilisateurs.

**13. `tests/test_routes.py:72`** — la borne acceptée de 30 identifiants n'est jamais exercée ; `max_length=29` passerait la suite. Un cas à 30 → 200.

**14. `adscope_api/auth.py:23`** — la borne `expires_at == now` (rejetée par le `<=`) n'est couverte par aucun test. Un troisième cas fige le choix strict.

**15. `tests/test_auth.py:48-51`** — `test_raw_key_is_never_stored` n'assert qu'une inégalité : un encodage réversible passerait. Asserter l'égalité avec `hashlib.sha256(key.encode()).hexdigest()`.

---

### Points parkés : ce qui n'est pas à corriger

- **T1 [Important] « le rapport de l'implémenteur n'existe pas » — constat faux, à retirer.** Les six rapports existent : `.superpowers/sdd/2026-09-05-adscope-api/task-{1..6}-report.md`. Ils sont invisibles à `git ls-files` parce que `.superpowers/sdd/.gitignore` contient `*`. `task-1-report.md:36-75` traite d'ailleurs explicitement la question du RED et fournit un RED reconstruit (implémentation retirée, caches purgés, `ModuleNotFoundError` capturé). Le doublon de ce finding est un artefact de tri.
- **T1 [Minor] pyproject** : `fastapi`, `sqlalchemy`, `psycopg` sont consommés par les tâches 2 à 6 de la même branche. Rien à faire.
- **T2 [Minor] `config.py:7`, `db.py:13`, `db.py:17`, `conftest.py:22`** : réels mais sans conséquence à ce stade. Le seul qui mérite un geste est le doublon `conftest.py:22-23` / `db.create_all` : passer la fixture par `adscope_api.db.create_all(engine)` supprime la duplication et donne au passage la couverture manquante d'une fonction aujourd'hui exercée par le seul `mint_license.py`.
- **T2 [Minor] `test_listing_roundtrip`** : diagnostic exact (`expire_on_commit=False` fait lire la map d'identité). Un `session.expire_all()` avant la requête. Non bloquant.
- **T4 [Minor] `price_delta` premier→dernier** : comportement voulu, mais confirmé contre-intuitif — `10900 → 9900 → 10400` rapporte `−500 sur 10 j` là où la dernière variation est `+500 sur 5 j`. Un test à trois points, ou un renommage en `price_delta_since_first`, lève l'ambiguïté avant que l'extension ne bâtisse l'affichage `▼ −1 000 € en 12 j` dessus.
- **T4 [Minor] tests négatifs faibles** (`test_signals.py:58` et `:67`) : le constat est juste, mais il est absorbé par le point 1 — ajouter les deux cas de borne rend `test_rounding_drift` discriminant.
- **T5 [Minor] transcript non verbatim** (`task-5-report.md:57`) : à corriger dans le rapport, sans effet sur le code.
- **T6 [Minor] `db.py:30` duplication `get_session`/`session_scope`, `main.py:15` `WWW-Authenticate`, `now = now or`** : acceptables. Le `now = now or` (`auth.py:19`, `observations.py:13`, `signals.py:9`) mérite quand même le passage à `if now is None`, trois occurrences identiques, pure justesse d'intention.

---

### Une déviation au plan, correcte et à conserver

`observations.py:23` ajoute `observations=0` là où le plan (ligne 707-710) ne l'avait pas. Ce n'est pas une liberté : `mapped_column(default=0)` est un défaut appliqué à l'`INSERT`, donc l'attribut vaut `None` en Python avant le flush et `listing.observations += 1` lève un `TypeError`. Vérifié en retirant l'argument :

```
7 failed in 0.21s   (TypeError sur les 7 tests de test_observations.py)
```

Le code du plan tel qu'écrit ne tourne pas. La correction est juste ; elle mériterait d'être remontée au plan pour que le crawler, qui réutilisera `record()`, n'hérite pas du piège.

---

### Verdict

Trois bloquants, qui portent tous sur la détection de republication — la fonction que la spec §9 désigne comme celle qui distingue le produit : le seuil non verrouillé (1), le faux positif garanti sur libellé grossier (2), l'empoisonnement irréversible par entrée non bornée (3). Aucun n'est coûteux : deux tests de borne, un champ de précision ou une contrainte écrite sur l'extension, deux `Field(ge=…)`.

Les points 4 à 6 sont à traiter avant la mise en ligne plutôt qu'avant la fusion, mais 6 (empreinte constante) devrait passer maintenant : c'est la seule donnée que la spec déclare non recalculable, et chaque jour d'exploitation en écrit de mauvaises.