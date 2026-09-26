# Adscope — runbook de crawl planifié

> **Bascule vers Render — 2026-09-26.** L'API est en ligne : `https://adscope-api.onrender.com`.
> Le Chrome qui crawle doit (1) avoir cette adresse comme adresse d'API dans le popup de
> l'extension (réglages), (2) porter la clé de `crawler/.license` dans ce même popup — c'est
> la clé robot, sans elle rien de ce que le lot Corpus journalise ne s'écrit —, ou à défaut une
> session ouverte sur `https://adscope-api.onrender.com/app`. `localhost:8000` ne sert plus
> qu'au développement ; aucune tâche planifiée ne doit plus y écrire.

> **Premier geste de tout run, avant tout `navigate` :** lire `crawler/logs/YYYY-MM.log`

But : faire visiter par Chrome (extension Adscope active) un maximum d'annonces,
en tournant sur une file de shards pour ne jamais taper deux fois la même zone.

## Périmètre

leboncoin (`shards.json`) et La Centrale (`shards-lacentrale.json`, file séparée).

## Contraintes mesurées (La Centrale, 2026-09-19)

- **24 annonces/page, plafond à 347 pages** (page 347 pleine, 348 vide) → ~8 300 par requête,
  ~16 600 en combinant `sortBy=priceAsc` puis `sortBy=priceDesc`. `shard_cap` = 16 000.
- Compteur : `"total":N` dans les `<script>` de la page (blob `__PRELOADED_STATE_LISTING__`,
  pas de `__NEXT_DATA__` exploitable). Cartes : clés `firstOnlineDate` (une par annonce).
- Filtres : `priceMin`, `priceMax` (bornes inclusives), `customerType=PART|PRO`.
  PART + PRO = total sans filtre (vérifié sur 2000-2100 : 335 + 11 = 346).
