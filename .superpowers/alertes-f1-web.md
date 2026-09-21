# Lot F1 — Alertes, côté site : rapport de fin de lot

2026-09-21. Périmètre livré : `web/` uniquement, les quatre captures
`docs/site-v0-alertes*.png`, ce rapport. `api/` non touché (lecture seule,
pour vérifier le contrat) — le lot API est déjà livré et rapporté dans
`.superpowers/alertes-f1-api.md`.

Plan suivi : `.superpowers/alertes-f1-plan.md` (§ 10, § 11 site, § 3 contrat).

---

## 1. Contrat HTTP — vérifié dans le code, pas cru sur parole

Lu `api/adscope_api/saved_searches.py`, `alert_settings.py`, `digests.py`,
`market_params.py`, `auth.py` (`require_account`), `sessions.py`
(`check_csrf`). Conforme, sans écart, à ce qu'annonçait la tâche :

```
GET/POST /v1/searches, GET/PUT/DELETE /v1/searches/{id}   (PUT complet, 404 IDOR, 409 > 50, 422)
GET/PUT  /v1/alerts/settings
POST     /v1/alerts/unsubscribe | resubscribe             (non authentifiées, X-Adscope, jeton opaque)
GET      /v1/digests?limit=20   (sans les corps)
GET      /v1/digests/{id}       (avec)
POST     /v1/digests/visit      (non authentifiée)
```

`require_account` (cookie ou clé rattachée à un compte), 401/403/404/422
comme décrit. Le site n'a rien eu à réinventer.

## 2. Ce qui est livré

**`js/api-alerts.js`** — tous les appels du lot, sur `request` (désormais
exporté d'`api.js`, une ligne). Bascule `?demo=1` vers `js/fixtures-alerts.js`
directement, jamais via `fixtures.js` (au plafond de lignes — piège nommé au
plan).

**Le marché** — `js/save-search.js` : un champ de nom déplié dans la page
(jamais `window.prompt`), pré-rempli (`suggestedName`), `query` = le même
sérialiseur que l'URL (`String(filterParams(filters))`, testé). En démo ou
session expirée, pas de recherche fictive : renvoie vers l'écran de
connexion (vérifié à la souris : voir § 5).

**« Mes alertes » (`#/alertes`)** — `js/alerts.js` assemble trois cartes :
- `js/alerts-searches.js` : une ligne par recherche, résumé lisible des
  filtres, trois cases à cocher (baisses/nouvelles/pause) qui postent un
  `PUT` complet (`payloadFor`, garde les autres champs), suppression
  confirmée en place (un second clic devient « Confirmer » — jamais
  `window.confirm`).
- Réglage du compte (email actif, suivis inclus), inline dans `alerts.js`.
- `js/alerts-outbox.js` : la boîte d'envoi, un email ouvert dans
  `<iframe sandbox="" srcdoc="…">` — la restriction maximale, posée
  correctement (`dom.el` n'écarte que `null`/`false`, jamais la chaîne vide).

**Mes suivis — tri** — `js/follows-sort.js` (pur, trois comparateurs,
égalités closes par `(site, site_id)`), branché dans `follows.js` par un
second segment à côté de la bascule 24 h / 7 j.

**Mesure d'usage** — `js/digest-visit.js` : lit `?d=`, ne fait rien en
`?demo=1`, poste `/v1/digests/visit` sans attendre, nettoie l'URL par
`history.replaceState` (le `#/route` survit, seul `d` part). Appelé une fois
au démarrage d'`app.js`, avant même la vérification de session.

**Désabonnement** — `web/desabonnement.html` + `js/unsubscribe.js`, page
statique hors session. Le POST part directement au chargement (jamais un
`GET`, que les analyseurs de liens préchargent), bouton « Réactiver » si
besoin de revenir en arrière.

**Site** — entrée de navigation « Mes alertes », `css/alerts.css` (registre
inchangé : aucune nouvelle couleur), rendu mobile vérifié par capture.

## 3. Tests

`cd web && node --test tests/*.test.mjs` → **144 passés** (111 au départ,
+33 neufs, plan en attendait ~25 — dépassement pour couvrir aussi
`fixtures-alerts.js`).

Neufs : `api-alerts.test.mjs` (6), `fixtures-alerts.test.mjs` (6),
`follows-sort.test.mjs` (5), `save-search.test.mjs` (6),
`alerts-searches.test.mjs` (4), `digest-visit.test.mjs` (6).

Chaque test nomme en commentaire la ligne de production qu'il fait rougir.
Échantillon prouvé par casse-puis-restauration (5 lignes, une par fichier
neuf le plus sensible) :

- `follows-sort.js` — comparateur `drop` → 2 tests rouges, restauré, verts.
- `digest-visit.js` — `url.searchParams.delete('d')` → 3 rouges, restauré.
- `save-search.js` — `query: String(filterParams(filters))` → 1 rouge, restauré.
- `alerts-searches.js` — `{ ...base, ...patch }` de `payloadFor` → 1 rouge, restauré.
- `api.js` — `WRITE_METHODS.has(method)` (posant `X-Adscope`) → 1 rouge côté
  `api-alerts.test.mjs`, restauré.

Suite complète revérifiée verte après chaque restauration. Les 28 tests
restants suivent le même schéma (assertion directe sur la ligne identifiée
en commentaire) sans avoir été individuellement cassés-puis-restaurés — même
réserve assumée que le rapport API (§ 6.4 de `alertes-f1-api.md`).

Aucun test ne lit l'horloge réelle : les dates viennent de `DEMO_NOW`
(`fixtures-data.js`) ou sont des littéraux dans les fixtures de test.

Aucun test ni sonde n'a fait de requête vers `leboncoin`/`La Centrale`, ni
vers l'API réelle (les tests site n'appellent jamais de réseau ; `fetch` est
soit absent, soit mocké en mémoire).

## 4. Écarts au plan, et pourquoi

1. **Regroupement des tests « nom vide »/« pas de `window.prompt` »** :
   le plan les met dans `alerts-searches.test.mjs` (§ 11, test 53), mais la
   création d'une recherche vit dans `save-search.js` (`alerts-searches.js`
   ne fait qu'ouvrir/cocher/mettre en pause/supprimer une recherche
   existante). Déplacé dans `save-search.test.mjs`, où la ligne existe
   réellement.
