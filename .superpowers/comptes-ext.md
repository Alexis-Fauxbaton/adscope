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

---

# Revue fermée : les trois défauts corrigés

HEAD de départ 89eda88. Les trois points restés ouverts au lot précédent — le
badge qui ne s'efface pas en repassant en mode clé, `src/lookup.js` et
`popup/seller.js` non migrés, `popup/popup.js` à 159 lignes — sont corrigés.
369 tests verts (373 avant, voir le compte plus bas), y compris avec `Date`
décalée d'un an.

## Le badge ne s'effaçait pas en passant en mode clé

`src/auth.js:26` sortait de `mark()` par `if (cfg.licenseKey) return false`
avant toute mise à jour de `down` : un « ! » posé en mode session restait posé
à vie une fois une clé configurée, même l'appel suivant réussi. La branche clé
efface maintenant le badge si `down` l'exigeait, avant de continuer à ne
jamais le reposer elle-même (une clé de machine reste son propre défaut) :

```js
if (cfg.licenseKey) {
  if (down) {
    down = false
    await chrome.action.setBadgeText({ text: '' })
  }
  return false
}
```

Test : `tests/sw.test.mjs`, « le badge « ! » s'efface en passant en mode clé »
— 401 hors mode clé pose le badge, puis une clé est écrite dans le stockage et
un appel réussi suit ; cassé en revenant à l'ancienne ligne pour le vérifier.

## `src/lookup.js` et `popup/seller.js` migrés à leur tour

Les deux appels que le lot précédent avait signalés sans les corriger
(§ « Ce qui reste hors de ce lot » ci-dessus) construisaient encore leur propre
`Authorization: Bearer` et sortaient tôt sans clé — un marchand sans clé ne
voyait donc plus « Ce vendeur », ni sur le panneau ni sur la popup : le défaut
qu'on venait de corriger une fois pour les autres routes.

- **`src/lookup.js`** : `get()` passe par `ADS.auth.headers`/`credentials`
  (comme `sw.js` le fait déjà pour `sync`, `follow`, `absent`) et par
  `ADS.auth.mark()` pour le badge, au lieu d'un en-tête construit sur place
  derrière `if (!licenseKey) return null`.
- **`popup/seller.js`** : la partie réseau (segment, encodage, fetch, clé) est
  retirée — ce fichier ne fait plus que du formatage pur (`block`). La demande
  passe désormais par le service worker, comme `/v1/me` (la raison donnée plus
  haut pour ce choix s'applique enfin ici aussi) : `popup/popup.js` envoie
  `{ type: 'seller', site, sellerId }` par `chrome.runtime.sendMessage`, et
  `sw.js` la relaie à `ADS.lookup.seller` — la popup n'a plus de clé à porter
  ni de destination à valider avant d'envoyer, ce qui rend `isBase`/`granted`
  sans objet pour cet appel.

`grep -rn "fetch(" extension/src extension/popup` ne rend plus que trois
endroits qui *appellent* fetch (`src/lookup.js`, `src/sw.js`,
`popup/config.js`) et un seul qui *construit* l'authentification :
`ADS.auth.headers`/`credentials` dans `src/auth.js`. `popup/config.js` n'est
pas touché — sa fonction `probe()` teste une clé que l'utilisateur vient de
taper, pas encore enregistrée (le bouton « Tester »), un outil de diagnostic
pour une clé de machine explicite, sans rapport avec le mode session ; la
tâche ne le nommait pas.

Tests : `tests/lookup.test.mjs` gagne un test « sans clé de licence, les deux
lectures partent quand même — en cookie de session » et reprend les tests de
garde de segment (points, barres, encodage) qui vivaient en double dans
`tests/seller.test.mjs` — la même garde `DOTS`/`segment` de `src/lookup.js` est
maintenant le seul endroit qui la construit, pour les deux appelants (panneau
et popup). `tests/seller.test.mjs` ne garde que les tests de `block()` (pur,
sans réseau). `tests/popup.test.mjs` : le test « sans clé de licence, aucune
demande ne part » devient « … la section « Ce vendeur » part quand même » ; les
deux tests qui gardaient la demande derrière une adresse valide et un accès
accordé sont retirés — cette vérification n'a plus de sens ici, elle n'existe
pas non plus pour `/v1/me` ou le cache, relayés de la même façon.

## `popup/popup.js` découpé

Il était à 159 lignes. La configuration de compte (clé de machine, adresse de
l'API, bouton « Tester », état connecté/déconnecté) part dans
`popup/account.js` (nouveau, `ADS.account`, 90 lignes) — un module au même
gabarit que les autres modules de la popup (`ADS.config`, `ADS.report`…),
chargé après `dom.js`/`config.js` dans `popup.html`. `popup/popup.js` retombe
à 76 lignes : le diagnostic de page, le résumé, « Ce vendeur », le cache.

`popup/dom.js` gagne `note()` (la note sous un bouton — clé, adresse, test,
cache), partagée par `account.js` et `popup.js`, plutôt que dupliquée.

`tests/popup-dom.mjs` charge `account.js` avant `popup.js` dans son harnais,
comme `popup.html` le fait.

## Fichiers touchés dans cette passe

| Fichier | Lignes | Ce qui a changé |
|---|---|---|
| `src/auth.js` | 49 | le badge s'efface en passant en mode clé |
| `src/lookup.js` | 47 | passe par `ADS.auth`, plus de garde `!licenseKey` |
| `popup/seller.js` | 111 | formatage seul, plus de réseau |
| `popup/account.js` | 90 | nouveau — clé, adresse, compte (extrait de popup.js) |
| `popup/popup.js` | 76 | diagnostic, résumé, vendeur, cache |
| `popup/dom.js` | 49 | `note()` partagé |
| `popup/popup.html` | — | `<script src="account.js">` avant `popup.js` |

Aucun fichier source de ce lot ne dépasse 150 lignes.

## Vérifié

`cd extension && node --test tests/*.test.mjs` → 369 pass, 0 fail (373 avant
cette passe ; -13 tests de réseau dupliqués dans `seller.test.mjs` retirés, +10
portés dans `lookup.test.mjs`, +1 sur le badge, -2 nets dans `popup.test.mjs`
sur des vérifications devenues sans objet — détail ci-dessus). Rejoué avec
l'horloge système décalée d'un an (`--import` sur un petit module qui remplace
`globalThis.Date`, gardé hors dépôt) : 369 pass, identique. `node -c` sur
chaque fichier `.js` modifié. `node --test web/tests/*.test.mjs` : 52 pass,
inchangé (aucun fichier de `web/` touché). Pas de `git add -A` : chaque
fichier est ajouté par chemin. Les tests d'API (`api/tests`) n'ont pas été
rejoués depuis cette session — hors périmètre (`extension/` seul), et un autre
agent y travaillait en parallèle sur `feat/api`.
