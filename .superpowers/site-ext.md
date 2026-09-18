# Retrait de la barre de tri/filtre, branchement popup → site

## Retiré

- `src/sort.js`, `src/order.js`, `tests/sort.test.mjs` : supprimés (`git rm`), pas commentés.
- `manifest.json` : les deux entrées `src/order.js` / `src/sort.js` retirées des deux content
  scripts (leboncoin, La Centrale).
- `src/ui.css` : le bloc `.adscope-bar*` et la règle `[data-adscope-hidden]`.
- `src/sites.js` : la fonction `list()` (déduction du conteneur de cartes) et son appel dans
  `register` — plus aucun appelant depuis le retrait de `sort.js`.
- `src/sites/lacentrale.js`, `src/sites/leboncoin.js` : les propriétés `cards`/`wrap`, orphelines
  une fois `list()` retirée (elles ne nourrissaient qu'elle).
- `tests/stage.mjs` : `order.js`/`sort.js` retirés de `MODULES`.
- `src/listing.js` : l'appel `ADS.sort.sync()` et son commentaire retirés ; `DAYS` n'était plus
  qu'un alias vers `ADS.order.DAYS` — remplacé par la constante `'data-adscope-days'` en place,
  toujours écrite sur la pastille (les tests La Centrale vérifient que les deux cartes d'une même
  annonce la portent identique — gardé, sans rapport avec le tri).

## Gardé, vert

- La flèche de baisse sur la pastille (`ADS.view.fall`, dans `view.js`) — jamais touchée par
  `sort.js`/`order.js`, ses tests (`view.test.mjs`) restent verts sans modification.
- Le rendu des cartes en double sur La Centrale (`cardOf` dans `sites/lacentrale.js`, la carte
  ET sa jumelle mise en avant) — ses tests dans `lacentrale-dom.test.mjs` restent verts sans
  modification.

## Popup → site

- `popup/popup.html` : bouton `#open-app` (« Ouvrir adscope ») sous l'en-tête, toujours visible.
- `popup/popup.js` : `el('open-app').onclick` ouvre `${base(apiBase)}/app` via `window.open(url,
  '_blank')` — aucune permission nouvelle (`window.open` reste dans ce qu'une popup fait sans
  geste supplémentaire, contrairement à `chrome.tabs.create`). Garde `isBase()` avant d'ouvrir,
  comme les autres actions qui touchent à `apiBase`.
- Tests ajoutés dans `tests/popup.test.mjs` (+ mock `window.open` dans `tests/popup-dom.mjs`,
  champ `opened` retourné par `open()`) : l'ouverture avec la bonne adresse, et l'absence
  d'ouverture sur une adresse mal formée. Cassés un par un pour vérifier le rouge :
  - retirer `isBase(apiBase)` → le test « adresse mal formée » rougit (ouvre `pas une
    adresse/app`) ;
  - retirer l'appel `window.open` → le test « ouvre l'app » rougit (`opened` reste vide).

## Trou de test comblé — `market.test.mjs`

`setup()` avait `port()` (port fermé, `lastError` posé) mais rien pour un refus net (`ok: false`
sans `lastError`) — le cas que `stage.mjs` sait aussi simuler (`fail(type, {port: false})`) pour
les tests de contenu. Ajouté `refuse()` dans `setup()` et le test « un refus net de l'API, sans
port fermé, se reprend aussi après la pause ». Cassé `!res.ok` dans `ask()` de `src/market.js`
(remplacé la condition par `chrome.runtime.lastError || !res`) : exactement ce test rougit (1
demande envoyée au lieu de 2 après la pause), les 5 autres restent verts — preuve que c'est bien
cette ligne-là qui le fait rougir. Remis en état ensuite.

## Vérifications

- `grep` des noms retirés (`sort.js`, `order.js`, `ADS.sort`, `ADS.order`, `.adscope-bar`,
  `data-adscope-hidden`, `site.list`, `cards: '...'`) : rien d'orphelin, sauf une assertion
  préexistante dans `tests/panel.test.mjs` (`querySelector('.adscope-bar')` sur le panneau,
  jamais lié à `sort.js` — cette classe n'a jamais existé dans `panel*.js`, l'assertion était déjà
  trivialement vraie avant ce lot et n'est pas dans mon périmètre).
- Tous les fichiers source touchés ≤ 150 lignes (`sites/lacentrale.js` et `sites/leboncoin.js` à
  exactement 150, `popup.js` à 147).
- `node --test tests/*.test.mjs` : 359 verts, 0 rouge (368 avant retrait de `sort.test.mjs` [12
  tests], +3 tests ajoutés ici = 359).
- HEAD inchangé (`a25daec`), aucun `git add -A`, rien touché hors `extension/`.

## Reste à commiter

Par chemin, pas encore fait au moment d'écrire ce rapport — voir le prochain message pour le
détail des commits.