2. **Sonde « pas de boîte de dialogue native »** : une simple recherche de
   sous-chaîne (`source.includes('window.prompt')`) se déclenchait sur mes
   propres commentaires expliquant l'interdiction. Corrigé en cherchant la
   syntaxe d'appel (`/\b(confirm|prompt)\s*\(/`), qui ne se trompe pas sur un
   commentaire.
3. **Bug trouvé à la capture, corrigé avant livraison** : `.as-ligne` passe
   en colonne sous 640 px, mais `.as-info{flex:1 1 220px}` — une largeur en
   rangée — devient une **hauteur minimale de 220 px** en colonne (même axe,
   sens différent). Chaque recherche laissait un grand vide sous son résumé
   sur mobile. Corrigé : `.as-info{flex:none; width:100%}` dans le même
   correctif média. Visible en comparant les deux versions de
   `site-v0-alertes-mobile.png` prises pendant ce tour.
4. **Bouton « Enregistrer cette recherche » placé entre l'étiquette et le
   tri**, pas après le tri : `.compte-ligne > *:last-child{margin-left:auto}`
   pousse ainsi toujours le tri à droite, sans retouche CSS de cette règle.
   « À côté du tri » (plan § 10) est respecté sans y toucher.

## 5. Captures

`docs/site-v0-alertes.png`, `docs/site-v0-alerte-email.png`,
`docs/site-v0-suivis-tri.png`, `docs/site-v0-alertes-mobile.png` — toutes en
`?demo=1`, fixtures figées sur `DEMO_NOW`. Prises avec le Chromium mis en
cache par Playwright (`~/Library/Caches/ms-playwright`), piloté directement
en Node (le navigateur du plugin Playwright de cette session n'a aucun accès
réseau, y compris `127.0.0.1` — testé, `net::ERR_FAILED` jusque sur
`example.com`). Le site a été servi par un serveur statique local
(`python3 -m http.server`, `web/` comme racine, port éphémère), démarré et
arrêté par son propre PID — jamais `pkill`/`killall`, jamais le port 8000 ni
le service réel. Aucune requête vers `leboncoin`, `La Centrale` ni l'API
réelle : le mode démo ne fait aucun appel réseau (`digest-visit.js`,
`api-alerts.js` le vérifient par test).

