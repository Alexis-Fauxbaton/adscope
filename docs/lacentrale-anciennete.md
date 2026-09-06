# La Centrale — l'ancienneté affichée plafonne à 60 jours

Relevé le 2026-09-06, à la main, sur des Peugeot 208 d'occasion.

## Le libellé

Sur une fiche, sous le prix : `Publiée il y a N jours`. Toujours en jours — **le site ne
bascule jamais en mois**, contrairement à l'hypothèse de départ.

Échantillon d'âges variés : 23, 29, 38, 45, 45, 60 jours.

## Le plafond

En triant la recherche par `sortBy=firstOnlineDateAsc` (Annonces les moins récentes), les
cinq annonces les plus anciennes des 9 541 du listing affichent **toutes exactement
`Publiée il y a 60 jours`**. Le compteur sature à 60 ; il ne dit rien au-delà.

Conséquence directe pour la détection de republication : elle ne discrimine que sous
60 jours. Passé ce seuil, une annonce en ligne depuis 61 jours et une autre depuis deux
ans portent le même libellé. Ce n'est pas un défaut d'analyse, c'est une limite du site.

## Rien sur les cartes

La page de résultats (24 cartes) ne contient aucune mention d'ancienneté : ni `il y a`,
ni `publiée`, ni un nombre de jours. L'ancienneté n'existe que sur les fiches — donc pas
de collecte possible par page de résultats, une visite de fiche par annonce.

## Le nœud DOM

```
main
 └ div.main-area
    └ div.ReferencesInfo_referencesInfoContainer__SLIVb
       └ div.Text_Text_text.Text_Text_body-small.ReferencesInfo_refs__0sGLk
```

**Ne pas ancrer le sélecteur sur ces classes.** Les suffixes `__SLIVb` et `__0sGLk` sont
des hachages de CSS Modules, régénérés à chaque build du site : un sélecteur exact casse
à la première mise en production. Viser un préfixe (`[class*="referencesInfoContainer"]`)
ou, mieux, le texte lui-même.

## CONFIRMÉ : la date exacte survit au plafond — `creationDate`

Le paramètre de tri s'appelle `firstOnlineDateAsc` : le site connaît donc une date de
publication exacte. Sur la fiche affichant 23 jours, `__NEXT_DATA__` contient
`2026-08-14T13:05:57.895Z`, soit exactement 23 jours — la date semble bien présente dans
la page.

**Mais sur une fiche plafonnée à 60 jours, aucun horodatage récent équivalent n'apparaît** :
seulement une date future (validité d'offre) et une date de 2021. Impossible de conclure
d'ici que la date exacte survit au-delà du plafond, et aucune clé JSON contenant `date`,
`online` ou `publi` n'a été trouvée — l'horodatage est ailleurs dans les 398 Ko du blob.

### Vérification faite le 2026-09-06, hors ligne, sur les deux pages sauvegardées

La clé est **`creationDate`**, dans le bloc `financing.combined` de `__NEXT_DATA__`.

| | fiche non plafonnée | fiche plafonnée |
|---|---|---|
| libellé affiché | « Publiée il y a 23 jours » | « Publiée il y a 60 jours » |
| `classifiedReference` | W103538172 | B101733515 |
| `creationDate` | 2026-08-14 → **23 j** | 2021-09-22 → **1 810 j** |

Sur la fiche non plafonnée, `creationDate` correspond au jour près au libellé : c'est bien
la date de mise en ligne de l'annonce. Sur la fiche plafonnée, le blob ne contient **qu'une
seule** `classifiedReference` et **qu'une seule** `creationDate`, toutes deux celles de la
page — la date lui appartient donc, et elle remonte à près de cinq ans.

**La Centrale connaît la date exacte, la transporte dans la page, et choisit de ne pas la
montrer au-delà de soixante jours.**

Une Peugeot 208 de 2020, 3 574 km, 22 700 € : une voiture qui n'a pas roulé parce qu'elle
n'est pas partie, et dont l'annonce se présente comme récente.

### Ce que ça vaut

| | ce que le site montre | ce qu'adscope montre |
|---|---|---|
| leboncoin | « aujourd'hui à 21:14 » | en ligne depuis 4 jours |
| La Centrale | « il y a 60 jours » | **en ligne depuis 5 ans** |

Facteur quatre sur leboncoin, facteur trente ici. La Centrale devient un second site
pleinement justifié — sur l'ancienneté, pas sur le prix, que le site affiche déjà
honnêtement (frise « Informations prix », plafonnée elle aussi à 60 jours).

### Réserve

Un seul échantillon plafonné. À confirmer sur deux ou trois autres fiches anciennes avant
de bâtir dessus. L'indice est fort — la clé correspond au jour près sur la fiche non
plafonnée — mais il n'est pas établi que `creationDate` soit présent sur toutes les fiches.

Fixture extraite : `extension/tests/fixtures/lacentrale-fiches.json`.

## Portée du relevé

Onze fiches ouvertes et quatre affichages de résultats, à la main, sans pagination ni
collecte. Le site sert une page de vérification d'appareil à la première visite ; elle
passe seule en quelques secondes.
