# Fichier éditorial adscope — notes véhicules

## Fichiers

- `shared/vehicle-notes.json` — lignes de risque par modèle (rappels, pannes documentées).
- `shared/vehicle-questions.json` — questions génériques à poser au vendeur, par tranche
  d'âge et de kilométrage, plus HistoVec et PV du CT.

## Schéma de `vehicle-notes.json`

Tableau d'entrées :

```json
{
  "brand": "Peugeot",
  "model": "307",
  "years": [2006, 2009],
  "engine": "2.0 HDI",
  "fact": "Description factuelle du défaut documenté, sans jugement.",
  "check": "Ce qu'il faut vérifier ou demander pendant l'essai/la visite.",
  "source": {
    "url": "https://...",
    "title": "Titre de la page source",
    "kind": "rappelconso | presse | constructeur"
  }
}
```

- `brand` / `model` : normalisés comme dans la table `listings` (voir
  `psql -d adscope -c "select distinct brand, model from listings"` pour la casse exacte —
  ex. "Citroen" sans accent, "Megane" sans accent, modèles non versionnés : "308" et non
  "308 III", "Fiesta" et non "Fiesta VI"). La génération éventuelle (II, III, VI...) reste
  mentionnée dans `fact`/`engine` quand elle aide à situer le défaut, mais ne doit jamais
  apparaître dans `model`.
- `years` : `[from, to]`, années de production concernées par le fait décrit (pas forcément
  toute la carrière du modèle).
- `engine` : motorisation concernée, ou chaîne vide si le fait touche toute la gamme.
- Le tri du fichier est : marque, puis modèle, puis année de début.

## Règle de sourcing — non négociable

Une ligne de risque n'existe que si elle porte une **source fetchable** qui l'atteste :

1. RappelConso (rappel.conso.gouv.fr) ou une campagne/bulletin constructeur (ex. Transports
   Canada) — sources fortes, `kind: "rappelconso"` ou `"constructeur"` ;
2. presse spécialisée reconnue (L'Argus, Auto Plus, Caradisiac, Largus fiabilité, Autoplus
   fiabilité, UFC-Que Choisir) — acceptée, `kind: "presse"` ;
3. forums, blogs, vidéos — **jamais comme seule source**.

On décrit un fait documenté (« campagne de rappel », « défaut reconnu par le constructeur »,
« problème récurrent documenté par … »), jamais un jugement (« moteur pourri »). Dire d'un
moteur qu'il casse sans source, c'est un procès.

Une URL inventée est la pire faute possible : elle sera vérifiée par fetch, et toute ligne
dont la source ne se charge pas ou ne dit pas ce qu'on lui fait dire est supprimée.

## Comment ajouter une ligne

1. Trouver un fait précis (un défaut, un rappel) sur une source de niveau 1 ou 2 ci-dessus.
2. Fetcher la source et vérifier qu'elle confirme bien : le modèle, la période de production
   concernée, et le défaut tel que décrit (pas un défaut voisin sur un moteur partagé avec
   d'autres modèles — voir les rejets ci-dessous pour un exemple).
3. Écrire une ligne factuelle (`fact`) et un point de vérification actionnable pour
   l'acheteur (`check`), à la deuxième personne, sans jugement de valeur.
4. Normaliser `brand`/`model` sur la casse exacte de la table `listings`.
5. Insérer à la bonne place dans le tri (marque, modèle, année de début) ; si un même modèle
   porte déjà le même fait, garder la source la plus forte (rappelconso/constructeur avant
   presse) et ne garder qu'une entrée.

### Exemples de lignes rejetées à la vérification (pour référence)

- Un fait décrit pour un moteur partagé entre plusieurs modèles (ex. 1.2 PureTech) mais dont
  la source ne confirme pas explicitement qu'il s'applique aussi au modèle visé.
- Un rappel constructeur confirmé, mais dont la source ne précise pas la motorisation que la
  ligne annonçait — dans ce cas, soit retirer la précision moteur, soit chercher une source
  qui la confirme.

## Modèles sans aucune ligne retenue (à documenter plus tard)

Périmètre couvert à ce stade : Citroën, Ford, Opel, Peugeot, Porsche, Renault, Volkswagen.
Modèles de ces marques présents dans `listings` mais sans ligne de risque documentée pour
l'instant :

- **Citroën** : 2CV, Ax, Berlingo, Bx, C-Crosser, C-Elysée, C-Zero, C1, C15, C2, C25TD, C3
  Aircross, C3 Picasso, C5, C6, C8, Cx, DS3, DS4, DS5, Dyane, E-Mehari, Evasion, Jumper,
  Jumpy, Mehari, Nemo Combi, Saxo, Spacetourer, Visa, Xantia, XM, Xsara, ZX
- **Ford** : B-Max, C-Max, Cougar, Ecosport, Edge, Escort, Explorer, Fusion, Galaxy, GT, Ka,
  Ka+, Kuga, Maverick, Mondeo, Probe, Puma, S-Max, Scorpio, Streetka, Tourneo
- **Opel** : Adam, Agila, Ampera, Antara, Astra, Calibra, Combo, Crossland X, Frontera,
  Grandland X, GT, Insignia, Kadett, Karl, Meriva, Mokka, Monterey, Omega, Signum, Tigra,
  Vectra, Zafira
- **Peugeot** : 1007, 106, 107, 108, 2008, 205, 208, 3008, 306, 309, 4007, 4008, 405, 406,
  5008, 508, 604, 605, 607, 806, 807, Bipper Tepee, Boxer, Expert Combi, Ion, Partner, RCZ,
  Rifter, Traveller
- **Porsche** : 924, 944, Boxster, Carrera GT, Cayenne, Cayman, Macan, Panamera, Taycan
- **Renault** : Arkana, Avantime, Captur, Espace, Express, Fluence, Fuego, Kadjar, Kangoo,
  Koleos, Laguna, Latitude, Modus, R19, R21, Safrane, Talisman, Vel Satis, Wind, Zoe
- **Volkswagen** : Arteon, Bora, Caddy, California, Caravelle, Coccinelle, Combi, Corrado,
  Eos, Fox, Jetta, Lupo, Multivan, New Beetle, Passat, Phaeton, Scirocco, Sharan, T-Cross,
  T-Roc, Tiguan, Tiguan Allspace, Touareg, Touran, Vento

D'autres marques de `listings` (Toyota, BMW, Mercedes, etc.) n'ont pas encore été
recherchées et restent entièrement à documenter.