Chaque capture relue avant livraison : pas de débordement, pas de texte
coupé, registre respecté (voir § 4.3 pour le bug de mise en page corrigé
avant la capture finale). Vérifié en plus, hors captures requises : le
bouton « Enregistrer cette recherche » sur Le marché, cliqué en démo, mène
bien à l'écran de connexion sans erreur console.

## 6. Réserves

1. **Couverture des preuves de test incomplète** — 19 des 33 tests neufs
   n'ont pas été individuellement cassés-puis-restaurés (même limite que le
   rapport API, § 3), même schéma d'assertion.
2. **`alerts.js` recharge la page entière après chaque écriture** (pause,
   case cochée, réglage, suppression) plutôt que de retoucher l'état en
   place — cohérent avec le style léger du reste du site (`market.js` fait
   plus fin car sa liste est bien plus lourde), mais un clic répété fait
   plusieurs allers-retours réseau visibles.
3. **Pas de test end-to-end réel contre l'API** (hors périmètre : interdiction
   de requête authentifiée à l'API réelle). La vérification du contrat est
   une lecture de code, pas une exécution croisée ; un désaccord de forme
   entre `SearchOut` et ce que `alerts-searches.js`/`save-search.js`
   attendent ne serait détecté qu'à l'usage.
4. **`desabonnement.html` poste au chargement**, sans confirmation
   utilisateur avant l'appel (le clic qui compte est celui, déjà fait, sur le
   lien de l'email — voir § 8 du plan). Pas de test automatisé dessus (pas de
   DOM en environnement de test Node, comme le reste des vues du site) ;
   vérifié seulement par lecture de `unsubscribe.js`.
5. **Aucun outillage de capture de bug visuel autre que la relecture
   manuelle** des quatre PNG — un problème de mise en page qui ne se voit
   qu'à une largeur intermédiaire (entre 640 px et 900 px, la grille passe
   à une colonne) n'a pas été vérifié.

---

## 2026-09-21 — « Je trouve la page pas très claire dans ce qu'il est possible de faire »

Le propriétaire a ouvert `docs/site-v0-alertes.png` (l'état du § 5 ci-dessus) et n'a
pas compris la page : une carte « Mes recherches » qui répète le nom en gris, quatre
cases natives bleues sans un mot d'explication (`notify_drops`/`notify_new`/`paused`
exposées telles quelles), une carte « Suivis inclus » sans dire ce que ça ajoute, une
boîte d'envoi qui ne dit ni pourquoi elle est vide ni ce qui arrivera. Refonte de la
page, sans nouvelle route (contrat § 3 du plan inchangé), pensée depuis Karim et non
depuis les colonnes de `saved_searches`.

### Méthode — le parcours de Karim, écrit avant de coder

**Karim, 42 ans, marchand à Narbonne, 25 voitures au parc.** Café en main, sur
l'ordinateur du bureau le matin, ou sur son téléphone entre deux clients. Il connaît
leboncoin par cœur ; aucun mot d'adscope. Ce qu'il veut : qu'on le prévienne quand une
voiture de ses modèles, qui traîne, baisse de prix — un vendeur qui baisse se négocie.

**1. La première fois, sur Le marché.** — « Je filtre : Renault, Clio, diesel, Nord
et Pas-de-Calais. 47 annonces. Je vois un lien bleu, *Enregistrer cette recherche*. Je
clique. Un champ s'ouvre, déjà rempli — *Renault Clio · diesel · dépt. 59, 62* — je
n'ai rien à taper. Je clique *Enregistrer*. La ligne devient : *Recherche
enregistrée.* puis, juste en dessous, *Vous serez alerté dans l'email du matin : Une
annonce en ligne depuis plus de 30 jours baisse d'au moins 3 %.* — ah, voilà ce que ça
fait, et quand. Un lien *Régler cette alerte →*. Je clique, j'atterris sur Mes
alertes. »

