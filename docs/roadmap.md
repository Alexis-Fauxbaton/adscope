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
| A · Panneau V1 — **livré** | retirer Ce prix / Avant d'y aller · liste des baisses avec cumul · ligne réactualisation · état « pas encore suivie » + bouton Suivre · Ce vendeur avec « actives » | — |
| B · Périmètre — **livré** | familles par licence · file de revisite priorisée dans le périmètre · doc du crawl par famille | familles des premiers marchands |
| C · Listing | flèche de baisse sur la pastille — **livré**. La barre de tri/filtre a été retirée : elle ne triait que la page chargée et parasitait la page hôte | — |
| D · Site adscope v0 | `web/`, servi par l'API sous `/app` : **Mes suivis** (baisses, seuils 30/60/90 j, disparitions, sur 24 h ou 7 j) et **Le marché** (toute la base : famille, ancienneté, baisse, pro/particulier) — **livré**, connexion par clé en attendant le lot Comptes | — |
| E · Republication | empreinte rare **et** annonce disparue → « même véhicule » | `disappeared_at` alimenté, donc revisites qui tournent |
| F · Alertes — **décidé le 2026-09-20** | recherches enregistrées (un jeu de filtres du marché, nommé) · règles : nouvelle annonce dans la recherche, baisse sur une annonce ancienne, mouvement sur un suivi · **un email par matin**, pas un par événement | lot 4 relu (le format des filtres) ; l'envoi réel attend le fournisseur d'email, d'ici là une boîte d'envoi locale |
| Store puis Render | inchangé, en dernier | — |

**Pourquoi le lot F** : le panneau seul, Castorus le donne gratuitement. Ce qui se facture est le
sourcing — le marché filtré, les suivis — et un marchand n'ouvre pas une page chaque matin de
lui-même. Modèle visé : extension gratuite (acquisition, et chaque utilisateur enrichit la
base), site payant. Avant Stripe : cinq marchands, deux semaines, gratuit — s'ils rouvrent le
site sans relance, le prix passe.

## Programme « recherche filtrée » — décidé le 2026-09-18, un lot à la fois, revue d'Alexis entre chaque

Le site doit découper proprement par famille, puis trier sur ce que les sites ne montrent pas.
Constats : 89 % des versions répètent le modèle ; la même voiture existe sous deux marques
(« Chevrolet / Corvette » et « Corvette / Autres ») ; 4 671 annonces (9 %) ont « Autres » pour
modèle ; la recherche est exacte et sensible à la casse (`ferrari` → 0, `Ferrari` → 390) ;
carburant, boîte et département ne sont pas stockés.

| Lot | Contenu |
|---|---|
| 1 · Taxonomie | mesurer le désordre · liste propre marque → modèle bâtie sur les annonces saines · table d'alias · libellés sans répétition, composés à un seul endroit (API) · recherche texte tolérante (casse, accents, mots dans le désordre) |
| 2 · Champs manquants | carburant, boîte, département — des faits ; le balayage remplit l'existant en un cycle |
| 3 · Les « Autres » | modèle **déduit du titre au passage**, comparé à la liste des modèles connus de la marque ; **on stocke le modèle déduit, jamais le titre**. Déterministe et prudent : une seule correspondance sans ambiguïté, sinon « modèle non précisé ». Ne remplace jamais un modèle donné par le site. **Reste hors de l'empreinte véhicule.** Précision mesurée d'abord sur les annonces dont le modèle est connu |
| 4 · Recherche filtrée | cascade marque → modèle avec compteurs, fourchettes prix / année / km, carburant, boîte, département, puis nos filtres (ancienneté, baisse, pro / particulier) |

**État au 2026-09-20.** Lots 1, 2 et 3 livrés, relus par Alexis. Lot 1 : recherche texte
tolérante, libellés sans répétition, orthographe officielle des marques. Lot 2 : carburant,
boîte, département (et la région, déduite du département). Lot 3 : sur 4 875 annonces au modèle
« Autres », 1 086 ont un vrai modèle (déduit de la version — 3a —, puis d'après la liste des
modèles que les sites n'ont pas, validée par Alexis — 3b). Restent 3 500 annonces sans aucune
version : seul le titre pourrait les résoudre (ancien « 3b », devenu 3c, non décidé).
**Lot 4 livré le 2026-09-20, relu par Alexis le 21 (« la recherche est bien »)** : filtres du marché avec
compteurs, cascades marque → modèle et région → département, fourchettes, départements nommés.
Le même jour : popup v2 (validée « good enough », à revoir aux tests finaux) et panneau
La Centrale remonté en tête de la colonne principale (placement retenu par Alexis).

**Lot E mesuré le 2026-09-20** (`.superpowers/lot-e-mesure.md`) : la règle « succession » —
mêmes caractéristiques, km égal ou à peine supérieur, même département, même vendeur si pro,
ancienne annonce disparue avant la mise en ligne de la nouvelle, candidat unique — ne se trompe
que sur 0,26 % d'annonces forcément différentes (0 % chez les pros). Mais zéro cas réel : 11
disparitions confirmées, toutes sur des annonces d'avant le stockage du département. **Ne pas
coder avant une nouvelle mesure, vers le 1er octobre.** La Centrale n'a aucune détection de
disparition (la file de revisite ne connaît que leboncoin) : lot à part, qui demande une fiche
supprimée sauvegardée par Alexis.

**Décision du 2026-09-20 — un modèle déclaré par un site n'est pas replié.** La règle « un mot
de carrosserie se rattache au modèle de base » (GLE Coupé → GLE) ne vaut que pour la déduction
des « Autres ». Six modèles déclarés par les sites auraient pu être rattachés (Peugeot Expert
Combi → Expert 33, Citroën Nemo Combi → Nemo 30, Toyota Proace Combi 2, Ferrari 458 Spider 3,
SF90 Spider 1, Mini Cabriolet 1) : Alexis a dit non. S'il change d'avis : six lignes d'alias de
modèle dans `shared/vehicle-aliases.json`, puis `api/scripts/recanonize.py --all`. Ne jamais en
faire une règle automatique : « Hyundai Coupé », « Bentley Coupé », « Fiat 124 Spider » portent
le mot dans leur nom.

**Alerte « la date a disparu »** (décidée le même jour) : le produit repose sur la date de
première publication que les sites laissent dans leur page (`first_publication_date`,
`creationDate`, `firstOnlineDate`). C'est le point fragile, bien plus que les identifiants. Une
alerte doit se lever le jour où la part d'observations portant cette date s'effondre, par site.

**À faire avant le go-live, hors dépôt** : quelques heures d'avocat (propriété intellectuelle et
numérique) — droit des bases de données et balayage complet contre périmètre par familles,
CGU, politique de confidentialité, conduite à tenir sur mise en demeure.

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

## Ce qui n'est pas dans le dépôt, et qui bloque — état au 2026-09-18

- **Le balayage tourne** et reste le mode d'acquisition : 51 712 annonces, dernière vue le
  18 septembre. Les familles de modèles ne restreignent pas l'acquisition ; elles priorisent les
  revisites et alimentent le site. Un seul Chrome connecté au compte.
- **Les revisites ne tournent pas régulièrement** : un seul run, le 12 septembre — 40 fiches
  servies, dont 9 seulement lisibles (sortie tronquée, voir `crawler/RUNBOOK-revisites.md`), et
  jamais la seconde constatation à six heures. Zéro absence, zéro `disappeared_at`. **Le lot E
  (republication) reste bloqué tant que ce runbook n'est pas programmé** côté Alexis.
- Le panneau est vérifié sur une vraie fiche leboncoin (capture d'Alexis du 18 septembre).
