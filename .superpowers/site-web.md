# Le site v0 — `web/`

Ce qu'un marchand ouvre le matin : trois écrans, servis tels quels par l'API sous `/app`.
Pas de build, pas de framework, aucune dépendance. Modules ES, 12 fichiers source, le plus
gros en fait 123 lignes.

## Ce qui est livré

| Écran | Route | Contenu |
|---|---|---|
| Connexion | `/app/` sans clé | un champ, vérifié par `GET /v1/me`, gardé en `localStorage` |
| Mes suivis | `#/suivis` (accueil) | bascule 24 h / 7 jours, une carte par annonce qui a bougé, le reste replié |
| Le marché | `#/marche` | filtres en une rangée, tri, cartes, « Voir plus », ligne de périmètre |

Deux entrées de navigation en haut, « Se déconnecter » à droite. Responsive jusqu'à 390 px.

## Les fichiers

    web/index.html              coquille + Manrope + favicon en ligne
    web/css/base.css            jetons, entête, contrôles, media query
    web/css/views.css           les trois vues
    web/js/api.js               tous les appels réseau, et eux seuls
    web/js/fixtures.js          le mode démo : filtre, trie, pagine comme l'API
    web/js/fixtures-data.js     30 annonces de marché, 8 suivis
    web/js/format.js            ancienneté, prix, dates, libellé du site
    web/js/facts.js             le texte du fait, par type de changement
    web/js/query.js             la requête de `/v1/market`
    web/js/dom.js               `el()` / `outLink()` — tout passe par `textContent`
    web/js/login.js             web/js/follows.js   web/js/market*.js   web/js/app.js

`?demo=1` coupe le réseau et rend les fixtures. C'est ce qui a permis de dessiner pendant que
les routes se livraient, et c'est ce que montrent les quatre captures.

## Vérifié contre l'API réelle, pas seulement contre le contrat

Le lot API a atterri pendant le travail (`3bd482f`). Site lancé contre lui, sur la base
`adscope`, avec la licence de test :

- clé bidon → « Cette clé n'est pas reconnue » · vraie clé → entre ;
- **Mes suivis** : aucun suivi sur cette licence, l'état vide honnête s'affiche ;
- **Le marché** : 51 712 annonces, filtre pro → 13 457, tri et « Voir plus » répondent ;
- les 17 champs d'un item et les 20 d'un item de fil sont exactement ceux du contrat.

Deux choses que seul le réel a dites :

1. **Le code de site est `lbc` / `lc`**, pas `leboncoin` / `lacentrale` — 51 688 et 24
   annonces. Sans table de correspondance la ligne du véhicule affichait « lbc » au
   marchand. Corrigé, et la table est tenue par un test.
2. **`seller_name` est presque toujours nul, même sur des annonces `pro`** : une seule sur
   vingt portait un nom. La carte le gère (la ligne vendeur n'existe pas alors), mais côté
   produit « vendeur si pro » ne montrera pas grand-chose tant que le nom n'est pas stocké.

## Tests

`cd web && node --test tests/*.test.mjs` → **37 verts**, 0 rouge.

Formatage, construction de la requête de filtre, texte du fait par type de changement, et le
mode démo lui-même (fenêtre, tri, filtres, pagination). Aucun test ne lit l'horloge réelle :
l'instant de référence est `DEMO_NOW = 2026-09-18T09:00:00Z`, posé dans `fixtures-data.js`, et
les fichiers de test fixent `process.env.TZ` avant tout usage de `Date`.

Chaque test nomme la ligne de production qui le fait rougir. Prouvé : **34 mutations, une par
ligne nommée, toutes rouges** — report des douze mois, séparateur de milliers, garde du zéro
signé, `getUTC*`, « 1er », table des sites, `filter(Boolean)`, cumul des baisses, signe de la
variation, ordre disparition → baisse → seuil, chacun des sept `if` de `marketQuery`, borne de
`limit`, découpe de la saisie libre, borne stricte du seuil franchi, fenêtre des changements,
rang du tri, tranche de pagination, comparateurs. Le script est jetable, dans le scratchpad.

Les suites existantes restent vertes : API **287**, extension **359**.

## Règles tenues

- **Jamais « vendue »** : `goneFact` ne dit que « a disparu le 15 sept. », et un test l'assure
  par `assert.ok(!/vendu/i.test(...))`.
- **Pas de score**, nulle part.
- **L'identité d'un vendeur n'est servie que s'il est professionnel** : la ligne vendeur
  n'existe que si `seller_name` est là, et les lignes `private` des fixtures le portent à
  `null` — y poser un nom fait rougir un test.
- **Jamais « 12 mois »** : `spellAge` reprend la règle de `extension/src/format.js`, et une
  propriété balaie 0 à 4 000 jours.
- **Une ligne de périmètre honnête** en tête du marché : « Sur les annonces qu'adscope a
  vues — pas tout le marché. »

## Captures

`docs/site-v0-suivis.png` · `docs/site-v0-marche.png` · `docs/site-v0-connexion.png` ·
`docs/site-v0-mobile.png`. Mode démo, Chrome, ×2.

Regardées, corrigées, reprises : la ligne du véhicule séparait la marque du modèle
(« Renault · Clio ») ; la rangée de filtres débordait d'un pixel et le vendeur tombait à la
ligne ; la carte d'annonce laissait un vide en bas à gauche ; l'écran de connexion collait au
haut d'une page aux trois quarts vide ; la quatrième carte de suivi était coupée.

**Une capture ne passe pas par la commande de la consigne** : sur macOS, Chrome ramène toute
fenêtre à **500 px de large minimum**, `--window-size=390` compris — vérifié, `innerWidth`
rend 500. Le PNG obtenu n'était donc pas un rendu à 390, c'en était un à 500 rogné à 390, et
il montrait un faux débordement. `site-v0-mobile.png` est pris avec le même Chrome et le même
facteur ×2, piloté par Playwright à 390 px réels. Les trois autres sortent de la commande
telle quelle.

## Ce qui reste, et ce qui est en attente de l'API

- Le bouton **Suivre** est dans l'extension ; le site ne fait que lire le fil. L'état vide le
  dit.
- `GET /v1/families` sert le périmètre déclaré ; le champ famille accepte aussi la saisie
  libre, coupée en marque (premier mot) puis modèle (le reste).
- Le tri « ce qui a bougé d'abord » est celui que l'API rend : le site n'y touche pas. Le mode
  démo, lui, l'imite (disparition, puis baisse, puis seuil).

## Une maladresse à signaler

Pour arrêter mon propre `uvicorn` de test, j'ai lancé un `pkill -f "uvicorn adscope_api"`
trop large : il a pu emporter le service du port 8000, qui tournait déjà. Il est reparti dans
la seconde et tourne. Un `kill` par PID aurait suffi.
