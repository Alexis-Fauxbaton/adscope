# Le panneau — direction retenue le 2026-09-08

Maquette validée : `panneau-ui-consumer.png`, **colonne du milieu**. Remplace la direction
visuelle de `popup-conception.md` (document administratif), abandonnée le même jour après
essai : « immonde, brouillon ». Les règles d'honnêteté de ce document-là restent.

## Registre

App consumer — Revolut, Lydia, Alan. Sol gris très clair, cartes blanches rayon 22, ombre
douce, aucun filet. Manrope, chiffres tabulaires. Un accent bleu-violet pour la mesure
d'adscope. **L'orangé n'existe que pour ce que le site cache** : la pilule « Le site affiche
60 j » et la fenêtre des 60 jours sous la courbe.

**Une chose par carte.** C'est ce qui a réglé « trop compact, trop empilé ».

## Structure — le layout du milieu

Injecté dans la fiche, sous le prix, colonne 620 px :

1. **Carte chiffre** — `En ligne depuis` · **4 ans 11 mois** · 1 810 jours, date de mise en
   ligne · pilule orangée du site.
2. **Carte courbe** — 118 jours relevés, fenêtre du site en aplat orangé, une phrase dessous.
3. **Sections en cartes de contenu**, pas en liste de navigation. `Ce prix` ouverte par
   défaut (pictogramme rond + titre, distribution des comparables, trois lignes). Les trois
   autres — `Cette voiture`, `Ce vendeur`, `Avant d'y aller` — repliées en une rangée chacune
   dessous, avec le fait en sous-titre ; une seule ouverte à la fois.
4. Pied en ligne grise.

Jour 1 : carte chiffre identique, carte bleue pâle à la place de la courbe (« Deux relevés en
deux jours — la courbe apparaîtra d'elle-même »), pas de section `Ce vendeur` sous deux
annonces vues.

## Ce que chaque section porte, et quand elle existe

| Section | Contenu | Existe dès |
|---|---|---|
| Cette voiture | même voiture sous un autre identifiant (avec sa preuve) · risques moteur sourcés | jour 1 ; republication après `disappeared_at` |
| Ce prix | position dans la distribution, dispersion affichée · sortie du marché des comparables | jour 1 sur segment serré ; sortie après `disappeared_at` |
| Ce vendeur | annonces vues, part > 1 mois, ancienneté médiane, baisses | ≥ 3 annonces vues |
| Avant d'y aller | HistoVec, PV du CT, questions | jour 1 |

## Décisions ouvertes

- seuil « segment trop dispersé pour comparer » : 30 % posé dans la maquette, à arbitrer ;
- « 3 574 km inchangé » impossible tant que le km n'est stocké qu'au niveau annonce ;
- comparables : `version` renseignée sur 31 % des annonces, le regroupement réel sera souvent
  marque + modèle + année, la réserve plus dure.
