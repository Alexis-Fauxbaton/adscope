# Recherche filtrée, lot 2 — côté `extension/`

Rapport de l'agent extension, en parallèle du lot API (`api/`). Contrat tenu :
voir `docs/roadmap.md` § « Programme recherche filtrée » et le contrat fixé
dans la tâche (`fuel`/`gearbox`/`department`/`postal_code`, vocabulaire fermé,
traduction à un seul endroit, champs jamais dans l'empreinte véhicule). Base
de reconnaissance : rapport de l'agent précédent (fixtures reprises telles
quelles, résumé repris ci-dessous plutôt que reconstitué).

## Fait

1. **Un module partagé, `src/sites/vehicle-fields.js`** (42 lignes, chargé
   dans les deux blocs `content_scripts` du manifeste, entre `sites/read.js`
   et le module de site). Il ne nomme aucun site — la garde
   `tests/sites.test.mjs` (« aucun module partagé ne nomme un site ») l'exige,
   et les deux sites parlent des vocabulaires différents (codes numériques
   d'un côté, mots anglais/français de l'autre). Il porte :
   - `canon(table, raw, fallback = raw)` : traduction générique — une valeur
     absente de la table part telle quelle (ou via `fallback`), jamais
     devinée.
   - `attrOf`/`numeric` : retrouver un attribut `{value, value_label}` par
     clé et le traduire par son code, replié sur son libellé humain si la
     table ne le connaît pas — c'est ainsi que leboncoin lit `fuel`/`gearbox`.
   - `department(zip)` : Corse en 2A/2B selon le seuil 20200, DOM sur 3
     chiffres (971-976), 2 chiffres sinon. Non vérifié sur une annonce corse
     réelle des deux sites — aucune n'a été croisée pendant la
     reconnaissance, à tester avant de s'y fier en production.
   - `withZip(zip, fallback)` : le département dérivé du code postal complet
     quand il y en a un, sinon le repli déjà donné par la page (jamais un
     nom de ville seul).
   Les **tables** de traduction elles-mêmes (le vocabulaire propre à chaque
   site) restent dans `leboncoin.js`/`lacentrale.js` : c'est là que la
   reconnaissance les a relevées, et la garde de séparation site/partagé
   l'impose de toute façon.

2. **`src/sites/leboncoin.js`** (150 lignes pile) : `normalize()` lit
   `attributes[]` (`fuel`/`gearbox`, codes 1-9 pour le premier, 1-2 pour le
   second) et `location` (`zipcode`, `department_id`). `department_id` n'est
   pas fiable en DOM (relevé `"0"` sur une fiche Réunion) : le département se
   dérive systématiquement du code postal complet quand il y en a un, on ne
   se fie à `department_id` que s'il manque. GNV (7) et Hydrogène (9)
   tombent sur `autre`, faute de case dédiée dans le vocabulaire fermé
   suggéré par la tâche — ce sont deux codes réels et distincts, actuellement
   écrasés (même réserve que le rapport de reconnaissance).

3. **`src/sites/lacentrale.js`** (150 lignes pile) : `card()` lit
   `vehicle.energy`/`.gearbox` (anglais abrégé) et `location.visitPlace`
   (département direct, aucun CP sur cette surface). `detail()` lit
   `vehicle.energy`/`.gearbox` (français en toutes lettres — vocabulaire
   différent de la carte, mappé séparément vers le même mot canonique) et
   deux nœuds retrouvés par forme dans les mêmes blobs que `vehicle`/
   `account` : celui qui porte `visitPlace` (département) et celui qui porte
   `zipCode`+`city` (code postal du vendeur professionnel). Seuls
   ESSENCE/DIESEL et les quatre mots de boîte (MANUAL/AUTO/MECANIQUE/
   AUTOMATIQUE) ont été observés — rien d'autre n'est deviné.

