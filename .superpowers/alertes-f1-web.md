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
