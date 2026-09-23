# Rapport `/audit-project --quick`

Huit passes de revue, constats seulement (aucune correction appliquée). Périmètre : `.` (tout le dépôt).

## Agent Reports

### performance-engineer
**Files Reviewed**: 62
**Issues Found**: 5 (0 critique, 1 élevé, 2 moyens, 2 faibles)

Findings:
1. **extension/src/listing.js:101** — Sévérité : élevée | Catégorie : hot-path-inefficiency | Effort : moyen
   Description : `render()` boucle sur chaque annonce de la page de résultats et appelle `site.card(document, listing)` par annonce. `leboncoin.js:card` comme `lacentrale.js:cardOf` implémentent cela avec `document.querySelectorAll(<sélecteur contenant listing.siteId>)` — une requête DOM complète et non bornée sur toute la page, pour chaque annonce. Pour une page d'environ 30-35 annonces, c'est O(annonces × taille du DOM) par rendu. `render` est lui-même enveloppé par un `MutationObserver` sur `document.body` avec `{childList:true, subtree:true}` et sans anti-rebond (`context.js:52-56`) ; le commentaire du fichier note lui-même « 29 lots dans la seconde qui suit le chargement ». Cette recherche de carte O(n × DOM) peut donc tourner ~29 fois en rafale à chaque chargement de page, et se répéter à chaque mutation DOM suivante (pagination, chargement paresseux, rafraîchissement publicitaire).
   Suggestion : interroger le conteneur de résultats une seule fois par rendu (par exemple construire une `Map` siteId → carte en parcourant une seule fois les ancres du conteneur), puis retrouver la ou les cartes de chaque annonce dans cette map, au lieu de rebalayer tout le document à chaque annonce. Cela transforme O(annonces × DOM) en O(DOM + annonces).

2. **extension/src/sync.js:25** — Sévérité : moyenne | Catégorie : hot-path-inefficiency | Effort : petit
   Description : `merge()` reconstruit l'intégralité de la map `signals` avec un étalement superficiel complet (`signals = { ...signals, [siteId]: s }`) une fois par entrée du lot entrant, au lieu d'une fois par lot. `signals` s'accumule pendant toute la session de navigation (jamais vidée avant rechargement de la page ou du service worker) et chaque page de résultats envoie un lot allant jusqu'à ~24 annonces sur ce chemin, deux fois (réponse cache puis réponse réseau). Sur une session de navigation longue, chaque nouveau lot coûte O(taille_lot × taille_signals) au lieu de O(taille_lot + taille_signals), transformant une accumulation linéaire en travail et allocations quasi quadratiques.
   Suggestion : muter une seule copie de travail par appel de `merge` (`const next = { ...signals }` avant la boucle, écrire dans `next[siteId]`, assigner `signals = next` après la boucle) afin que l'objet ne soit copié qu'une fois par lot, pas une fois par élément.

