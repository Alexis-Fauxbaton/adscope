# La popup dit quelle annonce a été retenue

SHA de départ : `f37d20e02dde3146be7b4c9345dfb0910e26d534` (branche `feat/api`).

## Le besoin

Le correctif `f37d20e` fait choisir à `detail.js` l'annonce que l'URL désigne
plutôt que la première du bloc `__NEXT_DATA__`. Rien ne permettait de le
vérifier depuis l'interface : `src/listing.js` écrivait bien un diagnostic dans
`chrome.storage.local`, mais il ne parlait que de la page de résultats, et
`src/detail.js` n'écrivait rien. Un marchand devant un panneau qui annonce
« Vendeur : professionnel » sur une annonce de particulier n'avait que la console
pour trancher.

## Ce qui a été fait

### `extension/src/diag.js` (nouveau, 49 lignes)

Le compte rendu que la popup lit. Deux règles y tiennent :

- **Un seul auteur par page.** Les deux content scripts tournent sur toutes les
  pages du site ; sans règle, le dernier rendu écraserait le diagnostic de
  l'autre — et une fiche porte des cartes d'annonces similaires, donc
  `listing.js` y pose des pastilles et réécrivait indéfiniment. Le type de page
  désigne l'auteur : l'identifiant que porte l'URL fait la fiche (`diag.detail`),
  son absence les résultats (`diag.listing`). C'est la règle que suit déjà
  `detail.js` pour choisir l'annonce.
- **Un tronc commun** (`url`, `nextData`, `at`, `listings`) puis les champs
  propres au type de page.

Sur une fiche : `kind: 'detail'`, `listings` (annonces du bloc), `pickedId`,
`urlId`, `matchesUrl`, `sellerType`. Sur des résultats : `kind: 'listing'`,
`listings`, `pro`, `badges` — la popup en déduit les particuliers.

### Les deux content scripts

`listing.js` délègue son écriture (`ADS.diag.listing(listings, badges)`, à la
place de l'objet littéral). `detail.js` gagne une ligne, `ADS.diag.detail(listings,
listing)`, posée à la fin du rendu — le choix de l'annonce n'est pas touché.
`src/diag.js` est déclaré dans le manifeste avant `listing.js`.

### `extension/popup/popup.js` (136 lignes)

`diagnose` se sépare en `detailRows` / `listingRows` / `trouble`. Les libellés
suivent le type de page : « Annonces dans le bloc », « Annonce retenue »,
« Vendeur » sur une fiche ; « Annonces lues », « Pro / particuliers »,
« Pastilles posées » sur des résultats. La première ligne se nomme elle-même
« Fiche » ou « Résultats », ce qui dit le type de page sans y consacrer de ligne.

L'accord entre l'annonce retenue et l'URL ne vaut qu'une coche grise en fin de
valeur. Le désaccord passe la valeur en rouge, ajoute `≠ URL`, et fait suivre une
note rouge qui nomme les deux identifiants : « L'URL désigne l'annonce X, le
panneau décrit Y ». Les indicateurs et messages d'aide existants sont conservés,
y compris pour un diagnostic ancien sans `kind`, lu comme une page de résultats.

### `extension/popup/popup.css` (145 lignes)

Deux règles ajoutées (`.mark`, `.bad .mark`) ; `.dot` et `.hint` compactés pour
rester sous la limite. `.row span:first-child` devient `.row > span:first-child`
(idem `last-child`) : sans cela la coche, premier enfant de la valeur, héritait
de la couleur des libellés — vérifié dans un navigateur, la marque de désaccord
s'affichait grise au lieu de rouge.

## Tests

`extension/tests/diag.test.mjs`, écrit avant le code et vu échouer sur l'absence
de diagnostic :

1. fiche où l'URL et l'annonce retenue concordent — tous les champs ;
2. fiche dont l'URL désigne une annonce absente du bloc — `matchesUrl: false` ;
3. page de résultats — `listings`, `pro`, `badges` ;
4. un seul des deux scripts écrit, quel que soit l'ordre de chargement.

`tests/world.mjs` retient désormais ce qui est écrit dans `chrome.storage.local`
(`w.status()`) et filtre `querySelectorAll` sur les sélecteurs d'attribut, sans
quoi le comptage des pastilles renvoyait tous les nœuds du corps.

**52 tests verts** (48 d'origine + 4).

## Vérification visuelle

Les trois états de la section ont été rendus dans un navigateur (page
d'aperçu temporaire, supprimée depuis) : accord, désaccord, résultats. Couleurs
calculées confirmées — coche `#71717a`, marque de désaccord `#b91c1c`.

## Limites

- Le diagnostic n'est écrit que lorsque le rendu a lieu ; sur une fiche dont le
  panneau est déjà à jour, `detail.js` sort avant, ce qui est sans effet puisque
  le premier rendu a déjà écrit.
- La règle « quel type de page » vit deux fois : la regexp `\d{6,}` de `diag.js`
  double celle de `detail.js`, laissée intacte à dessein. Si elles divergeaient,
  la popup signalerait un faux désaccord — visible, pas silencieux.
