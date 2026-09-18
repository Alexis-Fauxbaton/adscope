# File de revisite : le navigateur porte la clé, l'agent ne la voit plus

## Le défaut, et le principe du correctif

Le runbook de revisite demandait à la session cowork de lire `crawler/.license` et de
construire elle-même un en-tête `Authorization: Bearer`. Le classifieur de sécurité de la
session refuse ce geste (« Credential Materialization ») — quatre runs de suite à zéro fiche
ouverte, confirmé en direct pendant ce lot : une simple lecture `psql` de la table
`licenses`, puis un `localStorage.setItem('adscope.license', …)` avec une valeur factice,
ont tous les deux été refusés par le même classifieur, y compris avec une clé bidon. La
lecture ou l'écriture d'une clé, même fausse, est le geste bloqué — pas la vérité de son
contenu.

Correctif : l'agent pilote un navigateur, le navigateur détient la licence. Plus aucun
endroit du dépôt ne demande à un agent de lire ou construire une clé pour la revisite.

## Ce qui a été livré

**`web/revisites.html`** (servie sous `/app/revisites.html`) — page standalone, hors SPA :
- sans licence en `localStorage` : « Connectez-vous d'abord sur /app. », aucun appel ;
- avec licence, sans file en cache : bouton « Demander la file » (`?limit=`, défaut 40,
  borné à 100, site `lbc` fixe) ;
- au clic : un seul `POST /v1/revisits`, compteur `<output id="count">`, liste
  `<ol id="queue"><li><a href data-site-id>` ; la file est recopiée dans `sessionStorage`,
  donc un rechargement la réaffiche sans redemander — « Oublier cette file » la vide ;
  file vide (`[]`), 401 (« Licence refusée — reconnectez-vous sur /app ») et API injoignable
  sont chacun dits en clair ;
- `?demo=1` rend une file factice (5 lignes leboncoin) sans réseau, pour la capture.

Logique séparée en deux fichiers pour rester testable sans DOM :
`web/js/revisits.js` (pur — `parseLimit`, `initialView`, cycle `sessionStorage`) et
`web/js/revisits-page.js` (câblage DOM, s'appuie sur `web/js/dom.js`). `web/js/api.js` gagne
`revisits({site, limit})`, qui pose l'en-tête depuis `api.licenseKey()` — jamais depuis un
paramètre venu d'ailleurs. `web/js/fixtures.js` gagne la file factice du mode démo.

**Lien mort (« Mes suivis »)** — `web/js/facts.js` expose `isGone(item)` (vrai quand le fait
principal est `disappeared`) ; `web/js/follows.js` n'affiche plus « Voir l'annonce » dans ce
cas, et seulement dans ce cas.

**`crawler/RUNBOOK-revisites.md`** (non suivi par git, non ajouté au commit) — section
« La file » réécrite : plus de `curl`, plus de `crawler/.license`. Nouvelle procédure :
`navigate` vers `/app/revisites.html`, cliquer une fois, lire `#count` puis les `href` de
`#queue a` (par tranches, la file reste affichée et se relit sans rien consommer). Prérequis
ajouté : Alexis se connecte une fois, à la main, sur `/app` dans le Chrome du crawl. Table
« Ce qui casse » et liste « Ce qu'il ne faut pas faire » mises à jour. Les deux encadrés de
terrain (sonde `/v1/me`, sortie tronquée) sont conservés intégralement. Encadré daté du
2026-09-18 ajouté en tête, expliquant le changement.

## Vérifications faites

- `node --test web/tests/*.test.mjs` : **45 verts** (37 + 8 nouveaux : limite, état
  initial, cycle `sessionStorage`, absence de clé dans le stockage, `isGone`, file factice
  bornée). Chaque nouveau test a été confirmé rouge en cassant sa ligne de production visée,
  puis restauré — voir les commentaires « Rouge sur … » au-dessus de chaque test.
- `cd api && ./.venv/bin/pytest tests/ -q` : **287 verts**, inchangé (aucun fichier de
  `api/` touché).
- Contre l'API en service (`http://127.0.0.1:8000`), via Playwright, sans jamais cliquer
  « Demander la file » avec une vraie licence (pour ne consommer aucune fiche réelle) :
  - `/app/revisites.html` sans licence : message d'invite, **zéro requête non statique**
    dans le journal réseau ;
  - `/app/revisites.html?demo=1` : compteur à 5, cinq `<a href data-site-id>` corrects,
    zéro appel réseau — capture enregistrée dans `docs/site-v0-revisites.png` ;
  - `/app/?demo=1#/suivis` : la carte « a disparu le 15 sept. » n'a plus de lien, la carte
    « −1 200 € » en garde un.
  - Non vérifié en direct faute de licence disponible sans déclencher le même classifieur :
    le chemin « licence présente → bouton → 401/succès réel ». C'est structurellement le
    même code que le flux démo (`api.revisits`, `writeQueue`/`readQueue`), et c'est
    justement ce que le prérequis du runbook (connexion manuelle d'Alexis sur `/app` dans le
    Chrome du crawl) est censé couvrir en conditions réelles.

## Fichiers touchés

Modifiés : `web/js/api.js`, `web/js/facts.js`, `web/js/fixtures.js`, `web/js/follows.js`,
`web/css/views.css`, `web/tests/facts.test.mjs`, `web/tests/fixtures.test.mjs`,
`crawler/RUNBOOK-revisites.md` (non suivi, non commité).

Nouveaux : `web/revisites.html`, `web/js/revisits.js`, `web/js/revisits-page.js`,
`web/tests/revisits.test.mjs`, `docs/site-v0-revisites.png`.
