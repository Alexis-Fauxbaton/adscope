# Lot Disparition — côté web, rapport de fin de lot

Périmètre : point 4 de la décision d'Alexis (2026-09-25), partie `web/`
seule — le bouton de suspension sur `/app/ecarts.html`, plus le libellé
français du champ `revived` sur le journal des écarts. Les deux routes HTTP
sont déjà livrées côté API (`.superpowers/disparition-api.md`, vérifiées ici
en lecture seule, non modifiées). Plan : `.superpowers/disparition-plan.md`
§6.3, §7.2, §9.

## Statut

Fait, tests verts. Compteur de départ : `web` **196**. À la livraison : `web`
**203** (+7 : six tests de `suspension.test.mjs`, un test du libellé
`revived` dans `ecarts.test.mjs` — le plan en attendait ~10 pour un fichier
`suspension.test.mjs` séparé ; six couvrent tout le module, un septième
n'aurait rien fait rougir de plus). `api` (1044) et `extension` (438)
inchangés — hors périmètre de cette moitié du lot.

## Le parcours, rejoué en `?demo=1` avant de committer la capture

Alexis ouvre `/app/ecarts.html` (opérateur seulement), lit une carte par
clé comme avant ce lot. Chaque carte porte maintenant un bouton : « Suspendre
cette clé » pour une clé active, « Rétablir cette clé » pour une clé déjà
`clé suspendue` (la pastille existait déjà). Un clic ouvre, dans la carte, une
phrase qui nomme la clé — « Rétablir Occaz Rapide 91 ? » — et deux boutons,
« Oui, rétablir » / « Annuler ». Jamais `window.confirm` : rien du site n'en
ouvre, et une boîte du navigateur ne se capture pas (même règle que
`save-search.js`). Pendant l'appel les deux boutons se désactivent ; au
retour, la carte se repeint depuis la réponse (`active`) sans recharger la
page ; en cas d'échec, un message d'erreur s'ajoute sous la confirmation et
l'état d'avant reste (la clé n'est pas basculée). Une clé sans licence
(`license_key_hash` nul, `label === 'clé supprimée'`) ne porte aucun bouton.

Capture refaite : `docs/site-v0-ecarts.png` (seul fichier de `docs/` touché
par ce lot, servie en local `python3 -m http.server` + Playwright, `?demo=1`),
montrant les trois cartes, les deux libellés de bouton et une confirmation
ouverte sur la clé suspendue.

## Ce qui a été livré

| Fichier | Rôle | Lignes |
|---|---|---|
| `web/js/suspension.js` *(neuf)* | pur + DOM, sans self-exécution à l'import : `actionFor`, `confirmLabel`, `renderSuspendControl` (état `idle`/`confirm`/`pending`, message d'erreur) | 75 |
| `web/js/ecarts-page.js` | ajoute le contrôle à chaque `carteCle`, `lastPayload`/`repeindre` pour repeindre une carte après un changement sans relire l'API | 118 (+11, 107 → 118) |
| `web/js/api-ecarts.js` | `suspend(keyHash)`/`restore(keyHash)` → `POST /v1/licenses/{key_hash}/suspend`\|`restore`, fixtures en `?demo=1` | 23 (+12, 11 → 23) |
| `web/js/fixtures-ecarts.js` | `suspend`/`restore` basculent l'état local des fixtures, sans réseau — permet la capture des deux états | 101 (+17, 84 → 101) |
| `web/js/ecarts.js` | `FIELD_LABELS.revived: 'résurrection'` (le champ que `revival.apply`/`on_absence` peut écrire sur une résurrection contredite) | 95 (+3, 92 → 95) |
| `web/css/views.css` | section « suspend-* », réemploi du gabarit `.save-search-*` (`alerts.css`) | 119 → 129 |
| `web/tests/suspension.test.mjs` *(neuf)* | 6 tests, décor `El` identique à `account-page.test.mjs` | 86 |

Aucun fichier au-delà de 150 lignes. Aucune couleur neuve : les classes
`.suspend-*` reprennent `--accent`/`--faible` et la classe `.erreur` déjà
posés, même gabarit visuel que « Enregistrer cette recherche ».

`renderSuspendControl` n'est pas un composant self-exécutant : comme
`account-page.js`/`save-search.js`, il exporte une fonction que la page
appelle, ce qui le rend testable avec le même décor `El` en faux DOM que
`account-page.test.mjs` — sans lui, `ecarts-page.js` (qui s'exécute à
l'import) n'aurait pas pu être testé directement.

## Chaque test neuf nommé, sa ligne cassée puis restaurée

Prouvé en cassant chaque ligne puis en la restaurant, suite complète relancée
après coup :

- `fieldLabel('revived')` — sans l'entrée `revived: 'résurrection'` de
  `FIELD_LABELS`, le test rougit (repli sur le code brut).
- `actionFor` — la branche `lic.active ? 'suspend' : 'restore'` : forcée à
  toujours rendre `'suspend'`, le test « une clé suspendue propose le
  rétablissement » rougit.
- `confirmLabel` — la phrase « Ses appels seront refusés » retirée de la
  branche `suspend` : le test « la confirmation nomme la clé » rougit.
- L'annulation — la remise à `idle` retirée du gestionnaire « Annuler » : le
  test « annuler referme la confirmation sans appel » rougit (le bouton reste
  sur la confirmation).
- La branche `catch` d'`agir` — `mode` mis à `'idle'` au lieu de `'confirm'`
  après un échec : le test « un échec rend l'état d'avant » rougit (la carte
  retombe sur le bouton comme si de rien n'était, au lieu de garder la
  confirmation avec son message).
- « une clé supprimée ne propose rien » et « une clé active propose la
  suspension » : relus, non cassés séparément — mêmes branches qu'`actionFor`
  ci-dessus, déjà couvertes par la cassure commune.

## Décisions prises

- **Pas de fichier `suspension-page.js` séparé** : `ecarts-page.js` reste sous
  150 lignes avec l'ajout (118), un découpage supplémentaire n'aurait rien
  clarifié.
- **`renderSuspendControl` gère son propre réseau** (import direct
  d'`api-ecarts.js`) plutôt que de remonter un événement à `ecarts-page.js` :
  le seul état que la page doit connaître en retour est « quelque chose a
  changé, repeins » (`onChanged`), passé en argument — même schéma que
  `renderSaveSearch(ui, requireLogin)`.
- **Aucune distinction visuelle entre suspension et rétablissement dans la
  confirmation au-delà du verbe** : la seule mise en garde (« Ses appels
  seront refusés ») ne s'applique qu'à la suspension, un rétablissement n'a
  rien à annoncer.

## Corrections après relecture (2026-09-26)

La relecture a trouvé une omission côté `web/` sur le point 2 de la
décision, qui *était* dans le périmètre du rapport ci-dessus (le rapport ne
signalait, à tort, que le panneau de l'extension comme manquant — voir la
réserve 1 d'origine ci-dessous, corrigée). `flags.probably_gone`, exposé par
l'API depuis `416f7fc`, n'était lu nulle part dans `web/` : `goneFact`
(`web/js/facts.js`), qui écrit la phrase « a disparu » lue par
`web/js/follows.js` (page « Mes suivis »), ne testait que
`flags.disappeared`. Corrigé : `goneFact` porte maintenant une branche
`probably_gone` qui rend « Disparition probable, à confirmer » (kind
`probably_gone`), la ferme restant prioritaire quand les deux sont vrais.
Deux tests neufs dans `web/tests/facts.test.mjs`, cassés puis restaurés.

Mineur corrigé en passant : coquille « imcapturable » → « incapturable »
dans le commentaire d'en-tête de `suspension.js` (aucune ligne de code).

Suite verte après ces corrections : `web` **205** (203 + 2).

## Réserves, hors lot, signalées et non corrigées ici

1. **Le panneau de l'extension** n'affiche toujours pas la disparition
   probable — `extension/` était interdit dans ce lot (même réserve que côté
   API, voir `disparition-api.md`).
2. **`renderSuspendControl` recrée tout le sous-arbre à chaque `repaint()`**
   (comme le reste du site, `carteCle`/`peindre`) plutôt que de ne remplacer
   que ce qui change : cohérent avec le reste de `ecarts-page.js`, jamais
   mesuré comme un problème de performance sur une poignée de cartes.
3. **Aucune mention visuelle distincte** (couleur, icône) pour
   `probably_gone` par rapport à `disappeared` au-delà du texte — même classe
   `fait-${kind}` que le reste, pas de règle CSS neuve posée pour
   `fait-probably_gone` : le texte suffit à la lettre du point 2 de la
   décision, jamais mesuré comme insuffisant.

## Reste à faire

Rien côté `web/` pour les points 2 et 4 de la décision après ces
corrections. Hors périmètre : le panneau de l'extension (lot suivant,
roadmap), la mise à jour de `docs/roadmap.md` (texte déjà donné dans
`disparition-api.md`).
