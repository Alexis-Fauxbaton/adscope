# Empreinte véhicule adscope

Calculée à l'identique par l'extension (JS) et par le backend (Python). Une divergence
rend les deux jeux de données impossibles à joindre, et les empreintes du passé ne se
recalculent pas.

## Normalisation d'une chaîne

1. Normalisation Unicode NFD
2. Suppression des caractères de catégorie `Mn` (diacritiques)
3. Passage en majuscules
4. Remplacement de toute suite hors `[A-Z0-9]` par une espace
5. `trim`

## Clé

`[brand, model, version, year, mileage]` jointe par `|`. Les trois premiers sont
normalisés ; `year` et `mileage` sont convertis en chaîne sans arrondi. Un champ absent
(`None` / `null` / `undefined`) devient une chaîne vide ; la position est conservée.

## Empreinte

`sha256(clé, utf-8)`, hexadécimal, 12 premiers caractères.

## Le code postal est exclu

La fiche expose un code postal complet (`75015`), les cartes de résultats affichent
tantôt un département (`93`), tantôt un nom de ville (`PARIS`). L'inclure produirait deux
empreintes différentes pour le même véhicule selon la page d'observation.

## Vecteurs

`fingerprint-vectors.json`, asserté par `api/tests/test_fingerprint.py` et par les tests
de l'extension.
