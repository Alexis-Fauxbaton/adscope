# Le picto de marque sur les pastilles, le panneau et la popup

Lot du 2026-09-21, dossier `extension/` seulement. 427 tests verts (417 + 10 neufs),
tous les fichiers source à 150 lignes ou moins.

## 1. Un seul endroit fabrique le picto

`ADS.icons.mark(size = 12)` dans `src/panel-icons.js`, construit avec l'aide `svg()` déjà
présente dans `src/panel-node.js` : le carré indigo arrondi (`rx="9"`, `#4F46E5`) et
l'anneau blanc, repris tels quels du favicon (`web/index.html`), sans les redessiner.
`aria-hidden="true"` — c'est muet pour un lecteur d'écran.

Posé en tête :
- de la pastille normale des pages de résultats et des annonces similaires sur une
  fiche (`src/listing.js`, une seule fonction pour les deux sites) ;
- de la mention de reconnexion (`src/auth-notice.js`, classe `ads-auth-msg`) ;
- de la mention d'onglet périmé (`src/stale-notice.js`, classe `ads-stale-msg`) — c'est
  bien une pastille : elle remplace le même nœud `[data-adscope]` / `[data-adscope-detail]` ;
- de l'en-tête du panneau (`src/panel.js`, « adscope · leboncoin · 21 sept. 2026 ») ;
- de l'en-tête de la popup (`popup/popup.js`, dans `#brand-mark`).