« En haut, une phrase sous le titre : *Chaque matin, un email avec ce qui a bougé sur
vos recherches et vos annonces suivies ; rien s'il n'y a rien à dire.* Voilà, je sais
à quoi sert la page avant même de lire le reste. Une carte *L'email du matin*, en
premier : un interrupteur bleu-violet allumé, *Recevoir l'email du matin*, et en
dessous *Envoyé à karim@garage-narbonne.fr — prochain envoi demain matin.* Je sais où
ça part et quand, sans qu'on m'invente une heure. Un second interrupteur, *Inclure mes
annonces suivies*, avec sa phrase : ce qu'il ajoute (baisses, seuils de 30/60/90 jours,
disparitions) — je comprends avant de toucher.

Plus bas, *Mes recherches*, un bouton *Nouvelle recherche* et une ligne qui dit
comment : *Filtrez le marché, puis Enregistrez cette recherche.* Ma carte : le nom que
j'ai laissé, des pastilles — Renault, Clio, diesel, Département 59, Département 60 —
je revois mes filtres sans les deviner, jamais un texte gris qui répète juste le nom.
*47 annonces aujourd'hui*, un lien *Voir les annonces*. Deux règles, chacune avec son
interrupteur : *Baisses sur les annonces anciennes*, allumée, avec en dessous une
phrase à deux menus — *Une annonce en ligne depuis plus de [30 jours] : [une baisse de
3 % ou plus].* — je vois que je peux changer ça sans qu'on me demande un chiffre.
*Nouvelles annonces*, éteinte, avec sa raison écrite : leboncoin et La Centrale le
font déjà en temps réel, adscope arrive après — je comprends pourquoi c'est éteint par
défaut plutôt que de me demander si c'est un bug.

En bas de la carte, à part : *Mettre en pause* (*Plus d'alerte, la recherche est
gardée*) et *Supprimer*. Je sais ce que chacun fait sans cliquer pour voir.

Enfin *Emails envoyés* : *Le premier email partira le matin où une de vos recherches
aura bougé. Seul ce qui se passe après l'enregistrement d'une recherche compte.* —
normal, je viens de la créer, rien pour l'instant, et ce n'est pas un problème. »

**2. Depuis l'email, « gérer mes alertes ».** — « Je reçois trop d'emails, une baisse
de 50 € me dérange. J'arrive sur Mes alertes avec mes trois recherches. Sur *Clio IV
diesel 59-62*, je change le second menu de *une baisse de 3 % ou plus* à *une baisse
de 5 % ou plus* — un clic, la ligne change tout de suite, pas de rechargement de la
page, pas de formulaire à valider. Sur *208 essence Hauts-de-Seine* je change le
premier menu de *15 jours* à *30 jours* : je serai prévenu plus tard, sur des annonces
plus installées. Je pars trois semaines : sur *Duster diesel*, je clique *Mettre en
pause* — la carte s'assombrit, un badge *En pause* apparaît, je sais que je ne
recevrai plus rien pour celle-là sans l'avoir supprimée. Si je voulais vraiment tout
couper, l'interrupteur *Recevoir l'email du matin* en haut de la page le ferait d'un
clic — et la carte le dirait elle-même : *L'email est coupé : vos recherches restent
enregistrées, mais rien ne partira.* »

**3. Rien reçu ce matin.** — « J'ouvre Mes alertes, inquiet. La carte *L'email du
matin* : l'interrupteur est allumé, *Envoyé à karim@garage-narbonne.fr — prochain
envoi demain matin.* — ça marche, donc. Je descends à *Emails envoyés* : le dernier
est daté d'avant-hier, *18 sept.* Je comprends : rien n'a bougé hier, pas de panne.
Si la liste avait été vide je serais tombé sur : *Le premier email partira le matin où
une de vos recherches aura bougé.* — le même message, qui ne me laisse jamais deviner
si c'est cassé. »

### Ce que ce parcours a changé dans le code (trouvé en l'écrivant, avant capture)

En écrivant la situation 2, aucun contrôle de la page ne permettait de changer les
seuils (`min_age_days`, `min_drop_pct`) — seule une phrase figée les affichait. Ajouté
avant la première capture : deux `<select>` (registre du site, jamais un champ
numérique) dans la phrase de la règle de baisse, chacun à choix tout faits (15/30/60
jours · dès la moindre baisse/3 %/5 %), écriture optimiste avec retour arrière si
l'API refuse — `web/js/alerts-search-thresholds.js`.

