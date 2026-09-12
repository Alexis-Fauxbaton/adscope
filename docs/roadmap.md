# Feuille de route — V1 redéfinie le 2026-09-12

Utilisateur : **le marchand**. La vue qui fait le produit : ce qu'il ouvre le matin.

## V1 — contre l'existant

| Sur la fiche | État | Reste |
|---|---|---|
| Ancienneté réelle | fait (carte chiffre) | — |
| Historique de prix : chaque baisse, date, montant, cumul | courbe faite | liste des baisses avec cumul |
| Republication : même véhicule, nouvel ID | mécanisme absent | **gated par `disappeared_at`** — 0 sur 46 572, la file de revisite n'est drainée par personne |
| Réactualisation : remontée sans baisse | fait (`republished` depuis l'horodatage du site) | afficher dans « Cette voiture » |
| Stats vendeur : actives, ancienneté du stock, propension à baisser | fait (`SellerStatsOut`) | « actives » exclut les disparues quand elles existeront |

| Sur les listings | État | Reste |
|---|---|---|
| Badge d'ancienneté | fait | — |
| Flèche de baisse sur la carte | — | à faire, depuis `price_delta_since_first` |
| Tri / filtre par ancienneté | — | à faire, dans la page, **sur la page chargée seulement** — on ne demande jamais d'autres pages |

| La vue | État | Reste |
|---|---|---|
| Mes opportunités | — | bouton **Suivre** (serveur, par licence) · calcul des changements depuis la dernière ouverture · vue « ce matin » |

| Contraintes données | État | Reste |
|---|---|---|
| Annonce inconnue → « pas encore suivie » + ajouter à la file | jour 1 honnête déjà rendu | l'état nommé, le bouton, l'entrée en file de revisite |
| Périmètre = familles de modèles des premiers marchands | crawl par tranche de prix | table des familles par licence, revisites priorisées dedans, crawl par famille (côté Alexis) |

## Sortis de V1 — gardés, non branchés

Comparables et « Ce prix » (route `/comparables` livrée, section retirée du panneau), risques
moteur et questions (`shared/vehicle-notes.json`, 51 lignes sourcées), cote, score, mobile,
doublon multi-plateformes.

## Lots, dans l'ordre

| Lot | Contenu | Dépend de |
|---|---|---|
| A · Panneau V1 | retirer Ce prix / Avant d'y aller · liste des baisses avec cumul · ligne réactualisation · état « pas encore suivie » + bouton Suivre · Ce vendeur avec « actives » | — |
| B · Périmètre | familles par licence · file de revisite priorisée dans le périmètre · doc du crawl par famille | familles des premiers marchands |
| C · Listing | flèche de baisse · tri/filtre par ancienneté sur la page | — |
| D · Mes opportunités | suivis serveur · changements depuis la dernière ouverture · vue | A (Suivre) |
| E · Republication | empreinte rare **et** annonce disparue → « même véhicule » | `disappeared_at` alimenté, donc revisites qui tournent |
| Store puis Render | inchangé, en dernier | — |

## Ce qui n'est pas dans le dépôt, et qui bloque

- **Le crawl est arrêté depuis le 8 septembre 20 h 13.** La tâche horaire côté Claude cowork
  est à mettre en pause de toute façon : le périmètre par famille remplace les tranches de prix.
- **La file de revisite n'a jamais été drainée** : deux runs le 8 septembre, « file vide »
  les deux fois — rien n'avait alors trois jours de silence. Aujourd'hui tout en a quatre.
  Sans revisites, pas de `disappeared_at`, donc pas de republication : **le lot E est bloqué
  tant que `RUNBOOK-revisites.md` n'est pas programmé** côté Alexis, avec un seul Chrome
  connecté au compte.
- Aucune fiche leboncoin sauvegardée à la racine : le panneau est vérifié sur fixture, pas sur
  le gabarit réel.
