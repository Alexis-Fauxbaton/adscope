# Lot 1 — le panneau dans la page

Le petit encart `adscope-panel` de `src/detail.js` est remplacé par le panneau de la maquette
`docs/panneau-ui-consumer.png`, colonne du milieu. La mécanique d'ancrage, de marquage
(`data-adscope-detail`, `data-adscope-src`) et d'idempotence est conservée : le test de recyclage
et les sept autres de `detail.test.mjs` restent verts.

Tests : **328 verts** côté extension (302 avant), **214 verts** côté API — je n'ai pas touché à
`api/`, le lot 2 y a livré `abde97b` entre-temps. Rien n'est commité : HEAD n'a pas bougé de mon
fait, tout est dans l'arbre de travail. Le `git mv` de `popup/curve.js` vers `src/curve.js` est
indexé (c'est ce que fait `git mv`), le reste ne l'est pas.

## Ce qui a été écrit

Sept modules de rendu, chacun sous `globalThis.ADS`, empilés dans `js: []` du manifeste :

| Fichier | Ce qu'il tient |
|---|---|
| `src/panel-node.js` | `ADS.node` — poser un élément de page, un élément de dessin, un pictogramme |
| `src/panel-icons.js` | `ADS.icons` — les cinq tracés de la maquette |
| `src/panel-curve.js` | `ADS.plot` — le tracé du prix relevé, 572 × 210, fenêtre orangée comprise |
| `src/panel-note.js` | `ADS.note` — la phrase sous la courbe, composée des points relevés |
| `src/panel-price.js` | `ADS.spread` — la barre de distribution et la ligne qui la remplace |
| `src/panel-sections.js` | `ADS.sections` — les quatre sections et la règle de leur existence |
| `src/panel-cards.js` | `ADS.cards` — la carte chiffre, la carte courbe, la carte pâle |
| `src/panel.js` | `ADS.panel` — l'assemblage, l'entête, le pied, la section ouverte |
| `src/panel.css` | la feuille, préfixée `adscope-` de bout en bout |

Deux modules de données :

- `src/market.js` (`ADS.market`) — demande les comparables et, pour un marchand seulement, ses
  statistiques ; une fois par annonce, jamais deux.
- `src/lookup.js` (`ADS.lookup`) — les deux `GET` correspondants, côté service worker.

Et `popup/curve.js` → `src/curve.js` : le modèle d'axe est réutilisé tel quel par le panneau, la
popup continue de s'en servir (`popup.html` et trois tests suivent le chemin).

## Trois décisions qui ne se lisent pas dans le code

**L'axe de la courbe part du premier relevé, pas de la mise en ligne.** La popup trace la vie
entière de l'annonce et hachure ce qu'elle n'a pas vu ; sur une fiche de 1 810 jours suivie
depuis 118, cela écraserait tout le tracé sur les six derniers pour cent de la largeur. La
maquette montre « Prix relevé · 118 jours » à côté de « 4 ans 11 mois » : c'est la fenêtre de
suivi. `ADS.curve.plot` reçoit donc `first_seen` là où la popup passe `publishedAt`.

**Les deux lectures neuves passent par le service worker.** Un `fetch` parti du content script
porterait l'origine du site ouvert ; le navigateur le refuserait, et `host_permissions` ne couvre
que l'API. `sw.js` gagne deux entrées de `handlers` et un `importScripts`. La popup, elle, est une
page d'extension : elle continue d'appeler `ADS.seller.fetch` directement.

**La contradiction du site tient dans une pilule et son survol.** La maquette n'affiche que « Le
site affiche 60 j ». Le libellé exact (« Publiée il y a 60 jours ») et ce qu'il recouvre
(« compteur plafonné à 60 jours ») sont portés par l'attribut `title` de la pilule : rien n'est
perdu, rien n'encombre. Les tests de La Centrale vérifient les deux.

## Le point d'injection, par site

`site.mount(doc, dateNode)` est déclaré par chaque module de site, et `detail.js` ne connaît que
le repli sur `h1` :

- **La Centrale** — `#pavePrix`. Relevé sur les deux fiches sauvegardées, absent de la page de
  résultats. C'est le seul repère non haché de la fiche. Il fallait le trouver : le libellé
  « Publiée il y a N jours », auquel l'ancien encart s'accrochait, ferme la page au ras du pied,
  sous « Signaler cette annonce » — le panneau y était invisible.
- **leboncoin** — le nœud de date lui-même : sa fiche écrit le prix et l'ancienneté dans le même
  bloc, sous le titre, et rien de plus stable ne s'offre.

Les deux modules de site étaient déjà à 150 lignes pile. Pour loger `mount`, j'ai resserré deux
commentaires de `lacentrale.js` (les seuils `OLD_MIN_DAYS` et `BUMP_MIN_MS` : tous les nombres
mesurés sont conservés, seule la mise en ligne change) et un de `leboncoin.js`. Les deux fichiers
sont à 150.

## `view.panel` est retiré

Le panneau ne passe plus par `ADS.view.panel` : ses lignes `page`/`claim` n'ont plus d'emploi. La
fonction est supprimée, et `tracking` — qui portait la seule chose que le panneau reprend, le
suivi mutualisé et sa mention de vérification — devient publique. Elle s'affiche en deux lignes
grises sous la courbe (« Suivie depuis : 3 mois · 16 vues », « Prix : 22 700 € ▼ −2 200 € en
2 mois »). Dans `view.test.mjs`, les tests de `claim` interrogent désormais `site.claim`
directement — c'est le site qui nomme la contradiction, jamais le code partagé — et les tests de
`tracked` interrogent `tracking`. Deux tests ont disparu avec la notion qu'ils vérifiaient
(`page[0].strong`, la hiérarchie de l'ancien encart) ; leur intention est reprise par
`panel.test.mjs`, où c'est la pilule qui porte l'accusation.

## Le banc d'essai

`tests/stage.mjs` a gagné ce qu'il fallait pour juger un panneau plutôt qu'un encart : les
sélecteurs de classe et d'identifiant, `createElementNS`, `addEventListener`/`click`, et un
`insertBefore` qui respecte le rang — c'est lui qui permet de dire si le panneau s'est posé sous
le prix ou au pied de la page. Les messages `comparables` et `seller` sont mis de côté dans
`relayed()`, et `answer(type, corps)` joue la réponse de l'API quand le test le décide.

`tests/panel-page.mjs` porte la fiche de la maquette : 1 810 jours en ligne, remontée il y a 60,
118 jours de relevé, deux baisses dont une seule dans la fenêtre du site.

## La preuve par la casse

Vingt-cinq mutations passées, une par ligne nommée dans un commentaire de test. Toutes rendent
rouge le test qui les nomme. Trois attributions étaient fausses au premier passage et ont été
corrigées plutôt que maquillées :

- « le panneau rejoué garde la section ouverte » ne prouvait pas le garde `SRC` de `detail.js`
  (le choix vit sur l'attribut du nœud, qui survit à un rendu de trop) mais le
  `deck(ctx, root.getAttribute(OPEN), toggle)` de `panel.js` — c'est ce qu'il nomme désormais ;
- « le marché ne se demande qu'une fois » ne touchait pas le garde de `market.js` tant que le
  garde `SRC` empêchait le second rendu : le test fait maintenant arriver les signaux, ce qui
  déclenche bien un second rendu ;
- « un particulier n'est jamais agrégé » prouve le `sellerType === 'pro' && sellerId` de
  `market.js`, pas le seuil de trois annonces de `panel-sections.js` — les deux ont leur test.

Le script de mutation est dans le scratchpad de la session, il n'entre pas au dépôt.

## Vérifié dans un navigateur, sur les pages sauvegardées

Chrome (Playwright), les modules concaténés et injectés dans la page réelle servie en local, avec
un relevé et des comparables de fabrique.

- **`Annonce Peugeot 208 ii … Vendée 85.html`** (fiche plafonnée) : panneau posé juste après
  `#pavePrix`, largeur 571 px dans la colonne du site ; « 4 ans 11 mois », pilule « Le site
  affiche 60 j » avec son survol complet, courbe et fenêtre orangée, phrase « Dans les 60 jours
  affichés, une seule des deux baisses est visible », barre de distribution avec ses cinq bornes
  et le repère de l'annonce. Rendu conforme à la maquette.
- **`Annonce Peugeot 208 1.2 vti … Hauts-de-Seine 92.html`** (22 jours) : même ancrage, hero
  « 22 jours », **aucune pilule** — le site ne ment pas, rien ne l'accuse.
- **leboncoin** : il n'y a pas de fiche leboncoin sauvegardée à la racine du dépôt (les trois
  pages sont de La Centrale). J'ai monté une fiche à partir d'une annonce réelle de
  `tests/fixtures/leboncoin-ads.json` dans un `__NEXT_DATA__`, avec le libellé « il y a 2 mois à
  15:36 » : le module lit la charge, le panneau se pose sous le bloc de date, les quatre sections
  sont là. C'est le chemin de données qui est vérifié, pas le gabarit du site.

Deux réserves sur ce banc, à connaître avant de le refaire :

1. Rejouée hors ligne, la fiche La Centrale sauvegardée s'hydrate à vide et **efface** le bloc
   `#container-references-info` que son rendu serveur portait — « Publiée il y a 60 jours »
   disparaît du DOM vivant alors qu'il est bien dans le HTML. Je l'ai remis à l'identique avant
   de lire la page. Sur le site en ligne, ce bloc est là.
2. La bannière de consentement recouvre la page ; elle est retirée avant la capture.

## Contre l'API réelle

Le lot 2 a livré la route entre-temps. Cinq annonces tirées de la base de développement :

```
lbc 2992782123  Ford Fiesta 2007      53 comparables  dispersion 88 %  too_dispersed
lbc 3264292041  Peugeot 308 2010      85              100 %           too_dispersed
lbc 3260604263  Citroen C4 Picasso    50               75 %           too_dispersed
lbc 3252307487  Peugeot 307 2005     188               62 %           too_dispersed
lbc 3256665494  Peugeot 306 1994      12              111 %           too_few
```

Le panneau rendu avec la première de ces réponses affiche « 53 comparables, segment trop dispersé
pour comparer (dispersion 88 %). » et « Segment retenu : Ford Fiesta 2007 ». Pas de barre.

**C'est le cas majoritaire aujourd'hui, et il faut le regarder en face** : la base de
développement est peuplée d'annonces à bas prix (min 1 €, max ~3 500 € sur les segments tirés),
et un segment marque + modèle + année y est presque toujours au-delà du seuil de 0,30. Le
panneau montrera donc bien plus souvent la ligne de refus que la barre. C'est le comportement
voulu — il vaut mieux se taire que comparer un moteur cassé à une voiture roulante —, mais tant
que le seuil et la population n'auront pas été arbitrés (`docs/panneau-conception.md` note déjà
le 30 % comme « à arbitrer »), la section `Ce prix` sera surtout une section qui s'abstient.

## Ce que le lot ne fait pas

Conforme au cadrage : pas de ligne « quitté le marché » (attend `disappeared_at`), pas de
republication par empreinte, pas de risques moteur. La section `Ce vendeur` n'existe que pour un
marchand dont on a vu au moins trois annonces, et la réserve « son catalogue réel nous est
inconnu » tient en une ligne. Aucune fonte Google : `-apple-system, Inter, Segoe UI, sans-serif`.
`all: initial` sur la racine, `all: unset` sur une liste explicite de balises descendantes — les
nœuds de dessin en sont exclus, `all` recouvrant `fill` et `stroke`, et une règle CSS l'emportant
sur un attribut de présentation : le tracé disparaîtrait.

## Deux choses à trancher

- **Les deux lignes grises de suivi sous la courbe** (« Suivie depuis », « Prix : … ») ne sont pas
  dans la maquette. Elles portent la mention de vérification (« vérifié chaque semaine », « non
  vérifié pendant N jours ») qui est le garde-fou d'honnêteté de la popup, et sans elles
  `ADS.view.tracking` devenait du code mort. Si elles alourdissent, elles se retirent en une
  ligne de `panel-cards.js` — mais `tracking` part avec.
- **La largeur.** La maquette pose 620 px ; la colonne de prix de La Centrale en donne 571 au
  viewport 1440, et 404 sur un viewport étroit. La courbe et la barre se mettent à l'échelle
  (`viewBox` + `width: 100%`), mais le chiffre héros à 46 px commence à serrer sous 420 px. Une
  requête de conteneur ou un palier à 400 px réglerait le cas ; je ne l'ai pas fait faute de
  savoir sur quelle largeur la fiche mobile s'ouvre réellement.