### Ce qui a changé

**Nouveaux fichiers** — `js/switch.js` (l'interrupteur du registre : piste et
pastille à l'accent, un `<input type="checkbox" role="switch">` gardé dessous,
jamais une `<div>` qui ferait semblant ; écriture optimiste, retour en arrière et
message si l'API refuse) · `js/alerts-search-rules.js` (les phrases et les choix,
purs, testés sans DOM — `dropsSentence`, `countLabel`, `payloadFor`, `withCurrent`,
les listes `AGE_CHOICES`/`DROP_CHOICES`) · `js/alerts-search-thresholds.js` (les deux
menus de seuils) · `js/alerts-digest.js` (la carte *L'email du matin*).

**Réécrits** — `js/alerts-searches.js` (une carte par recherche, plus une liste de
cases ; contrôleur qui redessine sa seule section à la pause/suppression, jamais
toute la page) · `js/alerts-outbox.js` (dates en français via `format.shortDate`,
visites dites en clair — `visitsLabel`, pas de « — » ambigu) · `js/alerts.js`
(orchestration : intro, carte email, section recherches, boîte d'envoi ; compte les
annonces de chaque recherche via `/v1/market/facets`, la même route que Le marché) ·
`js/save-search.js` (confirmation qui dit ce qui va être reçu, `dropsSentence`
partagée avec la carte, et un lien vers Mes alertes) · `js/app.js` (`api.me()` appelée
aussi en démo — `fixtures.me()` ne fait aucun réseau — pour que l'adresse s'affiche
en haut à droite même en capture) · `css/alerts.css` (registre inchangé : sol/cartes/
accent de `base.css`, rien de nouveau).

**Aucune route neuve.** Compteur par recherche : `/v1/market/facets`, déjà utilisée
par Le marché. Pause/suppression : `PUT`/`DELETE /v1/searches/{id}`, déjà du contrat.

**Mode démo** (`fixtures-alerts.js`) : `?demo=1&vide=1` sert un compte du premier
jour (aucune recherche, aucun email) — un drapeau, pas un second jeu de fixtures ;
l'email HTML de démo réécrit à l'identique du registre de `digest_html.py`.

### `api/adscope_api/digest_html.py`

- **Chaque `<a>` porte sa police en ligne** (`_link`) : sans elle, un lien sortait en
  Times bleu souligné dans la plupart des clients mail, qui n'héritent rien sur un
  `<a>`. Vérifié en cassant la ligne (`FONT` retiré de `_link`) : le test dédié rougit,
  restauré, vert.
- **Le prix tient sa propre ligne** (`_split_price_line`, sur la flèche « → » que rend
  déjà `digest_text.body_of`) : *23 900 € → 22 700 €* en gras sombre, les faits
  (cumul, ancienneté, fenêtre de constat) restent en gris dessous, jamais répétés.
  Cassé (`_split_price_line` renvoyant toujours `("", body)`) : le test rougit,
  restauré, vert.
- **Pied réécrit** : pourquoi l'email arrive, *Gérer mes alertes*, *Me désabonner* —
  les deux liens du plan, plus la phrase que le plan n'écrivait pas encore.
- `api/tests/test_digest_html.py` (neuf, 4 tests, directs sur `render()` — pas besoin
  de base pour tester du HTML) : les trois lignes ci-dessus, plus un candidat sans
  flèche de prix (`kind == "crossed"`) qui ne casse pas la carte. Chacun cassé puis
  restauré (voir ci-dessus) sauf le quatrième (assertion directe, même réserve que le
  reste de la suite).
- Service relancé par `launchctl kickstart -k gui/$UID/fr.adscope.api` après la
  modification, comme demandé — jamais autrement.

### Écarts au parcours écrit plus haut, trouvés en rejouant les captures

Les quatre PNG relus avec l'outil `Read`, et les trois parcours de Karim rejoués à la
souris et au clavier sur le site servi en local (Playwright piloté en Node, Chromium
mis en cache — même procédé que le lot précédent, § 5 ci-dessus ; navigateur du plugin
Playwright de cette session sans accès réseau, y compris `127.0.0.1`, donc écarté).

1. **Seuils non réglables — trouvé en écrivant le parcours 2, avant toute capture**,
   déjà corrigé plus haut (`alerts-search-thresholds.js`).
2. **Deux recherches sur trois affichaient « 0 annonce aujourd'hui »** sur la première
   capture — les requêtes démo héritées du lot précédent ne croisaient presque aucune
   ligne de `fixtures-rows.js` (base très réduite, 54 lignes). Un compte à zéro sur la
   carte vedette se lit comme une panne du compteur, pas comme un marché calme.
   Corrigé : les trois requêtes démo (`fixtures-alerts.js`) rejouent maintenant contre
   de vraies lignes (1 annonce chacune) ; noms de recherche ajustés en conséquence
   (« Clio diesel », « Dacia Duster — en pause »). Effet de bord positif : les
   pastilles carburant sortent bien capitalisées (« Diesel », pas « diesel ») une fois
   qu'il y a une facette à lire.
3. **Piste de l'interrupteur mal alignée quand le texte passe sur deux lignes** —
   visible sur la capture mobile initiale (« Inclure mes annonces suivies ») : `align-
   items:center` centrait la piste entre les deux lignes du texte au lieu de l'aligner
   sur le titre. Corrigé (`.switch{align-items:flex-start}`), revérifié sur la capture
   mobile finale.
4. **Rejoué à la souris et au clavier** (`Playwright`, hors des quatre captures
   requises) sur le rendu réel : cocher/décocher une règle (clic sur la piste, et Tab +
   Espace au clavier) bascule tout de suite, sans navigation ni redessin de la page (le
   nœud `<h1>` reste le même nœud DOM avant/après) ; les deux menus de seuils changent
   de valeur ; Mettre en pause/Reprendre bascule le badge *En pause* et redessine
   seulement la carte ; Supprimer s'arme puis confirme, la carte disparaît, 3 → 2.
   Aucun défaut trouvé sur ces chemins.
5. **Confirmation après enregistrement, non capturable** : sur Le marché en mode
   démo, le bouton *Enregistrer cette recherche* renvoie volontairement vers l'écran
   de connexion (comportement du lot précédent, `save-search.js`, non changé par ce
   lot) — il n'existe donc aucun moyen, dans les limites du périmètre (pas de requête
   authentifiée à l'API réelle), de capturer à l'écran le message *Recherche
   enregistrée… Vous serez alerté…* Vérifié par lecture du code uniquement (§ réserves).

### Tests

`cd web && node --test tests/*.test.mjs` → **150 passés** (144 au départ, +9 neufs
— `alerts-search-rules.test.mjs`, `alerts-outbox.test.mjs`, un test dans
`fixtures-alerts.test.mjs` —, −3 retirés avec `querySummary`, remplacée par les
pastilles de `market-chips.js`). `cd api && ./.venv/bin/pytest tests/ -q` → **816
passés** (812 au départ, +4 neufs, `test_digest_html.py`).

Chaque test neuf nomme en commentaire la ligne de production qu'il fait rougir.
Cassé puis restauré, resuite complète revérifiée verte à chaque restauration :
`dropsSentence` (interpolation des deux seuils), `withCurrent` (repli du seuil hors
choix), `visitsLabel` (le cas `0`), `videDemande` via `?vide=1` (fixtures vides),
`_link` (police manquante sur un `<a>`), `_split_price_line` (le prix se noierait
dans les faits gris). `countLabel` et `payloadFor` (repris de l'ancien fichier) et le
test du pied de l'email : assertion directe sur la ligne identifiée, non
individuellement cassés-puis-restaurés — même réserve que le lot précédent.

Aucun test ne lit l'horloge réelle : `DEMO_NOW`/dates littérales comme avant, `NOW`
fixe dans `test_digest_html.py`. Aucune requête vers `leboncoin`, `La Centrale` ni
l'API réelle — les captures tournent en `?demo=1` contre un serveur statique local
sur un port éphémère, arrêté par son propre PID.

### Réserves

1. **Compteur d'annonces par recherche (`/v1/market/facets`) non testé** : correct
   par lecture (même appel que Le marché) et par capture, mais aucun test direct ne
   couvre `facetsPerSearch` (`alerts.js`) — DOM non testable dans cet environnement,
   même limite que le reste des vues du site.
2. **Écriture optimiste des seuils (`alerts-search-thresholds.js`) et de l'email du
   matin (`alerts-digest.js`) non testée automatiquement**, vérifiée seulement à la
   souris et au clavier (§ ci-dessus) — même raison (DOM).
3. **Le message de confirmation après `Enregistrer cette recherche`** n'a pas pu être
   capturé (§ 5 ci-dessus) : vérifié par lecture de code uniquement.
4. **Compte d'annonces potentiellement à jour avec un léger retard** : `facetsPerSearch`
   se demande une fois à l'affichage de la page, pas après une écriture sur les
   seuils/filtres (qui ne touchent pas la requête de la recherche elle-même, donc le
   compte reste juste) — mais une recherche modifiée depuis Le marché puis revue sans
   recharger « Mes alertes » montrerait un compte figé jusqu'au prochain chargement.
5. **`api/tests/test_digest_html.py` n'exerce pas `digest_send.py`** (déjà couvert par
   `test_digest.py`, non touché) — lecture de contrat, pas d'exécution croisée.

---

## 2026-09-21 — Un regard neuf refuse la page : trois bloquants

Relecture des quatre captures du lot précédent par un œil neuf, avec la place de Karim.
Trois points bloquants, tous du même genre : des détails que la refonte du matin avait
laissés passer parce qu'ils ne sautent pas aux yeux dans le code, seulement sur l'image
rendue.

### Les trois bloquants, relus depuis la place de Karim

1. **Des filets partout, alors que le registre en interdit** (`switch-bloc + switch-bloc`,
   `as-regle + as-regle`, `as-actions`, `ao-ligne`). Karim ne les nomme pas « filets » —
   il dirait juste que la page a un petit côté tableau Excel, pas appli. Le trait entre
   les deux règles d'une carte, en particulier, donne l'impression que « Baisses » et
   « Nouvelles annonces » sont deux zones administratives séparées plutôt que deux
   phrases qu'on lit à la suite.
2. **L'orangé du badge « En pause » et de l'email coupé** — Karim n'a aucune raison de
   savoir que l'orangé est réservé ailleurs sur le site à « ce que le site cache » (la
   fenêtre des 60 jours sur une fiche). Mais s'il croise les deux usages, l'orangé cesse
   de vouloir dire une seule chose, et un badge de statut ne doit pas emprunter la
   couleur d'un autre message.