4. **`src/sw.js`** (148 lignes) : `toObservation` gagne `fuel`, `gearbox`,
   `department`, `postal_code` (repli `null`, jamais omis — comme les champs
   vendeur existants). Rien d'autre ne change ; `src/cache.js` ne les garde
   pas, il ne les affiche pas.

5. **`manifest.json`** : `src/sites/vehicle-fields.js` ajouté aux deux blocs
   de contenu, juste après `src/sites/read.js`.

6. **Fixtures copiées** dans `tests/fixtures/` depuis le dossier de
   reconnaissance (hors dépôt, rien n'y avait été écrit) :
   `leboncoin-champs-cartes.json`, `leboncoin-champs-fiches.json`,
   `leboncoin-champs-codes.json`, `lacentrale-champs-cartes.json`,
   `lacentrale-champs-fiches.json`. Les fixtures existantes
   (`tests/fixtures/lacentrale-resultats.json`, `lacentrale-fiches.json`) et
   leur harnais (`tests/lc-page.mjs`) sont enrichis d'options
   `energy`/`gearboxType`/`visitPlace`/`sellerZip`/`sellerCity` — absentes
   par défaut (`null`), donc sans effet sur les tests déjà écrits. Les six
   références de `lacentrale-champs-cartes.json` sont exactement celles de
   `lacentrale-resultats.json` (même page sauvegardée) : le nouveau test les
   retrouve par référence plutôt que de dupliquer les données.

7. **Tests** : nouveau `tests/vehicle-fields.test.mjs` (14 tests) — chaque
   surface de chaque site, chaque code/mot connu (les neuf fuel et les deux
   gearbox de leboncoin, un par un depuis la fixture des codes ; ESSENCE/
   DIESEL et les quatre mots de boîte de La Centrale), un code et un mot
   inconnus (partent tels qu'observés, jamais devinés en `autre` — c'est le
   rôle de l'API), la dérivation département (`75015→75`, `20000→2A`,
   `20200→2B`, `97400→974`), le repli sur `department_id`/`visitPlace` sans
   code postal, une annonce/carte sans ces champs (part comme avant, les
   quatre valent `null`), et une vérification que `brand`/`model`/`version`/
   `year`/`mileage` (l'empreinte véhicule) ne bougent pas. Un test ajouté à
   `tests/sw.test.mjs` pour `toObservation`. Chaque test a été vérifié en le
   faisant rougir (cassé un mapping, une plage DOM, un mot de boîte — voir
   preuve ci-dessous), aucun ne lit l'horloge (aucun des deux modules
   touchés n'appelle `Date`).

   Suite complète : **384** tests côté `extension/` (369 + 15), tous verts.
   `api/` (513, hors périmètre de cet agent — modifié par ailleurs en
   parallèle, non touché ici) et `web/` (61) revérifiés verts aussi, sans
   modification.

## Le budget de 150 lignes, tenu en déplaçant la mécanique, pas les tables

Les deux fichiers de site étaient déjà à 150 lignes pile avant ce lot. La
tentation initiale — mettre les tables `fuel`/`gearbox` des deux sites dans
le module partagé — casse la garde « aucun module partagé ne nomme un site »
(elle a rougi une fois, en vrai, pas en théorie). Le module partagé porte
donc seulement la mécanique générique (`canon`, `attrOf`/`numeric`,
`department`, `withZip`) ; les tables et leur lecture (`attributes[]` d'un
côté, `vehicle.energy`/`.gearbox` de l'autre) restent dans chaque site.
Chaque fichier de site est resté à 150 lignes pile en fusionnant des lignes
voisines déjà de même nature (un objet-litéral de deux clés qui tenait sur
quatre lignes, un objet retourné par une fonction d'une ligne qui tenait sur
six) — aucune logique existante n'a été retirée, seule sa mise en forme a
changé.

## Preuve par la casse (extrait)

- Neutralisé la plage DOM (`971..976`) dans `department()` → 3 tests
  rougissent (`department`, les cartes leboncoin, les fiches leboncoin).
- Changé le code 8 leboncoin de `hybride_rechargeable` en `hybride` → 2 tests
  rougissent (fiche Niro, boucle sur les 9 codes).
- Changé `MECANIQUE` de `manuelle` en `automatique` côté La Centrale → la
  fiche non plafonnée (boîte manuelle réelle) rougit.

## Réserves (héritées de la reconnaissance, non levées ici — hors périmètre extension)

- Règle Corse (2A/2B) non vérifiée sur une annonce corse réelle des deux
  sites : codée d'après la règle standard française, à tester avant d'en
  dépendre en production.
- GNV et Hydrogène (leboncoin, codes 7 et 9) tombent sur `autre` faute de
  case dédiée dans le vocabulaire suggéré par la tâche — décision à prendre
  par Alexis (les distinguer coûterait deux valeurs de vocabulaire de plus).
- La Centrale : vocabulaire `energy`/`gearbox` observé seulement sur des
  Peugeot 208 essence/diesel — toute autre valeur reste non observée, non
  codée en dur, part telle quelle si elle apparaît.
- Le contrat API (`GET /v1/market` filtrable par `fuel`/`gearbox`/
  `department`, stockage des quatre champs) est un autre lot — non vérifié
  ici, l'extension envoie déjà les champs (l'API actuelle les ignore
  silencieusement, Pydantic sans `extra=forbid`, testé en lisant
  `api/adscope_api/intake.py`).

## Revue fermée, 2026-09-19 — GNV et Hydrogène rejoignent le vocabulaire

Base 07dc761. Fichiers touchés : `src/sites/leboncoin.js`,
`tests/vehicle-fields.test.mjs`. Aucun sous-agent dispatché.

Réserve levée : la table `FUEL` (ligne 36) portait `7: 'autre'` (GNV) et
`9: 'autre'` (Hydrogène), faute de case dédiée — décision reportée à Alexis au
lot précédent. Prise ici, côté API en parallèle
(`.superpowers/recherche-lot2-api.md`) : `7: 'gnv'`, `9: 'hydrogene'`, `autre`
ne gardant plus que le code 5. Une ligne changée, le fichier reste à 150
lignes pile.

`tests/vehicle-fields.test.mjs` : le test qui boucle sur les neuf codes de la
fixture (`leboncoin-champs-codes.json`) mis à jour vers les nouvelles valeurs
attendues. Un test ajouté, miroir de celui posé côté API
(`test_the_fuel_vocabulary_matches_what_the_extension_sends`) : fige
l'ensemble des neuf valeurs traduites (`essence`, `diesel`, `gpl`,
`electrique`, `autre`, `hybride`, `gnv`, `hybride_rechargeable`,
`hydrogene`) — un écart avec l'API se voit au diff des deux tests. Aucun
fichier `shared/` commun pour ce vocabulaire aujourd'hui (contrairement à
l'empreinte véhicule, `shared/fingerprint-vectors.json`) — ce lot n'en a pas
créé un, voir la réserve équivalente côté rapport API.

Les deux tests vérifiés en les faisant rougir : `FUEL` remis à `7: 'autre'`,
`9: 'autre'` → les deux tests rougissent (le code fuel connu se traduit mal,
le miroir API ne retrouve plus `gnv`/`hydrogene` dans l'ensemble traduit).

### Vérifié

`cd extension && node --test tests/*.test.mjs` → **385** pass, 0 fail (384
avant, 1 ajouté), y compris avec `Date` décalée d'un an (`--import` sur un
module jetable, non commité, qui remplace `globalThis.Date`). `api/` (524,
modifié en parallèle par le même lot côté `api/`, hors périmètre extension)
revérifié vert aussi.

### Réserve toujours ouverte

- La Centrale : aucune valeur GNV ni Hydrogène n'a été observée sur ce site
  pendant la reconnaissance — aucune correspondance n'y a été ajoutée, rien à
  inventer.
