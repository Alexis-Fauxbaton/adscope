# Lot Comptes — côté extension : pas de clé configurée → cookie de session

Livré sur `feat/api`, dans `extension/` seul. HEAD de départ 2407405. Un marchand
qui n'a jamais collé de clé continue de voir ses pastilles et son panneau — la
seule différence est `credentials: 'include'` au lieu de `Bearer`. Les 359 tests
de départ restent verts, plus 14 nouveaux : 373 au total, suite verte y compris
`Date` décalée d'un an.

## Ce qui a été posé

| Fichier | Ce qu'il tient |
|---|---|
| `src/auth.js` (nouveau) | le choix Bearer / cookie + jeton CSRF, et le badge « ! » — extrait de `sw.js` pour le tenir à 150 lignes |
| `src/sw.js` | `call()` passe par `ADS.auth` ; `sync`, `absent`, `follow` ne bloquent plus sur l'absence de clé ; nouveau handler `me` |
| `src/auth-notice.js` (nouveau) | la mention « adscope — reconnectez-vous », classe `ads-auth-msg` |
| `src/listing.js`, `src/detail.js` | la pastille et le panneau se remplacent par la mention quand la session est tombée |
| `src/sync.js` | `authDown()` — l'état tenu côté page, mis à jour sur chaque échec/succès réseau |
| `popup/popup.js`, `popup/popup.html` | état connecté/déconnecté via `/v1/me` relayé par le service worker ; clé reléguée, libellée « Clé — machines uniquement » |
| `src/ui.css` | le style de la mention |
| `manifest.json` | insertion de `auth-notice.js` dans les deux content scripts, avant `listing.js` |

Tests : `tests/sw.test.mjs` (mode d'appel, badge, `/v1/me`), `tests/auth-notice.test.mjs`
(nouveau — pastille, panneau, classe hors `adscope-`, ouverture, retour après succès),
`tests/popup.test.mjs` (les deux états). `tests/stage.mjs` gagne `chrome.storage.local.get`,
un mock `window.open`, et `denySession()` pour rejouer un 401.

## Permission de manifeste : aucune de plus

`credentials: 'include'` et l'en-tête `X-Adscope` ne demandent rien au-delà du
`host_permissions` déjà déclaré sur `http://localhost:8000/*` — c'est le fait
établi par le test Chrome réel décrit dans la tâche (SW d'extension avec
host_permissions, aucun préflight CORS, cookies joints y compris `SameSite=Strict`).
Je n'ai donc rien ajouté au manifeste.

## Les décisions qui ne se relisent pas dans le code

**Le badge est global, pas par onglet.** Une session tombée l'est partout ; le
compte d'alertes par onglet (existant, rouge `#9f1239`) et le badge de
reconnexion (gris `#6b7180`) se partagent la même icône sans se confondre en
couleur. `ADS.auth.mark` ne réécrit le badge qu'au changement d'état, pour ne
pas repeindre l'icône à chaque appel réussi.

**Une clé de machine ne déclenche jamais ce badge.** `ADS.auth.mark` sort tôt si
`cfg.licenseKey` est posée — un 401 en mode clé reste ce qu'il était avant ce
lot (silencieux, retenté). C'est délibéré : les machines n'ouvrent pas de
navigateur pour se reconnecter.

**La classe `ads-auth-*`, jamais `adscope-*`.** Écrit en commentaire dans
`src/auth-notice.js` : le contrôle de santé du crawl (`crawler/RUNBOOK.md`)
compte les `[class*="adscope-"]` pour juger la collecte vivante. Un test dédié
(`la mention ne satisfait pas [class*="adscope-"]`) le prouve en comptant ces
éléments sur la page une fois la mention posée.

**`detail.js` ne retente pas de lui-même sur la même fiche.** Comportement déjà
présent avant ce lot (le marquage bloque le rejeu tant que rien ne change), pas
une régression introduite ici — testé en le contournant comme `detail.test.mjs`
le fait déjà pour un autre cas (URL sans correspondance dans le bloc de
données). Le badge global et un rechargement de page restent les deux voies de
retour visibles pour une fiche isolée ; `listing.js`, lui, retente à chaque
mutation de page.

**`/v1/me` passe par le service worker, pas par un `fetch` direct de la popup.**
Les autres appels de la popup (`config.js`, `seller.js`) font un `fetch` direct
avec Bearer et j'aurais pu faire pareil ; j'ai choisi le relais pour deux
raisons — la popup n'a jamais à choisir Bearer ou cookie elle-même (c'est déjà
la responsabilité de `sw.js`), et un `fetch` direct serait entré dans le tableau
`asked` que plusieurs tests de `popup.test.mjs` comparent terme à terme,
cassant leurs assertions sans rapport avec ce lot.

## Ce qui reste hors de ce lot

**`src/lookup.js` (comparables, vendeur) reste Bearer seul**, gardé exactement
tel quel : sans clé, `comparables` et `seller` continuent de rendre `null` sans
appeler l'API. La tâche ne le nommait pas, et `market.js` dit lui-même que
« Ce vendeur » sur la fiche dépend de `seller` — un marchand sans clé ne verra
donc pas ce bloc tant que `lookup.js` n'est pas basculé à son tour sur
`ADS.auth`. Signalé plutôt que corrigé en silence : la même dualité
Bearer/cookie s'y appliquerait facilement, `lookup.js` n'a juste jamais été
nommé dans le contrat de ce lot.

**`popup/seller.js` (le bloc « Ce vendeur » de la popup) reste gardé par
`!key`** (`if (!status.sellerId || !key) return` dans `popup.js`) : sans clé
configurée, la popup ne demande jamais ces statistiques. Même remarque que
ci-dessus — hors du périmètre écrit, un marchand sans clé ne le verra pas.

## Vérifié

`cd extension && ./node --test tests/*.test.mjs` → 373 pass, 0 fail, y compris
avec `Date` décalée d'un an (`--import` sur un module qui remplace
`globalThis.Date`). `node -c` sur chaque fichier `.js` modifié. Pas de
`git add -A` : tout est ajouté par chemin.