3. **Les lignes d'« Emails envoyés » ouvrent un aperçu sans le dire.** Rejoué à la place
   de Karim : « Je clique sur *18 sept.* parce que la ligne entière est un bouton — mais
   rien ne me dit que c'est cliquable avant que je clique, et une fois l'aperçu ouvert en
   dessous, rien sur la ligne elle-même ne me dit que c'est *celle-là* que je regarde. »
   Exactement l'ambiguïté relevée à la première lecture des captures.

### Corrections

- **Aucun filet.** Les quatre `border-top`/`border-bottom` retirés ; la séparation se
  fait par l'air (padding/gap plus généreux), jamais par un trait — `web/css/alerts.css`.
- **Orangé retiré des deux usages de statut.** `.as-badge` (« En pause ») passe en gris
  neutre (`--douce`/`--gris-pale`, le pastillage déjà utilisé ailleurs pour un statut
  neutre) ; `.ed-off` (email coupé) passe en `--douce` + gras plutôt qu'en couleur
  réservée. L'orangé reste unique à la fiche annonce.
- **Carte en pause : le corps s'atténue, jamais la carte.** Trouvé en écrivant cette
  section : l'ancien `.as-carte-pause{opacity:.6}` sur la carte entière la teintait de
  gris au contact du sol (une carte blanche à 60 % d'opacité sur un fond gris *devient*
  grise) — à l'écart du registre « cartes blanches ». Le badge et le nom restent à pleine
  lisibilité, seul le corps (`as-carte-corps`, pastilles + compte + règles) descend à
  55 % — `alerts-searches.js`, `alerts.css`.