- Healthcheck : pastilles `[data-adscope]` (24/page, `data-adscope-src=network` = API jointe).
  Le sélecteur `[class*="adscope-"]` marche aussi (~72/page), mais **0 = extension pas chargée**
  sur ce site (constaté le 19/09 avant rechargement de l'extension).
- Pas de captcha sur ~40 pages chargées le 19/09.
- Ne pas renvoyer `location.search` depuis `javascript_tool` : la sortie est bloquée
  (Cookie/query string data). Renvoyer seulement les nombres.
- URL : `https://www.lacentrale.fr/listing?priceMin={min}&priceMax={max}&customerType={PART|PRO}&sortBy={priceAsc|priceDesc}&page={n}`
  (`price_max: null` → omettre `priceMax`). `N = min(347, ceil(total/24))`.

## Contraintes mesurées (leboncoin, 2026-09)

- Pagination plafonnée à **100 pages** (~35 annonces/page). `page=101` renvoie 0 résultat.
- Donc **~3 500 annonces max par requête**, ~7 000 en combinant `order=asc` puis `order=desc`.
- Le compteur exact est lisible sans scraper le DOM :
  ```js
  JSON.parse(document.getElementById('__NEXT_DATA__').textContent)
  // chercher "total", "total_pro", "total_private"
  ```
- `owner_type=private|pro` découpe une tranche en deux quasi à moitié : c'est le
  premier axe de split, avant de toucher aux bornes de prix.
- `browser_batch` : **max ~8 pages par appel**, au-delà l'extension timeout.
  Rythme : ~2 s d'attente + un `scrollTo(0,9e5)` par page.

## URL template

```
https://www.leboncoin.fr/recherche?category=2&price={min}-{max}&owner_type={owner}&sort=price&order={asc|desc}&page={n}
```
`price_max: null` → `max`.

## État

`crawler/shards.json` — `{version, page_cap, ads_per_page, shard_cap, shards[]}`
Chaque shard : `{id, site, category, price_min, price_max, owner_type, est_count,
pages_crawled, last_crawled, status}`.

## Exécution : session Claude planifiée, via l'extension Claude in Chrome

Le content script de l'extension est déclaré sur `https://www.leboncoin.fr/*` en
`document_idle` et pousse tout seul vers `https://adscope-api.onrender.com` (l'adresse d'API réglée dans le popup de l'extension — bascule Render du 2026-09-26) : **charger la page suffit**.
Une tâche planifiée horaire ouvre donc les pages dans le Chrome de l'utilisateur,
avec son profil et donc son extension.

Pourquoi pas un agent launchd pilotant Chrome en AppleScript : essayé, abandonné.
`set URL` via Apple Events ramène Chrome au premier plan à chaque navigation, ce qui
rend la machine inutilisable pendant un run. Les fichiers `run_crawl.py` et
`chrome.applescript` restent au dépôt à titre de référence mais ne sont pas branchés.
Une instance Chrome dédiée (`--user-data-dir` + `--load-extension` + headless, pilotée
en CDP) reste la meilleure option si on veut un jour se passer de Claude — elle
supprime le vol de focus par construction.

Ce que la voie planifiée implique : Chrome doit tourner avec l'extension Claude in
Chrome active et le domaine autorisé, et la machine doit être réveillée. Un run qui
tombe pendant que le Mac dort ne fait rien et ne casse rien : le shard garde son
`last_crawled` et repassera au tour suivant.

## Trois pièges vérifiés en production (2026-09-07)

### Le healthcheck de l'API par le contexte page est un faux négatif

Ne PAS tester l'API en faisant un `fetch` vers `127.0.0.1:8000` depuis une page
leboncoin : Chrome bloque toute requête https → adresse locale (Private Network
Access). L'appel échoue que l'API soit vivante ou morte. Trois runs ont été annulés
à tort le 2026-09-07 sur cette base.

**Le bon signal, c'est le badge.** Sur la page 1, compter
`document.querySelectorAll('[class*="adscope-"]').length`. Un compte normal (~85 par
page) prouve toute la chaîne d'un coup : extension active, API vivante, licence valide,
`/v1/listings/batch` qui répond. Zéro badge = collecte morte, on n'entame pas le crawl.
Ce test remplace le healthcheck API ; ne pas en ajouter d'autre.

### Plusieurs Chrome connectés au compte — le Mac est prioritaire

Si plusieurs Chrome sont connectés, `tabs_context_mcp` réclame une sélection. Depuis le
2026-09-24 ce choix est posé à l'avance par Alexis : **dès qu'un navigateur macOS figure
dans la liste, le run le sélectionne lui-même (`select_browser`) et continue.** Voir
« Plusieurs Chrome connectés au compte — règle du 2026-09-24 » en fin de fichier pour les
deux seuls cas d'arrêt (aucun macOS, ou plusieurs macOS) et pour l'historique.

### Un shard interrompu ne doit pas être marqué comme fait

Le budget de 25 min ne couvre pas un shard de ~200 pages : la plupart des runs
s'arrêtent en cours. Dans ce cas, **ne pas** poser `last_crawled` comme si le shard était
complet — les pages restantes ne seraient jamais reprises et le trou serait invisible.
Écrire à la place `resume: {order, page}` sur le shard, garder `status: ready`, et
reprendre à ce point au run suivant. `last_crawled` ne se pose qu'une fois les deux sens
terminés.

## Protocole d'un run (3 shards)

1. Lire `crawler/shards.json`.
2. Prendre les 3 shards `status=ready` les plus anciens (`last_crawled: null` en premier).
3. Pour chaque shard :
   1. Ouvrir la page 1 en `asc`, lire `total` dans `__NEXT_DATA__` → écrire `est_count`.
   2. Si `est_count > shard_cap` → **splitter la tranche de prix en deux** (milieu
      arrondi à la centaine ; si `price_max` est null, prendre `price_min * 2`),
      remplacer le shard par les deux moitiés dans `shards.json`, passer au suivant
      sans crawler.
   3. Sinon `N = min(100, ceil(est_count / 35))`, crawler `asc` pages 1..N puis
      `desc` pages 1..N, par lots de 8 pages.
   4. `last_crawled` = ISO now, `pages_crawled` += pages faites.
4. Réécrire `crawler/shards.json`, ajouter une ligne dans `crawler/logs/YYYY-MM.log` :
   `<iso>\t<shard_id>\t<pages>\t<est_count>\t<ok|split|error>`

## Arrêt / erreurs

- Si une page renvoie 0 annonce alors que `n <= N` → fin de shard, on n'insiste pas.
- Si Chrome n'est pas joignable (extension absente, permissions refusées) → logger
  `error`, ne rien modifier dans `shards.json`, s'arrêter.
- Ne jamais paralléliser : un seul onglet, séquentiel.
- **Healthcheck : le seul signal fiable est le compte de badges `[class*="adscope-"]`
  sur la page 1 du run.** Les badges viennent des signals renvoyés par `/v1/listings/batch` :
  s'il y en a (~85-90 par page de listing), toute la chaîne extension → API → licence est
  vivante. Zéro badge = collecte morte, ne pas crawler.
  Deux sondes à NE PAS utiliser, elles donnent des faux négatifs :
  - `fetch()` vers 127.0.0.1:8000 depuis le contexte page leboncoin : bloqué par Chrome
    (Private Network Access), échoue que l'API tourne ou non.
  - `GET /v1/me` ouvert à la main dans un navigateur : répond toujours
    `{"detail":"licence invalide"}` faute d'en-tête `Authorization`, API saine comprise.
- **Le healthcheck `curl 127.0.0.1:8000` depuis `device_bash` est cassé** : `device_bash`
  tourne dans une VM Linux isolée, son loopback n'est pas celui du Mac. Il renverra toujours
  « connection refused », API vivante ou non. Sonder depuis le contexte page de Chrome.

## Plusieurs Chrome connectés au compte — règle du 2026-09-24

Si plusieurs navigateurs Chrome sont connectés au compte Claude et qu'aucun n'est
sélectionné pour la session, `tabs_context_mcp` échoue et réclame une sélection.

**Décision d'Alexis, donnée en session interactive le 2026-09-24 : le Chrome du Mac est
prioritaire, toujours.** Dès qu'un navigateur macOS figure dans la liste rendue par
l'erreur (ou par `list_connected_browsers`), le run le sélectionne lui-même avec
`select_browser`, le journalise et continue. Ce n'est plus un choix à deviner en cours de
run : il est posé à l'avance, une fois pour toutes, par l'utilisateur.

Le Mac porteur de l'extension est `6aff4c55-9192-4e3c-9e42-784484b42b69`, mais c'est la
**plateforme macOS** qui décide, pas ce deviceId — il changera si le Mac est réappairé.
Le numéro affiché (« Browser 1 », « Browser 2 ») n'est jamais stable : ce Mac était
Browser 1 le 2026-09-07 à 15:32, Browser 2 à 17:33, Browser 2 le 2026-09-24.

On ne s'arrête plus que dans deux cas, tous deux journalisés sans rien ouvrir ni modifier :

| Liste rendue par l'outil | Conduite |
|---|---|
| Un seul macOS, seul ou avec d'autres plateformes | `select_browser` dessus, journaliser le deviceId retenu, continuer le run |
| Aucun macOS | rien ne dit lequel porte l'extension — journaliser `error: aucun Chrome macOS connecte`, s'arrêter |
| Plusieurs macOS | la priorité ne tranche plus — journaliser `error: plusieurs Chrome macOS connectes`, s'arrêter |

Historique : la sélection manuelle faite en cours de run ne persiste pas jusqu'au run
planifié suivant (mesuré le 2026-09-07 à 15:52 et 17:57), ce qui rendait le blocage
récurrent. Entre le 2026-09-24 06:54 et 13:32, six runs planifiés consécutifs
(balayage+revisites, crawl leboncoin, crawl La Centrale) se sont arrêtés là, soit environ
6 h 30 sans une seule page collectée — d'où cette règle.

Correctif complémentaire, facultatif : déconnecter les Chrome Windows du compte. La règle
ci-dessus rend le run robuste sans lui.