Chacune des trois pastilles du premier groupe garde un `title` qui commence par
« adscope — » (le picto étant aria-hidden, c'est lui qui porte la marque pour
l'accessibilité). Pour la pastille normale : « adscope — suivi de cette annonce ». Les
deux mentions portent déjà ce préfixe dans leur texte visible ; leur `title` reprend le
même.

## 2. Le contrôle de santé du crawl : conclusion

Lu dans `crawler/RUNBOOK.md` (lecture seule) : le sélecteur exact est
`[class*="adscope-"]`, compté sur la page — « Un compte normal (~85 par page) », et
« 0 = extension pas chargée ». Le picto se pose sur *chaque* pastille déjà comptée par
ce sélecteur (les badges `adscope-badge*`, les cartes du panneau). Lui donner une classe
contenant `adscope-` aurait donc **doublé le compte** sans qu'une seule annonce de plus
ne soit suivie — un faux signal de bonne santé, dans un sens comme dans l'autre.

D'où la classe choisie : **`ads-picto`**, hors du préfixe `adscope-`, sur le modèle déjà
posé par `ads-auth-msg` et `ads-stale-msg`. Un test (`picto.test.mjs`) fixe l'invariant
et deux autres (`auth-notice.test.mjs`, `stale-notice.test.mjs`) le vérifient en situation
réelle, sur les deux sites.

## 3. L'isolation du panneau n'est pas touchée

`src/panel.css` réinitialise `:where(div, p, span, button, a, b)` à l'intérieur de
`.adscope-panel`, et laisse expressément les nœuds de dessin de côté — c'est écrit en
tête du fichier. Le picto est un `<svg>` : il n'entre pas dans cette liste, ses attributs
de présentation (`fill`, `stroke`) restent donc effectifs sans qu'aucune règle n'ait à
les épargner. Une seule règle ajoutée, `.ads-picto { vertical-align: -2px; margin-right: 4px; flex: none; }`,
répétée à l'identique dans `src/ui.css` (pastilles posées dans la page hôte) et
`popup/popup.css` (en-tête de la fenêtre) — chacune est déjà un registre à part, comme
le reste de ces trois fichiers.

## 4. Un vrai bug trouvé en capturant l'écran, pas en lisant le code

`src/listing.js` et `src/stale-notice.js` appellent `ADS.icons.mark()` dès leur premier
rendu, **synchrone**, au chargement du script. Le manifeste chargeait pourtant
`panel-icons.js` **après** `listing.js` — hérité de l'ordre déjà en place, jamais
remarqué parce que rien n'y avait jamais rien demandé avant ce lot. Dans un vrai
Chromium (`docs/picto-pastilles.png`, premier essai) : « Cannot read properties of
undefined (reading 'mark') », badges non posés.

Le banc de tests (`tests/stage.mjs`) ne pouvait pas le voir : il charge tout le décor
— `panel-node.js`, `panel-icons.js` compris — avant que `listing.js` ne soit chargé à
part par chaque test, quel que soit l'ordre écrit au manifeste. Corrigé aux deux
endroits :
- `extension/manifest.json` : `panel-node.js` et `panel-icons.js` remontent juste après
  `context.js`, avant `stale-notice.js`, sur les deux sites ;
- `tests/stage.mjs` : la liste de chargement recomposée en une seule séquence (plus de
  découpage fragile par `slice`), dans le même ordre que le manifeste ;
- `tests/manifest-order.test.mjs` (neuf) : lit `manifest.json` et vérifie que
  `panel-node.js`/`panel-icons.js` précèdent tout ce qui peut les appeler dès son
  premier rendu — cassé puis restauré à la main pour le prouver.

## 5. Les icônes de l'extension

`extension/icons/icon.svg` — le SVG source, gardé à côté, identique au favicon. Rendues
en PNG (16/32/48/128) avec un Chromium sans tête lancé à la main (Playwright déjà
installé sur la machine ; ni ImageMagick, ni rsvg-convert, ni `sips` ne lisent du SVG
ici). Déclarées dans `manifest.json` (`icons` et `action.default_icon`).

## 6. Captures

Faites comme le lot précédent (`.superpowers/popup-et-placement.md`) : un Chromium réel
piloté par Playwright, aucune requête vers un vrai site. Pour la popup, `chrome.*` est
posé avant ses scripts et la page est ouverte directement (`file://`). Pour les
pastilles et le panneau, la page est **entièrement fabriquée par ce lot** (titres,
prix, dates inventés) et servie par interception réseau à une fausse adresse
`https://www.leboncoin.fr/...` — jamais une vraie requête : tout ce qui n'est ni ce
document ni un fichier de `extension/` est bloqué (`route.abort()`), le reste est lu sur
disque (`route.fulfill({path})`). Les scripts de l'extension tournent tels quels, sans
modification, sur cette page.

- `docs/picto-pastilles.png` — quatre pastilles (notable, deux calmes, une privée), le
  picto net et aligné sur les quatre, aucune ne prend un caractère de plus qu'avant :
  vérifié en comparant la même capture avec et sans le picto — le retour à la ligne de
  la pastille orange existait déjà, texte long dans une colonne de 190 px.
- `docs/picto-panneau.png` — le panneau entier d'une fiche, en-tête compris.
- `docs/picto-popup.png` — la popup au repos, picto en tête de « adscope ».

## Réserves

1. **Wording du `title`.** « adscope — suivi de cette annonce » est une phrase choisie
   par moi, jamais validée par toi : à ajuster si tu en préfères une autre.
2. **Taille unique, 12 px partout** (pastilles, panneau, popup) — la demande le
   suggérait (« le même picto »), mais je n'ai pas cherché une taille différente pour le
   panneau/la popup où la place ne manque pas autant.
3. **Le bug d'ordre de chargement** touchait aussi bien `listing.js` que
   `stale-notice.js`, avant ce lot — c'est-à-dire dès l'introduction de `panel-icons.js`
   dans leur chemin de rendu, par ce lot lui-même. Il n'existait pas avant que j'ajoute
   le picto ; il n'a donc jamais atteint personne, mais la faille de méthode (le banc de
   tests aveugle à l'ordre réel du manifeste) demeure pour tout futur ajout du même
   genre — `tests/manifest-order.test.mjs` couvre seulement `panel-icons.js`, pas une
   règle générale d'ordre.
4. **Icônes rendues sans anti-aliasing vérifié à l'œil au-delà de 128 px** — pas de
   taille au-delà dans le Web Store, non demandée ici.