- **Ligne « Emails envoyés » : affordance + état ouvert.** Chevron (même signe que la
  section repliable de Mes suivis, `.chev`) qui tourne à 90° sur la ligne ouverte ; fond
  au survol (gris) et fond à l'accent sur la ligne ouverte, sujet en accent ; un titre
  *Aperçu de l'email du 18 sept.* au-dessus de l'iframe, daté avec la même aide
  (`format.shortDate`) que les lignes elles-mêmes — `alerts-outbox.js`, `alerts.css`.

### Deux mineurs, bon marché

- **« seuils … franchis » reformulé** : « un passage à 30, 60 ou 90 jours en ligne » —
  moins abstrait pour qui ne lit jamais le mot « seuil » — `alerts-digest.js`.
- **« Inclure mes annonces suivies » se grise quand l'email est coupé** (`disabled` du
  switch lié à `digest_enabled`) : cocher un réglage sur un email qui ne part pas ne
  disait rien de faux, mais laissait deviner — `alerts-digest.js`.

Le mineur du fond gris de la carte en pause est traité ci-dessus (bloquant connexe, même
cause). Le mineur sur l'état « email coupé » non capturé reste : aucune des quatre
captures requises ne montre ce compte ; vérifié seulement par lecture du code et par la
règle CSS `.switch-input:disabled ~ .switch-track{opacity:.6}`, déjà en place avant ce
lot — pas de capture supplémentaire hors périmètre.

