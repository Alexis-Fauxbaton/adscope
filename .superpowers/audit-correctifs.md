# Correctifs de l'audit offensif

Journal des correctifs appliqués aux trouvailles confirmées de l'audit offensif
(`audit-auth.md`, `audit-config.md`, `audit-injection.md`, `audit-extension.md`,
`audit-abus.md`, `audit-acces.md`). Une section par lot, datée, par angle.

---

## 2026-09-24 — angle extension : T1, T2, T4

Lot fermé côté `extension/` seul, sur les trois trouvailles critiques/hautes
confirmées de cet angle : T1 (haute), T2 (haute), T4 (haute). Les autres
angles (`api/`, `web/`) sont corrigés en parallèle par d'autres agents — non
touchés ici.

Commit : `5b3f378`. Suite `cd extension && node --test tests/*.test.mjs` :
**434 verts** (430 + 4 tests neufs), aucun rouge. Chacun des cinq points
touchés a été vérifié rouge en défaisant la ligne du correctif, puis
restauré (voir détail par trouvaille).

### T1 — pont monde MAIN forgeable

Le pont `window.dispatchEvent(adscope:detail/payload)` que `leboncoin-tap.js`
(monde MAIN) utilise pour parler à `feed.js` (monde isolé) n'authentifie
personne : tout script exécuté sur la page — régie, tag tiers compromis, XSS —
peut l'émettre. Correctifs interimaires (le canal lui-même resterait ouvert à
qui a déjà ce niveau d'accès à la page ; le fermer vraiment demande un
MessageChannel privé posé à `document_start`, ou l'abandon du tap au profit
d'une relecture de `__NEXT_DATA__` à chaque navigation — architecture hors
lot, notée en ouvert ci-dessous) :

- **`extension/src/detail.js`** (`pick`, ligne ~61) — hors fiche (pas
  d'identifiant dans l'URL : accueil, compte, résultats), le repli sur
  `listings[0]` donnait audience à toute charge forgée. Il ne s'applique plus
  que sur une fiche réelle, où il reste utile (navigation monopage prise entre
  deux états). Testé rouge/restauré : `tests/detail.test.mjs`
  (« sans identifiant dans l'URL, aucune annonce n'est décrite ») et
  `tests/lacentrale-dom.test.mjs` (« sur une page de résultats, aucun panneau
  n'est posé »).
- **`extension/src/feed.js`** (`MAX_LEN`, ligne ~24) — une chaîne reçue de
  plus de 4 000 000 caractères est écartée avant `JSON.parse`. N'arrête que
  l'abus grossier (une chaîne démesurée), pas la fabrication elle-même — c'est
  la garde de `detail.js` ci-dessus, et celle déjà en place dans
  `listing.js` (une annonce n'entre au suivi que si une carte réelle de la
  page porte son adresse), qui la limite. Testé rouge/restauré :
  `tests/feed.test.mjs` (« une charge démesurée est ignorée plutôt que
  parsée »).
- **`extension/src/panel-cards.js`** (`follow`, ligne ~56) — le bouton
  « Suivre » n'agit plus que sur un clic dont `isTrusted` est vrai : la page
  pouvait sinon le déclencher elle-même (`el.dispatchEvent(new
  MouseEvent('click'))`), sans geste du lecteur. `extension/tests/stage.mjs`
  simule un clic réel (`isTrusted: true`) et un clic forgé (`click(false)`).
  Testé rouge/restauré : `tests/panel-follow.test.mjs` (« un clic forgé par la
  page ne demande pas le suivi »).

**Ouvert, hors lot** : `src/absence.js` (verdict d'absence) lit
`__NEXT_DATA__` directement, pas le pont événementiel — pas concerné par ce
correctif, et déjà défendu par deux témoins indépendants (`ad === null` +
libellé visible de la page). Le canal lui-même (MessageChannel privé ou
abandon du tap) est une décision d'architecture, pas un correctif mécanique :
non fait. Le plafond d'observations par licence et la journalisation des
émetteurs sont côté API, hors `extension/`.

### T2 — adresse d'API libre : masquerade d'origine

**`extension/popup/config.js`** (`isBase`, ligne ~11) — l'ancienne regex
acceptait `https://api.adscope.fr@evil.example` : une adresse qui se lit comme
la bonne (préfixe de confiance avant `@`) et dont l'origine réelle, celle qui
reçoit la clé de licence via `chrome.permissions.request` et `Authorization:
Bearer`, est `evil.example`. `isBase` compare maintenant `new URL(v).origin`
à `v` lui-même : tout composant qu'une origine ne porte pas (identifiants,
chemin, requête, fragment) fait échouer la comparaison. Testé rouge/restauré :
`tests/config.test.mjs` (« une adresse qui porte des identifiants avant
l'hôte est refusée »).

**Non fait, décision produit** : épingler l'adresse de production comme
constante de build et retirer le champ libre de la version distribuée (le
correctif proposé par l'audit). Pas d'adresse de production connue à ce
jour — la mise en ligne Render n'a pas encore de domaine fixé — et retirer le
champ changerait un comportement visible (plus moyen de pointer vers un poste
de dev). À trancher une fois le domaine de production choisi.

### T4 — code postal complet d'un particulier conservé

**`extension/src/sites/vehicle-fields.js`** (`withZip`, ligne ~34) — prend
désormais un troisième paramètre `pro` : le code postal complet ne sort que
si l'appelant dit un vendeur professionnel, le département reste dérivé dans
tous les cas (aggrégat moins identifiant, feature produit à part).
**`extension/src/sites/leboncoin.js`** (`normalize`, ligne ~59) et
**`extension/src/sites/lacentrale.js`** (`card` et `detail`, lignes ~44/64) —
passent ce type de vendeur à `withZip`, sur les deux sites (le défaut touchait
`leboncoin.js` et `lacentrale.js` à la fois, pas un seul). Testé
rouge/restauré : `tests/vehicle-fields.test.mjs` (« leboncoin — le code postal
complet ne voyage que pour un vendeur pro » et la fiche La Centrale
`FICHES.capped`, un vendeur PART réel de la fixture, qui documentait la fuite
avant correctif).

**Hors `extension/`, corrigé en parallèle** : côté API,
`api/adscope_api/observations.py` doit refuser d'écrire `postal_code` si
`seller_type != "pro"` (aujourd'hui `VEHICLE_FIELDS` l'écrit sans ce tri), et
une migration doit effacer le code postal des annonces de particuliers déjà
en base. Pas touché ici — angle `api/` traité par un autre agent.

### Suites

- `cd extension && node --test tests/*.test.mjs` → **434 / 434** verts.
- `api/` et `web/` non touchés par ce lot (hors périmètre de la tâche).
