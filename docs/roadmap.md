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

## Lot « Comptes » — au go-live, avec la facturation

Décidé le 2026-09-18. La clé collée à la main ne tient pas pour un marchand ; l'email est de
toute façon requis pour facturer.

- **Site** : email → lien magique → cookie de session. Pas de mot de passe. Demande un
  fournisseur d'envoi et un domaine, donc l'hébergement : d'où le go-live.
- **Extension** : reste connectée par le même cookie que le site (permission d'hôte sur le
  domaine). Session longue et glissante.
- **Session tombée = visible, jamais silencieuse** : « reconnectez-vous » à la place de la
  pastille, et un « ! » sur l'icône de la barre d'outils. Pas de bandeau dans la page hôte.
- **Les machines gardent une clé** : crawl et file de revisite. L'extension accepte les deux —
  clé si elle est configurée, cookie sinon. Sans ça, une pastille « reconnectez-vous » passerait
  le contrôle de santé du runbook (il compte les éléments `adscope-`) et le crawl tournerait à
  vide en se croyant sain.
- **CSRF** : `SameSite` + contrôle d'origine sur les routes qui écrivent — surface nouvelle dès
  qu'un cookie authentifie.
- **À vérifier avant de coder** : que Chrome traite bien comme « même site » les requêtes d'une
  extension vers un hôte qu'elle a en permission, et l'effet du blocage des cookies tiers.
- Schéma : table `accounts`, licences rattachées. Les emails sont de la donnée personnelle :
  politique de confidentialité et déclaration du Store à écrire en conséquence.

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