3. **api/adscope_api/sweep.py:55** — Sévérité : moyenne | Catégorie : n-plus-one | Effort : grand
   Description : `_entries` boucle sur chaque requête de recherche enregistrée active distincte (`_queries`) et, pour chacune, appelle `translate()` (une requête BDD via `_site_spelling`), `coverage_of()` (une requête d'agrégation complète `market_query.core` joignant 4 sous-requêtes de points de prix), et `cut()`, qui rappelle lui-même récursivement `_count` (une autre requête complète `market_query.core` + total) jusqu'à `MAX_ENTRIES=8` fois par recherche quand celle-ci est large, plus un appel `translate()` supplémentaire par découpe obtenue. Pour N recherches enregistrées distinctes, cela peut déclencher de l'ordre de 10 à 20N requêtes d'agrégation lourdes sur les tables `listings`/`price_points` en un seul appel `/v1/sweep`.
   Suggestion : à mesure que le nombre de recherches enregistrées croît, envisager de mettre en cache/regrouper les sous-résultats répétés (par exemple mémoïser `translate`/`_site_spelling` par marque+modèle canonique au sein d'un même appel `/v1/sweep`, puisque de nombreuses recherches partagent la même marque/modèle) plutôt que de rejouer la jointure complète `core()` par recherche et par découpe récursive.

4. **api/adscope_api/digest_build.py:71** — Sévérité : faible | Catégorie : n-plus-one | Effort : grand
   Description : `candidates_for` boucle sur chaque recherche enregistrée non suspendue d'un compte et appelle `drops_for`/`new_for` par recherche, chacune exécutant une jointure `market_query.core` complète plus une requête de points de prix fenêtrée. `send_digests.py` appelle ensuite cette fonction une fois par compte, pour tous les comptes de la base — le coût du batch quotidien des digests croît donc en O(comptes × recherches_par_compte) requêtes lourdes. Pas sur un chemin critique orienté utilisateur, mais c'est le même schéma N+1 que la revue est chargée de signaler, et cela ralentira le batch quotidien à mesure que la base de comptes grandit.
   Suggestion : priorité basse compte tenu de l'échelle actuelle (une exécution chaque matin) ; si le nombre de comptes/recherches augmente significativement, envisager de consolider les appels `market_core` par recherche (par exemple en regroupant les recherches marque/modèle), de façon similaire au constat sur `sweep.py` ci-dessus.

5. **web/js/market-list.js:41** — Sévérité : faible | Catégorie : hot-path-inefficiency | Effort : petit
   Description : `peindre()` fait toujours `clear(zone)` puis reconstruit chaque carte de `state.items` via `state.items.map(carteAnnonce)`, y compris les cartes déjà affichées. Comme `charger(true)` (le gestionnaire « Voir plus ») ajoute les nouveaux résultats à `state.items` puis appelle `peindre`, chaque clic successif sur « Voir plus » recrée les nœuds DOM de toutes les cartes déjà affichées en plus de la nouvelle page, faisant croître la création totale de nœuds DOM de façon quasi quadratique avec le nombre de clics sur « Voir plus » (PAGE_SIZE=20 par clic) plutôt que linéaire.
   Suggestion : lors de `charger(true)` (ajout), ne construire et n'ajouter que les cartes de la tranche nouvellement récupérée de `reponse.items` au conteneur `.pile` existant, au lieu de vider et reconstruire toute la liste ; conserver le chemin de reconstruction complète uniquement pour `charger(false)` (un nouveau filtre).

### database-specialist
**Files Reviewed**: 38
**Issues Found**: 5 (0 critique, 2 élevés, 3 moyens, 0 faible)

Findings:
1. **api/adscope_api/saved_searches.py:94** — Sévérité : élevée | Catégorie : n-plus-one | Effort : grand
   Description : `GET /v1/searches` (et le POST/PUT d'une recherche) charge les recherches enregistrées d'un compte puis appelle `with_coverage()` une fois par ligne dans une boucle Python. Chaque appel exécute `status_of` → `coverage_of` → `counts()`, qui reconstruit et exécute l'intégralité de la requête `market_query.core()` (4 jointures externes + 2 sous-requêtes sur `listings`/`price_points`) sous forme de COUNT frais, plus la requête `GROUP BY` propre à `sweep_url.translate()`. Avec jusqu'à `MAX_SEARCHES = 50` recherches enregistrées par compte, un chargement de la page « Mes alertes » peut déclencher ~100 requêtes multi-jointures indépendantes contre les deux plus grosses tables, en série, dans une seule requête.
   Suggestion : regrouper le calcul de couverture — grouper les recherches enregistrées par forme de requête normalisée (beaucoup partageront marque/modèle) et exécuter la requête core()+count une fois par forme distincte, ou précalculer un agrégat groupé unique (par ex. GROUP BY canon_brand, canon_model avec un filtre `last_seen >= now-24h`) que toutes les lignes peuvent consulter en mémoire. Au minimum, plafonner le nombre d'appels `with_coverage` ou les sortir du chemin GET critique.

2. **api/adscope_api/usage.py:91** — Sévérité : élevée | Catégorie : transaction-handling | Effort : petit
   Description : `compact()` lit toutes les lignes `UsageDay` antérieures au seuil de rétention, insère leurs sommes dans `UsageSummary`, puis supprime les lignes source — sans verrou de ligne, verrou consultatif ni `SELECT ... FOR UPDATE` protégeant la lecture. Le garde-fou de `compact_daily()` contre une ré-exécution (`_closed_on`) est une simple lecture-puis-écriture d'une variable globale de module, sans synchronisation, et FastAPI exécute les gestionnaires de route `def` synchrones (dont `post_observations`, qui appelle `compact_daily`) dans un threadpool : deux requêtes concurrentes proches de la limite du jour peuvent toutes deux passer le test `_closed_on` et exécuter `compact()` en même temps. Les deux transactions lisent alors les mêmes lignes `UsageDay` avant que l'une ou l'autre ne valide, et ajoutent chacune ces mêmes comptes dans `UsageSummary` via `ON CONFLICT DO UPDATE ... SET observations = observations + :n` — ce qui protège contre la perte de mises à jour mais pas contre un double comptage des mêmes lignes source. Résultat : un double comptage silencieux dans `UsageSummary` (alimente `usage_report.py` / les chiffres d'usage pertinents pour la facturation), sans exception levée, donc non intercepté par le `except SQLAlchemyError: pass` existant dans `post_observations`. Le même `compact()` non protégé est aussi invoqué ponctuellement par `scripts/usage_compact.py`, qui peut entrer en concurrence de la même façon avec une requête API en direct.
   Suggestion : sérialiser `compact()` avec un verrou consultatif Postgres (`pg_advisory_xact_lock(hashtext('usage_compact'))`) pris en tête de fonction, ou verrouiller les lignes `UsageDay` candidates avec `SELECT ... FOR UPDATE SKIP LOCKED` avant l'agrégation, afin que des appelants concurrents ne puissent pas lire les mêmes lignes avant suppression.

3. **api/adscope_api/sweep.py:55** — Sévérité : moyenne | Catégorie : n-plus-one | Effort : grand
   Description : `_entries()` boucle sur chaque requête de recherche enregistrée non suspendue distincte et, pour chacune, appelle `coverage_of()` (1 exécution complète de `market_query.core()`) et `cut()` (`sweep_split.py`, récursif jusqu'à `MAX_ENTRIES=8`, chaque branche relançant `market_core()` — jusqu'à ~15 exécutions supplémentaires), puis `translate()` de nouveau par découpe obtenue (une requête chacune). Un seul appel `GET /v1/sweep` peut donc déclencher des dizaines de requêtes d'agrégation multi-jointures indépendantes, en série, sans cache ni regroupement entre recherches enregistrées pouvant partager marque/modèle.
   Suggestion : mémoïser les résultats de `market_core()`/`translate()` par signature de filtre effective au sein d'un même appel `_entries()`, et envisager de précalculer les comptages pour le petit ensemble de combinaisons distinctes (marque, modèle, type de vendeur, tranche de prix) en une requête groupée unique plutôt qu'un COUNT par découpe récursive.

4. **api/adscope_api/alert_follows.py:67** — Sévérité : moyenne | Catégorie : n-plus-one | Effort : petit
   Description : `follows_for()` déclenche une requête `PricePoint` supplémentaire (`_window_from`) par changement de baisse de prix sur chaque annonce suivie, dans une boucle imbriquée comptes × annonces suivies × changements. Cette donnée est pourtant déjà disponible : `feed_for()` (appelée juste au-dessus) charge déjà `listing.prices` avec `selectinload(Listing.prices)`, et `_feed_item` dans `feed_query.py` zippe déjà les points de prix changés consécutifs (`zip(changes, changes[1:])`) — le `observed_at` du point précédent est déjà en mémoire et ne nécessite pas un nouvel aller-retour.
   Suggestion : faire exposer par `feed_query._feed_item` le `observed_at` du prédécesseur dans chaque entrée `pairs` (il dispose déjà de `prev` dans le zip) et faire lire cette valeur par `alert_follows.py` depuis `item["changes"]` au lieu d'appeler `_window_from` par changement.

5. **api/adscope_api/models.py:22** — Sévérité : moyenne | Catégorie : missing-index | Effort : petit
   Description : La migration `006_listings_brand_model_year` crée `ix_listings_brand_model_year ON listings (brand, model, year)`, documentée comme réduisant la requête de comparables de ~15ms à ~0.8ms à 46k lignes. Cet index n'est jamais déclaré dans `Listing.__table_args__`, donc il n'existe sur aucune base initialisée via `create_all()` seul plutôt que via le registre de migrations — ce qui est exactement ce que fait `tests/conftest.py:35` pour toute la suite de tests. Le projet affirme explicitement (et teste, pour les colonnes) l'invariant « la migration et `create_all` doivent produire le même schéma », mais ce test ne compare que les ensembles de colonnes, pas les index, donc cette dérive particulière passe silencieusement la CI.
   Suggestion : ajouter `Index("ix_listings_brand_model_year", "brand", "model", "year")` à `Listing.__table_args__`, et étendre le test existant de parité des colonnes pour vérifier aussi la parité des noms d'index entre `create_all` et le registre de migrations, afin qu'un futur ajout ne puisse plus dériver de la même façon.

### api-designer
**Files Reviewed**: 32
**Issues Found**: 6 (0 critique, 1 élevé, 3 moyens, 2 faibles)

Findings:
1. **web/js/api-auth.js:25** — Sévérité : élevée | Catégorie : error-handling | Effort : petit
   Description : `call()` suppose que le champ `detail` du corps d'erreur JSON est toujours une chaîne et le passe directement à `new ApiError(status, detail)` (qui hérite d'Error, donc `super(detail)` le stringifie). Les erreurs de validation natives de FastAPI (422, levées automatiquement par Pydantic avant tout code de route — par ex. `EmailStr` rejetant une adresse malformée sur `/v1/auth/login` ou `/v1/auth/signup`) renvoient `detail` comme une liste d'objets, pas une chaîne. `new Error([...])` stringifie le tableau en `"[object Object]"` (vérifié localement). `login.js`/`signup.js` affichent ensuite `err.message` directement à l'utilisateur, donc toute entrée qui déclenche une validation Pydantic native affiche le texte littéral « [object Object] » au lieu d'un message utile — contrairement aux chaînes `detail` des `HTTPException` propres au projet (par ex. BAD_CREDENTIALS), que ce code a manifestement été écrit pour bien afficher. `web/tests/api-auth.test.mjs` ne teste que le cas où `detail` est une chaîne.
   Suggestion : dans `call()`, détecter un `detail` non-chaîne (par ex. `typeof body.detail === 'string' ? body.detail : detail`) et retomber sur le message générique `${path} a répondu ${res.status}` quand l'API renvoie la forme tableau native des erreurs de validation FastAPI.

2. **web/js/api.js:57** — Sévérité : moyenne | Catégorie : error-handling | Effort : petit
   Description : `request()` (utilisé par `market.js`, `api-alerts.js` pour recherches/réglages/digests, revisites, etc.) jette entièrement le corps de la réponse pour tout statut non-2xx autre que 401/403, le remplaçant par un message générique `${path} a répondu ${res.status}` — contrairement à `call()` d'`api-auth.js`, qui extrait `res.json().detail`. Concrètement, `POST /v1/searches` peut renvoyer 409 avec le détail « trop de recherches enregistrées » quand un marchand atteint le plafond de 50 recherches, mais le bloc catch de `save-search.js` n'affiche que le générique « L'enregistrement a échoué. Réessayez. » — le marchand n'est jamais informé de la cause, et retenter ne réussira jamais puisque la cause (quota) n'est pas transitoire. La même perte s'applique aux messages de limitation 429 et à tout autre détail d'origine serveur atteignant ce chemin.
   Suggestion : reproduire le motif d'`api-auth.js` : tenter de lire `(await res.json()).detail` et l'utiliser comme message d'erreur quand c'est une chaîne, avant de retomber sur le texte générique par code de statut.

3. **api/adscope_api/digests.py:44** — Sévérité : moyenne | Catégorie : pagination | Effort : petit
   Description : `GET /v1/digests` n'accepte que `limit` (défaut 20, max 100) sans paramètre `offset`/`page`, et aucun compte total n'est renvoyé non plus. Comme un digest est créé une fois par jour, un compte de plus de 100 jours accumule plus de digests qu'une seule page ne peut jamais en renvoyer, et rien ne permet à un client de demander la page suivante — tout ce qui précède les 100 digests les plus récents devient définitivement inatteignable via l'API. Aucun code client (`web/js/api-alerts.js:digests()`) ni aucun test ne teste la pagination au-delà de la première page non plus, ce n'est donc pas seulement une capacité inutilisée, c'est une vraie lacune.
   Suggestion : ajouter un paramètre `offset` (comme le fait déjà `/v1/market`) ou un curseur basé sur `created_at`/`id`, afin que les digests plus anciens restent accessibles.

4. **api/adscope_api/market.py:66** — Sévérité : moyenne | Catégorie : pagination | Effort : moyen
   Description : `GET /v1/follows/feed` (qui alimente la page « Mes suivis ») ne prend aucun `limit`/`offset` et renvoie toutes les annonces suivies par la licence en une seule réponse ; `feed_query.feed_for()` les charge toutes plus leur historique complet de points de prix via `selectinload(Listing.prices)`, sans borne. Contrairement aux recherches enregistrées (`MAX_SEARCHES=50`) ou à `/v1/market` (limite ≤100 imposée), rien ne plafonne le nombre d'annonces qu'une licence peut suivre, ni la taille de cette réponse/requête, donc un marchand avec un portefeuille large ou suivi de longue date paie une requête et une charge utile toujours croissantes à chaque ouverture de page, sans moyen de paginer.
   Suggestion : plafonner le nombre d'annonces suivies par licence (comme les recherches enregistrées le sont), et/ou ajouter limit/offset à `/v1/follows/feed` pour que la taille de la réponse reste bornée à mesure qu'un portefeuille grandit.

5. **api/adscope_api/rate_limit.py:77** — Sévérité : faible | Catégorie : rate-limiting | Effort : petit
   Description : `guard()` lève un 429 avec un `detail` textuel seul (RATE_LIMITED) mais ne fixe jamais d'en-tête `Retry-After`, donc les appelants n'ont aucun signal standard et exploitable machine pour savoir combien de temps patienter. Sur le client web, un 429 de `/v1/auth/login` affiche bien RATE_LIMITED en texte (`api-auth.js` lit correctement `detail`), mais rien côté client ne calcule ni n'affiche un délai d'attente réel, et les autres routes soumises à 429 atteintes via `request()` d'`api.js` perdent même ce message.
   Suggestion : lever le 429 avec un en-tête `Retry-After` (par ex. secondes jusqu'à expiration du plus ancien coup dans la fenêtre), conformément aux recommandations RFC 6585 / RFC 9110 pour les réponses 429.

6. **api/adscope_api/sweep.py:91** — Sévérité : faible | Catégorie : rest-contract | Effort : petit
   Description : `GET /v1/sweep` est la seule route substantielle de la surface API revue sans `response_model` (à comparer à tous les autres routeurs de `main.py`/`market.py`/`digests.py`/etc.), donc sa forme de réponse (`{pages, items, skipped}`) n'est pas documentée dans le schéma OpenAPI généré et n'est ni validée ni filtrée par FastAPI — tout champ superflu ou mal typé dans les dictionnaires construits à la main par `_entries`/`_budget` passerait silencieusement au lieu d'échouer un contrôle de contrat.
   Suggestion : déclarer un `response_model` Pydantic pour `GET /v1/sweep` (sur le modèle de `FeedOut`/`MarketOut`) afin que son contrat avec le crawler soit explicite et validé.

### code-quality-reviewer
**Files Reviewed**: 75
**Issues Found**: 1 (0 critique, 0 élevé, 1 moyen, 0 faible)

Findings:
1. **web/js/market-list.js:46** — Sévérité : moyenne | Catégorie : correctness | Effort : petit
   Description : « Voir plus » (le bouton `plus`) reste actif pendant que `charger(true)` est en vol : il n'est ni désactivé ni retiré tant que la réponse n'est pas revenue, et `offset` est calculé de façon synchrone à partir de `state.items.length` avant tout `await`. Un double clic rapide (ou deux Entrée sur le bouton focus) déclenche deux appels `charger(true)` qui lisent le même `state.items.length`, demandent donc la même page à l'API, et concatènent chacun leur réponse dans `state.items` — la page suivante de résultats apparaît deux fois dans la liste. Le même risque existe pour tout clic répété pendant l'attente initiale (`charger(false)`), mais y est moins visible car `zone` est vidée. `extension/src/follow.js` protège explicitement ce même type de double-appel avec un `Set` de garde — l'équipe connaît le problème, mais ce fichier n'a pas le même garde-fou.
   Suggestion : ajouter une garde simple, un drapeau `enCours` (ou désactiver le bouton dès le clic, jusqu'à `peindre`) qui empêche un second `charger` de partir tant que le précédent n'a pas résolu — par exemple `if (chargement) return; chargement = true; ... finally { chargement = false }` autour du corps de `charger`.

### test-quality-guardian
**Files Reviewed**: 46
**Issues Found**: 8 (0 critique, 0 élevé, 7 moyens, 1 faible)

Findings:
1. **api/adscope_api/sweep_split.py:53** — Sévérité : moyenne | Catégorie : missing-edge-case | Effort : petit
   Description : `cut()` peut rendre `None` (recherche trop large même après le découpage owner_type puis deux tours de découpage par prix, ou plus de MAX_ENTRIES=8 branches). Ce chemin fait passer une recherche enregistrée en `skipped: [{"reason": "trop_large"}]` dans `sweep.py::_entries`, silencieusement absente de la file de balayage. Aucun test ne construit un total assez grand pour dépasser PAGE_CAP même après un découpage complet — seuls les cas qui tiennent après un seul niveau de coupe sont couverts.
   Suggestion : ajouter un test qui pousse `expected_total` bien au-delà de ce que 8 branches (2 owner_type × 4 tranches de prix) peuvent couvrir, et vérifier que la recherche ressort dans `skipped` avec `reason: trop_large` plutôt que silencieusement absente des deux listes.

2. **api/adscope_api/login_tokens.py:21** — Sévérité : moyenne | Catégorie : missing-edge-case | Effort : petit
   Description : `MAX_PENDING = 5` : au-delà de 5 jetons en vol pour un compte et un usage, `mint()` rend `None` et `accounts._send()` renvoie silencieusement sans poster de mail — la route (signup/forgot/resend) répond pourtant comme si le mail était parti. Aucun test n'exerce ce plafond : ni `test_auth_signup.py` (resend répété), ni `test_auth_reset.py` (forgot répété) ne poussent au-delà de 5 appels pour vérifier que le 6e jeton n'est pas frappé et qu'aucun mail supplémentaire n'est posté.
   Suggestion : ajouter un test qui appelle resend/forgot 6 fois de suite sur la même adresse et vérifie que `mail_outbox` ne contient que 5 entrées (ou moins), plutôt que 6.

3. **extension/src/access.js:27** — Sévérité : moyenne | Catégorie : missing-edge-case | Effort : petit
   Description : `granted()` avale toute erreur de `chrome.permissions.contains` et répond `true` (fail-open, décision documentée en commentaire). Dans les trois suites qui exercent `access.js`, le mock `chrome.permissions.contains` ne rejette et ne lève jamais — le `.catch(() => true)` n'est donc exécuté par aucun test du dépôt. Une régression qui inverserait ce choix (fail-closed) ou le supprimerait ne ferait rougir aucun test.
   Suggestion : ajouter un cas où `chrome.permissions.contains` rejette (ou lève) pour une origine, et vérifier que `access.check()` ne signale pas de `site_access` pour cette origine (fail-open assumé).

4. **web/js/api-sweep.js:8** — Sévérité : moyenne | Catégorie : missing-test | Effort : petit
   Description : `sweep(pages)` (le seul point d'entrée réseau vers `GET /v1/sweep`) n'a aucun fichier de test, alors que son jumeau structurel `api-alerts.js` a `api-alerts.test.mjs` qui vérifie précisément l'URL, la méthode et les en-têtes envoyés. Rien ne garantit que `pages` est bien sérialisé dans les query params, ni que le mode démo bascule vers `fixtures-sweep.js`.
   Suggestion : ajouter `web/tests/api-sweep.test.mjs` sur le modèle d'`api-alerts.test.mjs` : vérifier l'URL/les params appelés en mode réel, et que le mode démo rend bien `fixtures.sweep(pages)` sans toucher au réseau.

5. **web/js/unsubscribe.js:28** — Sévérité : moyenne | Catégorie : missing-test | Effort : petit
   Description : La page de désabonnement (lien posé en pied de digest email, sans session) n'a aucun test. `render()` a trois branches observables (jeton absent, succès, échec) et aucune n'est exercée. C'est un chemin GDPR/désabonnement sensible : une régression silencieuse ne serait détectée par aucun test.
   Suggestion : ajouter `web/tests/unsubscribe.test.mjs` couvrant : `tokenFromSearch` (présent/absent), `render()` sans jeton, `render()` avec `unsubscribe()` qui résout (message + lien réactivation), `render()` avec `unsubscribe()` qui rejette (message d'erreur).

6. **web/js/switch.js:18** — Sévérité : moyenne | Catégorie : missing-test | Effort : petit
   Description : `renderSwitch` (l'interrupteur générique utilisé dans « Mes alertes ») n'a aucun test. La logique la plus importante du fichier — revert de l'état visuel et message d'erreur affiché quand `onChange` rejette, ré-activation du contrôle dans le `finally` — n'est exercée par aucun test.
   Suggestion : ajouter un test qui appelle le `change` listener avec un `onChange` qui rejette, et vérifie que `input.checked` revient à l'état précédent, que le message d'erreur s'affiche, et que `input.disabled` redevient `false`.

7. **web/js/account-page.js:17** — Sévérité : moyenne | Catégorie : missing-test | Effort : petit
   Description : `renderCompte` (page « Mon compte », changement de mot de passe) n'a aucun test alors que c'est une pièce du lot récent « comptes avec mot de passe ». Le handler `submit` a plusieurs branches non couvertes : garde-fou champs vides, succès, échec, et l'état `disabled` du bouton pendant l'appel.
   Suggestion : ajouter `web/tests/account-page.test.mjs` : soumission avec champs vides (aucun appel API), succès (champs vidés, message affiché), échec avec message API spécifique vs générique.

8. **extension/src/access.js:49** — Sévérité : faible | Catégorie : missing-edge-case | Effort : petit
   Description : `watch()` enregistre `chrome.permissions.onAdded`/`onRemoved` pour relancer `check()` à chaque changement de permission — c'est le mécanisme qui doit faire disparaître/apparaître le badge « ! ». Dans toutes les suites, le mock de `onAdded`/`onRemoved` ne mémorise ni n'appelle jamais le callback : aucun test ne simule réellement un octroi/retrait de permission en cours de session.
   Suggestion : faire garder au mock `onAdded.addListener`/`onRemoved.addListener` la fonction reçue, puis dans un test l'invoquer directement et vérifier que `ADS.health.list()` change en conséquence.

### architecture-reviewer
**Files Reviewed**: 52
**Issues Found**: 3 (0 critique, 0 élevé, 2 moyens, 1 faible)

Findings:
1. **extension/popup/popup.html:89** — Sévérité : moyenne | Catégorie : module-boundaries | Effort : petit
   Description : Le service worker (`src/sw.js`) dérive la liste des modules de site à charger depuis `chrome.runtime.getManifest().content_scripts`, précisément pour que « ajouter un site » reste « un fichier, et deux lignes au manifeste ». `popup/popup.html` ne suit pas cette règle : il charge `sites/leboncoin.js` et `sites/lacentrale.js` par des balises `<script>` codées en dur, sans lien avec le manifeste ni avec `siteFiles()`. La popup a donc sa propre liste de sites, tenue à la main. Rien ne rappelle d'ajouter une troisième balise le jour où un site de plus est déclaré, avec un effet silencieux : pas d'erreur, juste un site que `ADS.sites.all()` ne connaît pas depuis la fenêtre.
   Suggestion : générer ces balises à partir du même manifeste que `sw.js` lit, ou a minima ajouter un test qui compare la liste `src/sites/*.js` du manifeste à celle chargée par `popup.html`, symétrique à `manifest-order.test.mjs`.

2. **extension/src/lookup.js:20** — Sévérité : moyenne | Catégorie : duplication | Effort : petit
   Description : `ADS.api.call` et `ADS.lookup.get` réimplémentent chacun, indépendamment, le même socle : construire les en-têtes via `ADS.auth`, appeler `fetch`, retomber sur `ADS.reach.broke()` en cas d'échec réseau, signaler `ADS.reach.answered(res.status)` puis `ADS.auth.mark(cfg, res.status)`. Les deux chemins peuvent déjà diverger sans que rien ne le signale : `lookup.get` ne construit pas d'erreur typée (`e.unreachable`, `e.authRequired`) sur l'échec, contrairement à `call()`.
   Suggestion : faire reposer `lookup.get` sur `ADS.api.call(path, null, cfg, 'GET')` plutôt que de reconstruire fetch/auth/reach à la main ; garder `lookup.js` pour ce qui lui est propre (assemblage `comparables`/`seller`), pas pour le transport.

3. **web/js/format.js:37** — Sévérité : faible | Catégorie : consistency-of-patterns | Effort : moyen
   Description : Les règles de mise en forme (séparateur de milliers, `money`, ancienneté en toutes lettres) sont écrites deux fois : en module ES (`web/js/format.js`) et en namespace global (`extension/src/format.js`). Le commentaire en tête du fichier reconnaît la duplication mais rien ne la garantit : pas de module partagé, pas de test qui compare les deux sorties. Un correctif appliqué à l'une n'a aucune raison mécanique de se répercuter sur l'autre.
   Suggestion : si un partage direct n'est pas possible, ajouter au minimum un test de non-régression qui exécute les deux implémentations sur un même jeu de valeurs et vérifie qu'elles rendent le même texte.

### backend-specialist
**Files Reviewed**: 180
**Issues Found**: 3 (0 critique, 0 élevé, 2 moyens, 1 faible)

Findings:
1. **api/adscope_api/usage.py:117** — Sévérité : moyenne | Catégorie : background-job-safety | Effort : petit
   Description : `compact_daily()` fixe le garde-fou `_closed_on = day` avant que `compact()` ne s'exécute réellement, pas après son succès. `post_observations` enveloppe l'appel dans un SAVEPOINT et avale `SQLAlchemyError`. Si `compact()` lève en cours de route, le SAVEPOINT annule le travail UsageDay→UsageSummary, mais `_closed_on` reste fixé à la date du jour. Toute requête suivante ce même jour calendaire voit `_closed_on == day` et renvoie 0 sans réessayer, donc les lignes `UsageDay` fines ne sont plus compactées jusqu'au lendemain. La promesse du docstring du module est violée pour le reste de la journée après un simple échec transitoire.
   Suggestion : ne fixer `_closed_on = day` qu'après le succès de `compact(session, now)` (par ex. `result = compact(session, now); _closed_on = day; return result`), ou le fixer dans un chemin de succès uniquement, afin qu'une exception levée laisse le garde-fou non posé et que la requête suivante réessaie.

2. **extension/src/sync.js:67** — Sévérité : moyenne | Catégorie : correctness | Effort : petit
   Description : `queued` marque le siteId d'une annonce avant son envoi, et ne le libère que dans le callback d'échec ; en cas de succès de `sync`, rien ne retire jamais l'id de `queued`. Comme `queued` est une variable de fermeture au niveau module, vivant toute la durée de vie du content-script (une SPA leboncoin/La Centrale peut rester sur le même document pendant des heures), toute annonce synchronisée avec succès une fois est définitivement exclue de `ADS.sync.send()` pour le reste de la vie de cette page — même après que la fenêtre de fraîcheur FRESH_MS (6h) d'`observation.js` soit dépassée. Cela annule le design de rafraîchissement périodique documenté dans `observation.js` pour toute carte d'annonce qui reste visible/re-rendue sur un onglet longue durée.
   Suggestion : libérer les ids de `queued` aussi après une réponse réussie (immédiatement, ou sur une minuterie alignée sur FRESH_MS) afin qu'une annonce restant visible sur un onglet SPA longue durée soit périodiquement resynchronisée.

3. **api/adscope_api/saved_searches.py:101** — Sévérité : faible | Catégorie : concurrency | Effort : petit
   Description : `post_search()` vérifie `count >= MAX_SEARCHES` et n'insère qu'ensuite une nouvelle `SavedSearch`, sans verrouillage entre le comptage et l'insertion. Deux `POST /v1/searches` concurrents depuis le même compte (deux onglets) peuvent tous deux lire un compte sous le plafond et tous deux insérer, laissant le compte dépasser MAX_SEARCHES du nombre de requêtes en concurrence. Contournement de limite souple uniquement (pas de corruption de données), mais c'est le seul contrôle de quota du code métier revu sans aucune sérialisation.
   Suggestion : si le plafond doit être exact, verrouiller les lignes SavedSearch du compte (ou utiliser un verrou consultatif par compte / un index partiel unique avec déclencheur de comptage) autour du couple vérification-puis-insertion ; sinon, laisser en l'état et documenter la course comme acceptée (impact faible).

### security-expert
**Files Reviewed**: 42
**Issues Found**: 1 (0 critique, 0 élevé, 0 moyen, 1 faible)

Findings:
1. **api/adscope_api/intake.py:32** — Sévérité : faible | Catégorie : input-validation | Effort : petit
   Description : `ObservationIn.site` (et `AbsenceIn.site`) accepte n'importe quelle chaîne, bornée seulement en longueur — jamais restreinte à l'ensemble fermé des sites que l'API sait vraiment traiter (`urls.BUILDERS = {'lbc': ..., 'lc': ...}`). `POST /v1/observations` n'exige que `require_license` (n'importe quel compte licencié, pas seulement le crawler) : un appelant peut donc faire persister indéfiniment des lignes `Listing` sous un `site` inventé, jamais nettoyées, qui polluent le corpus mutualisé, les agrégats de facettes et les statistiques de couverture. C'est un défaut de défense en profondeur distinct de l'autorisation déjà large sur cette route : rien ne borne la valeur du champ à ce que le reste du système sait produire.
   Suggestion : remplacer `site: str` par `site: Literal['lbc', 'lc']` (ou un `field_validator` qui rejette toute valeur hors de `urls.BUILDERS`), dans `ObservationIn` et `AbsenceIn`, pour qu'un site inconnu soit refusé (et compté dans `refused`) plutôt qu'inséré en base.

## Consolidated Summary

**Total Issues**: 32
- Critique : 0 (à corriger impérativement)
- Élevé : 4 (à corriger)
- Moyen : 20 (à envisager)
- Faible : 8 (agréable à avoir)

**Top Files by Issue Count**:
1. api/adscope_api/sweep.py : 3 constats
2. api/adscope_api/saved_searches.py : 2 constats
3. api/adscope_api/usage.py : 2 constats
4. extension/src/sync.js : 2 constats
5. extension/src/access.js : 2 constats
6. web/js/market-list.js : 2 constats
