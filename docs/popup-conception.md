> **Direction visuelle remplacée le 2026-09-08** par `panneau-conception.md` (registre app
> consumer, panneau dans la page). Les règles d'honnêteté ci-dessous restent valables.

# La popup — direction retenue le 2026-09-06

Maquette validée : `popup-maquette.png`.

## Le rôle

La pastille **alerte**, la popup **informe**. Sur une fiche, l'information utile se dilue
dans la page — leboncoin en affiche beaucoup, La Centrale peu — et l'encart ne sait jamais
ce qui l'entoure. La popup devient donc la surface principale sur les fiches ; l'encart
reste le signal court qui appelle.

## L'univers visuel

Le document administratif du métier : carte grise, contrôle technique, carnet d'entretien.
Papier pâle légèrement teinté, encre marine, chiffres et références en chasse fixe, un rouge
de tampon réservé à l'alerte.

Le ton visé est celui d'un **constat**, pas d'une alerte commerciale. Un marchand qui montre
cet écran à un vendeur pose un document plutôt qu'il ne brandit une accusation — et c'est
plus difficile à contester.

Écartées volontairement, parce qu'elles apparaissent quel que soit le sujet : le fond crème
avec serif contrasté et accent terracotta ; le fond quasi noir avec accent acide ; la mise
en page type journal à filets fins.

## La signature : une courbe de prix sur l'axe du temps

L'axe couvre **toute** la vie de l'annonce, de la mise en ligne à aujourd'hui. C'est la durée
qui est le sujet, pas le prix : le prix n'est que ce qu'on trace dessus.

Trois signes, chacun avec un seul sens :

- **hachure** — période sans aucune observation. On ne sait pas ce que le prix a fait.
  Doit porter une date explicite : « aucune observation avant le 25 août », jamais un mot
  seul.
- **gros point** — un changement de prix constaté.
- **petit point** — une vérification hebdomadaire : le prix n'avait pas bougé. C'est
  l'échantillonnage temporel introduit le 2026-09-06 qui rend ce signe possible.

Et une **bande rouge** pour ce que le site montre de son côté. Un seul usage, jamais un
autre : sur la fiche La Centrale plafonnée, elle occupe dix pixels sur trois cents.

Le même composant sert les deux extrêmes : une annonce découverte du jour est presque
entièrement hachurée, une annonce suivie quatre mois porte ses marches et ses vérifications.
Il se dégrade honnêtement au lieu de tracer une ligne plate qu'on ne sait pas justifier.

## Le badge sur l'icône

`chrome.action.setBadgeText` par onglet. **Ne rien afficher quand il n'y a rien à dire** —
un badge toujours porteur d'un nombre devient du papier peint en deux jours. C'est l'erreur
déjà corrigée deux fois sur les pastilles.

## Écarté : la comparaison au prix du marché

La cote Argus est sous licence payante, et les deux sites affichent déjà leur propre
positionnement de prix. Le terrain est occupé, et ce n'est pas celui du produit.

Une comparaison calculée sur nos propres observations a été envisagée, puis **mesurée sur
les 29 704 annonces en base le 2026-09-06** :

| regroupement | groupes exploitables | dispersion médiane |
|---|---|---|
| marque + modèle + année | 623 | **48 %** |
| idem + tranche de 30 000 km | 346 | **42 %** |

L'écart interquartile vaut donc près de la moitié du prix médian. Sur une Clio de 2004 :
médiane 1 000 €, moitié centrale entre 700 et 1 350 €. Annoncer « 15 % au-dessus du marché »
n'aurait aucun sens.

Contre-exemple éclairant : Porsche 911 de 2019, dispersion **10 %** — sur un modèle cher et
peu décliné, la comparaison fonctionnerait.

Deux causes, aucune réparable par du code : la **version n'est renseignée que sur 31 %** des
annonces, alors que c'est elle qui sépare une finition de base d'une haut de gamme ; et les
libellés sont sales — « Renault Autres » compte 603 annonces.

À reconsidérer quand la version sera renseignée sur une large part du parc. Pas avant.
