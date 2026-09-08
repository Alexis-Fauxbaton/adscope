# Feuille de route — état au 2026-09-08

Le produit répond à une question d'acheteur : *est-ce que cette voiture vaut le coup, et à
combien je dois essayer de l'acheter ?* Tout ce qu'il dit est observé, jamais estimé.

## En cours

**Lot 1 — le panneau.** Comparables côté API (`/comparables`, segment marque+modèle+année
± version, dispersion, centile, porte à 0,30) et panneau dans la page côté extension
(`panneau-conception.md`). Jour 1 réel : chiffre, courbe, Ce prix, Avant d'y aller.

## Ensuite, dans l'ordre

| Lot | Contenu | Prêt quand | Porte |
|---|---|---|---|
| 2 · Éditorial | risques moteur par marque+modèle+année, questions au vendeur ; top 20 modèles de la base d'abord (Clio, 206, 207, 208, C4 Picasso…) | tout de suite | chaque ligne sourcée (RappelConso, constructeur) — sinon elle n'existe pas |
| 3 · Store | icônes, description, `optional_host_permissions` réduit aux deux domaines, politique de confidentialité hébergée, déclaration « web browsing activity », captures 1280×800 | tout de suite | la soumission attend l'URL de prod |
| 4 · Disparition | sortie du marché des comparables (Ce prix), republication par empreinte (disparue **et** rare), durée de vie par segment | quand la revisite a produit des semaines de données | jamais « vendue » ; l'expiration des particuliers séparée d'une vraie disparition |
| 5 · Vendeur | section Ce vendeur enrichie | quand la couverture crawl le permet — 76 % des vendeurs ont ≤ 2 annonces vues aujourd'hui | seuil ≥ 3 annonces |
| 6 · Mobile | lecture de notre base par lien collé | après Render | jamais de récupération de page depuis notre serveur |
| Render | déploiement, puis manifeste `host_permissions` sur l'URL de prod, puis soumission | **en dernier**, décision d'Alexis | — |
| La Centrale | corpus à constituer (Alexis, résultats triés par ancienneté), puis signature de disparition | quand le corpus est là | deux témoins structurels, pas un libellé seul |

## Décisions ouvertes

- seuil « segment trop dispersé » : 0,30 posé, à arbitrer sur données ;
- kilométrage par relevé (aujourd'hui au niveau annonce seulement) — utile pour « km inchangé
  depuis N jours », demande une colonne sur les points ;
- profil Chrome distinct pour le crawl, pour que son trafic cesse de compter comme usage
  humain — décision de poste.

## Ce qu'on ne fera pas

Financement (interdit par le brief, sans intérêt pour un acheteur qui n'est pas là pour ça),
tendance de marché sur transactions (pas de fichier des ventes automobiles), popularité
(tout le trafic vient du crawl), prix cible affirmé (on n'observe pas de vente), verdict ou
score (on compose des faits, l'acheteur conclut).
