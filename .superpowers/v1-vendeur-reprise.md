# « Ce vendeur » qui disparaît : la reprise oubliée de market.js

Base : `d96d9ea` · commit : voir `git log -1 -- extension/src/market.js extension/tests`
Suite : 368 tests, tous verts (`cd extension && node --test tests/*.test.mjs`), contre 363
au départ.

## Le défaut constaté en vrai

Une fiche leboncoin, vendeur pro identifié, 5 annonces en base (seuil 3), API qui répond
correctement — et pourtant pas de section « Ce vendeur ». Le diagnostic préalable avait
innocenté l'extraction, le pipeline et le rendu par exécution ; il restait `market.js`.

**La cause.** `want()` marque `asked.add(l.siteId)` avant de savoir si la demande vendeur
aboutit, et ne le retire jamais. `ask()` avalait tout échec en silence
(`if (chrome.runtime.lastError || !res || !res.ok) return`), sans voie d'échec. Le service
worker MV3 s'endort dès qu'il est sans demande ; la première fiche chargée le réveille en
retard et le port se ferme avant sa réponse — « message port closed ». Cette seule demande
ratée supprimait la section pour le reste de la vie de l'onglet, sans trace : rien ne
rappelle `want()` sur une page statique, donc rien ne redemande.

## Le correctif — `extension/src/market.js`

`ask` reçoit désormais un callback d'échec distinct du callback de succès. `want()` reste
la porte d'entrée (un verrou par `siteId`, comme avant — un particulier reste bloqué pour
de bon), mais délègue l'envoi à `attempt(l, tries)`, qui se reprogramme lui-même :

```js
const attempt = (l, tries) =>
  ask(
    { type: 'seller', site: l.site, sellerId: l.sellerId },
    (res) => keep(l.siteId, { seller: res.stats }),
    () => {
      if (tries >= MAX_TRIES) return
      setTimeout(() => attempt(l, tries + 1), RETRY_PAUSE_MS * tries)
    },
  )
```

Trois essais au plus (`MAX_TRIES = 3`), pause croissante (`RETRY_PAUSE_MS * tries` — 5 s
puis 10 s) : assez pour laisser le service worker se réveiller, borné pour ne jamais
marteler l'API ni boucler sur un vendeur qu'elle ne connaît pas. `want()` continue de
verrouiller `asked` une seule fois par `siteId` — c'est `attempt` qui rejoue en interne,
pas de nouveaux appels à `want()` qui feraient repartir un compteur à zéro.

**La distinction 404 / échec transitoire existait déjà**, vérifiée en lisant `sw.js` et
`lookup.js` plutôt que supposée : un 404 (annonce ou vendeur inconnus de la base) est
rendu par `lookup.js` en `{ ok: true, stats: null }` — `get()` y retourne `null` sur
`!res.ok` sans jamais lever. Ce n'est donc jamais un échec du point de vue de `market.js` :
`ask` appelle `take`, pas `fail`, et aucune reprise ne se programme. Seul un `fetch()` qui
lève (API injoignable) fait remonter `{ ok: false, reason }` depuis le `catch` de
`sw.js`. Aucune modification n'était nécessaire dans `sw.js` ni `lookup.js` — d'où leur
absence du diff.

## Suivre — `extension/src/follow.js`, établi sans le corriger

Vérification demandée par le mandat : `follow.js` porte le même genre de verrou
(`if (asked.has(at)) return`), mais son callback d'échec fait déjà
`return asked.delete(at)` — relâche immédiate, sans reprise automatique (c'est un geste de
l'utilisateur, pas une observation passive : bon choix, laissé tel quel). Un test
d'intégration le verrouille : un clic qui échoue laisse le bouton « Suivre » cliquable, et
le second clic renvoie bien la demande. Cassé volontairement (`return` seul, sans
`asked.delete`) pour vérifier que le test rougit — confirmé, puis restauré à l'identique.
Aucune ligne de `follow.js` n'a donc changé.

## Le harnais de test — `extension/tests/stage.mjs`

`answer()` forçait `respond({ ok: true, ...body })` : aucun test ne pouvait simuler un
échec, ce qui explique que 363 tests n'aient rien vu. `fail(type, { port })` complète
`answer` : par défaut il rejoue le port qui se ferme avant la réponse (`lastError` posé,
`respond(undefined)` — le service worker endormi) ; `{ port: false }` simule un refus net
de l'API (`{ ok: false }`, sans `lastError` — 401, 500).

## Les tests

- `tests/market.test.mjs` — trois tests unitaires sur `ADS.market` seul, avec
  `node:test`'s `mock.timers` (`apis: ['setTimeout']`) pour avancer les pauses sans jamais
  attendre un vrai minuteur : port fermé puis reprise réussie ; trois échecs qui arrêtent
  tout, pas de quatrième demande ; 404 (`stats: null`) qui ne déclenche qu'une seule
  demande.
- `tests/panel-sections.test.mjs` — le scénario constaté en vrai, de bout en bout : port
  fermé au premier essai, section absente, la pause passée et la reprise répondue, la
  section « Ce vendeur » apparaît.
- `tests/panel-follow.test.mjs` — le suivi qui échoue puis se reclique.

Chaque test nomme sa ligne de production et a été vérifié rouge en la cassant, puis vert
une fois restaurée — voir le détail des lignes dans les commentaires des tests eux-mêmes.

## Ce qui reste ouvert

1. **Rien n'a été observé dans un vrai navigateur.** Le scénario reproduit est le
   diagnostic préalable (port fermé simulé), pas une vraie extension MV3 endormie face à
   un vrai localhost:8000.
2. **`RETRY_PAUSE_MS` (5 s) est un choix arbitraire**, pas mesuré sur un vrai temps de
   réveil de service worker. S'il s'avère trop court ou trop long en usage réel, seule la
   constante change.
3. **La distinction transitoire/permanent reste grossière** : un `fetch()` qui lève pour
   n'importe quelle raison (réseau coupé, DNS, timeout) est traité comme transitoire et
   retenté trois fois — c'est le comportement voulu ici, mais `sw.js` ne distingue pas
   plus finement une panne réseau d'une erreur serveur 500 franche (les deux lèvent depuis
   `call()`). Non retouché : hors du périmètre du défaut constaté.