### Bug trouvé en refaisant les captures, avant livraison

Le chevron ajouté à `ao-ligne` a cassé le rendu mobile : `flex-wrap` sur quatre éléments
(jour, sujet, visites, chevron) laissait le sujet se rétrécir mot par mot jusqu'à 51 px
de large plutôt que de céder la ligne, et « Pas encore ouvert » se retrouvait imprimé
par-dessus « mouvement » (16 sept., capture mobile). Confirmé en comparant à la capture
mobile du lot précédent (pas de chevauchement) : régression de cette correction, pas un
défaut préexistant. Corrigé en groupant visites + chevron dans un seul bloc `ao-meta`
qui passe entier sous jour/sujet en mobile (`flex-basis:100%`, aligné à droite) plutôt
que de laisser le sujet et les trois autres éléments se disputer la largeur mot par mot
— revérifié par une capture rapprochée (`.ao-liste` seul, échelle 2×) avant et après.

### Captures

Les quatre refaites (`docs/site-v0-alertes.png`, `-vide.png`, `-alerte-email.png`,
`-mobile.png`), même procédé que le lot précédent (§ 5 plus haut) : Chromium mis en
cache par Playwright, piloté en Node (`executablePath` pointé directement sur le
binaire en cache — la commande `npx playwright screenshot` embarquée ne pilote pas de
clic, nécessaire pour ouvrir une ligne d'email avant la capture), servi par
`python3 -m http.server 0` sur `web/`, arrêté par son propre PID. Relues à l'outil
`Read`, comparées ligne à ligne à la version précédente : aucun filet restant, badge et
état coupé en gris, ligne d'email ouverte visiblement distincte, aucun débordement
mobile.

### Tests

`node --test web/tests/*.test.mjs` → **150 passés**, inchangé (aucun test ne verrouillait
les classes CSS ni le texte de `FOLLOWS_SENTENCE`). `cd api && ./.venv/bin/pytest
tests/ -q` → **816 passés**, inchangé (`api/` non touché ce tour-ci). Aucun test neuf :
ce tour ne change ni logique pure ni contrat, seulement CSS et structure DOM d'affichage
— même limite déjà notée au lot précédent sur les vues non testables en environnement
Node (pas de DOM).

### Réserves

1. **État « email coupé » non capturé** (mineur ci-dessus) : les quatre captures
   requises ne couvrent pas ce compte, vérifié par lecture de code seulement.
2. **`as-carte-pause`** : le choix de dimmer le corps plutôt que la carte n'a pas été
   revalidé par le propriétaire — c'est ma lecture du registre (« cartes blanches »),
   pas une confirmation explicite qu'il préfère ce rendu à l'ancien.
3. Mêmes réserves qu'au lot précédent (§ 6 plus haut), non rouvertes ici : compteur par
   recherche non testé directement, écriture optimiste des seuils/email non testée
   automatiquement, confirmation après *Enregistrer cette recherche* non capturable en
   mode démo.
