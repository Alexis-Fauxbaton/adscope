# La Centrale : le vocabulaire carburant complété

Constat : au 2026-09-19, 8,3 % des annonces La Centrale tombaient en `autre`
(contre 0,1 % chez leboncoin) faute de traduction pour les codes composés
hybride/électrique/GPL — seuls `ESSENCE`/`DIESEL` avaient été observés au lot 2.

## Fait

La table `FUEL` de `extension/src/sites/lacentrale.js` (partagée par `card()`
et `detail()` — vérifié, une seule table traduit les deux surfaces) gagne les
cinq codes relevés dans le journal de l'API sur 563 annonces réelles :

| valeur brute | canon |
|---|---|
| `PLUGIN_HYBRID_ESSENCE_ELECTRIC` | `hybride_rechargeable` |
| `HYBRID_ESSENCE_ELECTRIC` | `hybride` |
| `ELECTRIC` | `electrique` |
| `BIO_ESSENCE_GPL` | `gpl` |
| `PLUGIN_HYBRID_DIESEL_ELECTRIC` | `hybride_rechargeable` |

Plus `HYBRID_DIESEL_ELECTRIC` → `hybride`, ajouté par symétrie évidente avec
`HYBRID_ESSENCE_ELECTRIC` bien que jamais vu — marqué en commentaire dans la
table. Rien d'autre deviné : GNV, hydrogène non vus côté La Centrale.

**Non ajouté, à signaler à Alexis** : `BICARBURATION_ESSENCE_BIOETHANOL` (vu
une fois) n'a pas de case éthanol dans le vocabulaire fermé. Il part en
`autre` comme avant, et le mécanisme de journalisation de l'API — celui qui
a produit ce tableau — n'a pas été touché : une valeur hors table part
toujours brute (`canon`, `src/sites/vehicle-fields.js`, inchangé).

## Tests

`extension/tests/lacentrale-fuel.test.mjs` (13 tests, nouveau fichier) : les
cinq couples relevés, sur la carte et sur la fiche (13 = 5×2 + le cas
symétrie + le cas brut + le cas ESSENCE/DIESEL non régressé). Chaque
assertion a été prouvée en cassant sa ligne de production (la clé retirée de
`FUEL`, ou le repli de `canon`) — voir le commentaire en tête du fichier de
test. Suite complète : 398/398 verts, y compris avec `Date` décalée d'un an
(préchargement qui remplace `new Date()` sans argument — aucun test ne lit
l'horloge réelle).

## Fichiers touchés

- `extension/src/sites/lacentrale.js` (table `FUEL`, 150 lignes pile)
- `extension/tests/lacentrale-fuel.test.mjs` (nouveau, 63 lignes)
