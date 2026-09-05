# Empreinte véhicule adscope

Calculée à l'identique par l'extension (JS) et par le backend (Python). Une divergence
rend les deux jeux de données impossibles à joindre, et les empreintes du passé ne se
recalculent pas.

## Normalisation d'une chaîne

1. Normalisation Unicode NFD
2. Suppression des caractères de catégorie `Mn` (diacritiques), en JS exactement
   `.replace(/\p{Mn}/gu, '')`
3. Passage en majuscules
4. Remplacement de toute suite hors `[A-Z0-9]` par une espace
5. `trim`

La recette courante `/[\u0300-\u036f]/g` **n'est pas** équivalente : elle ne couvre que
le bloc Combining Diacritical Marks et laisse passer tout `Mn` situé ailleurs. Mesuré sur
« R᷄allye » (U+1DC4, bloc Supplement) : `\p{Mn}` donne `RALLYE` des deux côtés, le bloc
seul donne `R ALLYE` en JS contre `RALLYE` en Python — deux empreintes différentes pour la
même annonce.

## Clé

`[brand, model, version, year, mileage]` jointe par `|`. Les trois premiers sont
normalisés ; `year` et `mileage` sont convertis en chaîne sans arrondi. Un champ absent
(`None` / `null` / `undefined`) devient une chaîne vide ; la position est conservée.

**`year` et `mileage` doivent être des entiers avant la conversion.** `str(2018.0)` vaut
`'2018.0'` en Python là où `String(2018.0)` vaut `'2018'` en JS : un flottant suffit à
casser la jointure. Par la route HTTP le risque est nul, Pydantic coerce `2018.0` en
`2018` et rejette `2018.5` ; mais le crawler écrit directement en base et appelle
`fingerprint()` sans passer par Pydantic. C'est à lui de convertir. Ce cas ne peut pas
être couvert par un vecteur : JSON ne distingue pas `2018` de `2018.0` de la même façon
dans les deux langages, le vecteur mesurerait le parseur et non l'implémentation.

## Empreinte

`sha256(clé, utf-8)`, hexadécimal, 12 premiers caractères.

## L'empreinte suit les valeurs courantes

Elle est recalculée à chaque observation qui apporte un détail véhicule : un kilométrage
qui évolue change l'empreinte. C'est assumé. Le hash est un **index d'égalité exacte sur
les valeurs courantes**, pas une identité stable du véhicule. Ce sont les colonnes
`brand`, `model`, `version`, `year` et `mileage` qui portent la donnée, et c'est sur
elles que se fera le rapprochement par distance (§4 de la spec) — l'empreinte n'en est
que le raccourci pour le cas où tout coïncide.

Tant qu'aucun des cinq champs n'est connu, l'empreinte reste `NULL` plutôt que le hash du
tuple vide : sans quoi toutes les annonces sans détail véhicule se regrouperaient sur la
même clé indexée.

## Le code postal est exclu

La fiche expose un code postal complet (`75015`), les cartes de résultats affichent
tantôt un département (`93`), tantôt un nom de ville (`PARIS`). L'inclure produirait deux
empreintes différentes pour le même véhicule selon la page d'observation.

## Vecteurs

`fingerprint-vectors.json`, asserté par `api/tests/test_fingerprint.py`. Les tests de
l'extension devront s'y brancher de la même façon : c'est le fichier qui fait foi, aucune
valeur ne doit être recopiée dans un test. La parité de la recette ci-dessus a été
vérifiée en Node sur les cinq vecteurs.
