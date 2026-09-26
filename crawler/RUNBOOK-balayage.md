# Adscope — runbook de balayage par recherche (lot F2)

> **Bascule vers Render — 2026-09-26.** L'API est en ligne : `https://adscope-api.onrender.com`.
> Le Chrome qui crawle doit (1) avoir cette adresse comme adresse d'API dans le popup de
> l'extension (réglages), (2) porter la clé de `crawler/.license` dans ce même popup — c'est
> la clé robot, sans elle rien de ce que le lot Corpus journalise ne s'écrit —, ou à défaut une
> session ouverte sur `https://adscope-api.onrender.com/app`. `localhost:8000` ne sert plus
> qu'au développement ; aucune tâche planifiée ne doit plus y écrire.

> **Premier geste de tout run, avant tout `navigate` :** lire `crawler/logs/YYYY-MM.log`

But : revoir chaque jour les annonces des recherches enregistrées par les marchands,
plutôt que d'attendre le passage au hasard du crawl exhaustif (`RUNBOOK.md`, une
annonce revue tous les 10 à 20 jours). Les alertes de baisse (lot F1) ne valent que
si l'annonce a été vue depuis moins de 24 h : ce balayage-là fait cette fraîcheur.
La revisite fiche par fiche (`RUNBOOK-revisites.md`) reste pour les disparitions —
ce runbook n'en fait jamais.

## La règle, une seule

**Cette session ouvre des URL. Elle ne conclut rien.**

C'est l'extension qui poste ce qu'une page dit, l'API qui calcule la couverture sur
ce qu'elle a reçu. Cette session ne compare `total` et `expected_total` que pour le
journal — jamais pour décider de continuer, sauter ou s'arrêter sur une recherche.

## Périmètre

**leboncoin uniquement**, comme le crawl exhaustif. La Centrale (DataDome) n'entre
pas dans `/v1/sweep` : la route ne rend que des URL leboncoin.

Une recherche sans marque **et** modèle, ou en texte libre (`q`), n'est pas balayée
— trop large pour être traduite en une seule page de résultats. Elle n'apparaît
jamais dans la file ; c'est normal, pas une erreur.

## Traduction, non vérifiée

L'URL de chaque recherche (`sweep_url.translate`, côté API) est écrite sur pièce,
**jamais vérifiée par une visite** avant ce runbook. Sept de ses douze paramètres
sont des suppositions (voir `.superpowers/balayage-f2-api.md` pour le détail).
**C'est ce premier run qui fait la vérification réelle** : comparer, pour chaque
recherche, le `total` lu dans `__NEXT_DATA__` de sa page 1 à l'`expected_total`
que la file donne, et le consigner. Un écart énorme et systématique (le compte
attendu ne ressemble à rien) signe un paramètre faux — `u_car_model` d'abord,
premier suspect du rapport API. Alexis lira le journal pour trancher, pas cette
session.

## Le navigateur — règle du 2026-09-24

Si `tabs_context_mcp` réclame un choix entre plusieurs Chrome connectés, **le Mac est
prioritaire, toujours** : dès qu'un navigateur macOS figure dans la liste, le run le
sélectionne lui-même avec `select_browser`, le journalise et continue — le choix a été
posé à l'avance par Alexis, il n'y a plus rien à deviner. On ne s'arrête que si la liste
ne contient **aucun** macOS, ou en contient **plusieurs**. Détail et historique : section
« Plusieurs Chrome connectés au compte — règle du 2026-09-24 » de `RUNBOOK.md`.

## Le témoin

Comme le crawl exhaustif (`RUNBOOK.md`) : sur une page de résultats, l'absence de
tout badge `[class*="adscope-"]` signe une collecte morte, jamais un marché vide.
La première page ouverte de la file sert de témoin — compter les badges avant de
poursuivre. Zéro badge = ne pas entamer le run, journaliser `error: aucun badge`,
s'arrêter.

## La file

**Prérequis, une fois pour toutes — à la main, par Alexis :** une session déjà
connectée sur `https://adscope-api.onrender.com/app` (le prérequis de `RUNBOOK-revisites.md`).
Le même cookie porte les deux pages.

La file se demande sur `/app/balayage.html`, jamais par `curl` — même raison que
la revisite : la clé ne se lit, ne se recopie ni ne se construit jamais ici, le
navigateur la porte seule.

1. `navigate` vers `https://adscope-api.onrender.com/app/balayage.html` (`?pages=` pour un
   budget différent des 120 pages par défaut — inutile pour un run normal).
2. Cliquer **« Demander la file »**. `GET`, rien n'est consommé : contrairement à
   la revisite, recharger la page et redemander la file ne coûte rien — la
   couverture affichée vient des données, pas d'un bail posé par le clic.
3. Lire `#count` : le nombre de recherches à balayer. `0` est une réponse
   normale (tout est déjà couvert depuis moins de 24 h) — journaliser
   `skip: file vide` et s'arrêter.
4. Lire les `a[href]` de `#queue`, dans l'ordre rendu (couverture la plus basse
   d'abord). Chaque `<a>` porte deux attributs à lire, jamais à recalculer :
   `data-pages` (le nombre de pages à ouvrir pour cette recherche, `page=1..N`)
   et `data-expected-total` (le compte à comparer au `total` de la page 1). Même
   parade qu'au 2026-09-12 de `RUNBOOK-revisites.md` si la sortie de l'outil est
   limitée : stocker la réponse dans la page plutôt que la faire transiter par
   le résultat de l'outil.

## Le run

Pour chaque recherche de la file, dans l'ordre :

1. `navigate` vers l'URL rendue (`page=1`), telle quelle — ne pas la reconstruire.
2. Attendre la fin du chargement, puis ~2 s, puis `scrollTo(0, 9e5)` — même rythme
   que `RUNBOOK.md`. Lire `total` dans `__NEXT_DATA__`
   (`JSON.parse(document.getElementById('__NEXT_DATA__').textContent)`, chercher
   `total`/`total_pro`/`total_private`).
3. **Calculer `N`** — changé le 2026-09-23 après les deux premiers runs (669 lues
   contre 101 puis 187 attendues) : `data-pages` est calculé sur ce que notre base
   connaît, toujours moins que le site sur une recherche neuve. `N` = le plus grand
   de `data-pages` et de `ceil(total / 35)` (`total` lu à l'étape 2), **plafonné à
   20**. Si `__NEXT_DATA__` manque, `N` = `data-pages`. Ouvrir les pages suivantes,
   `page=2..N`, en remplaçant le seul paramètre `page` de l'URL lue — jamais de
   page 21. Même rythme, ~2 s + scroll par page. **Lots de 8 pages maximum**
   par appel de l'outil de navigation par lot (`browser_batch`, timeout au-delà —
   contrainte de `RUNBOOK.md`), une recherche de 14 pages se découpe donc en deux
   lots.
4. Une ligne au journal pour cette recherche (format ci-dessous), puis passer à
   la suivante.

**Ne rien lire de plus que `__NEXT_DATA__`, ne jamais ouvrir la popup, ne jamais
juger une annonce individuelle.**

## Le budget attendu

`pages=120` (défaut) se traduit, au rythme de ~2,5 s par page tout compris, en
moins de dix minutes de navigation pure — bien en dessous des 20 minutes de
`RUNBOOK-revisites.md`. Compter large : 15 minutes par run, changement de
recherche inclus. Si le budget tombe en cours de recherche, finir d'ouvrir les
pages de `N` pour celle en cours, journaliser
`partial: budget epuise apres N recherches`, ne pas redemander la file.

## Arrêt propre

Une fois la file entièrement ouverte : s'arrêter, ne pas redemander tout de
suite. Puisque rien n'est consommé, une file redemandée trop tôt rendrait
la même chose (rien n'a eu le temps de changer côté couverture) — un second
appel n'a de sens qu'au run suivant.

## Journal

Même fichier que le crawl et la revisite : `crawler/logs/YYYY-MM.log`, TSV, une
ligne par recherche : `horodatage \t url page 1 \t pages ouvertes \t total
attendu \t total lu \t statut`. `statut` vaut `ok` (écart ≤ 20 % — seuil de
calibration, premier chiffre posé faute de mesure antérieure, à revoir après ce
premier run), `ecart: <lu> vs <attendu>` au-delà, ou `erreur: <motif>` si la page
n'a pas chargé ou si `__NEXT_DATA__` est absent.

```
2026-09-23T07:02:11+00:00	https://www.leboncoin.fr/recherche?category=2&price=0-max&sort=price&order=asc&page=1&u_car_brand=RENAULT&u_car_model=RENAULT_Clio	6	187	203	ok
2026-09-23T07:04:40+00:00	https://www.leboncoin.fr/recherche?category=2&price=0-max&sort=price&order=asc&page=1&u_car_brand=PEUGEOT&u_car_model=PEUGEOT_208	4	120	11	ecart: 11 vs 120
2026-09-23T07:05:02+00:00	https://www.leboncoin.fr/recherche?category=2&price=0-max&sort=price&order=asc&page=1&u_car_brand=DACIA&u_car_model=DACIA_Duster	3	96	91	ok
```

## Ce qui casse, et quoi en faire

| Symptôme | Conduite |
|---|---|
| La page dit « L'API n'a pas répondu » | journaliser `error: API injoignable`, ne rien ouvrir |
| La page dit « Connectez-vous d'abord sur /app » | la session gardée par le navigateur est absente ou révoquée — se reconnecter sur `/app` à la main (le prérequis, ci-dessus), journaliser, s'arrêter |
| Aucun badge sur le témoin | extension absente du profil — journaliser `error: aucun badge`, s'arrêter |
| Plusieurs Chrome connectés au compte | **un macOS dans la liste → le sélectionner (`select_browser`) et continuer** (règle du 2026-09-24, voir `RUNBOOK.md`). Aucun macOS, ou plusieurs : journaliser, s'arrêter |
| Une URL ne charge pas | la passer, journaliser `erreur: page illisible` sur sa ligne, continuer |
| `__NEXT_DATA__` absent sur une page qui a chargé | gabarit refondu ou mur anti-bot — journaliser `erreur: pas de __NEXT_DATA__`, continuer sur la recherche suivante |
| Écart énorme et systématique sur toutes les recherches | probablement `u_car_model` ou un autre paramètre faux, pas un site qui a changé — journaliser en détail, ne pas essayer de corriger l'URL à la main, laisser Alexis trancher |

Dans tous les cas d'incident, ne pas relancer la file avant le run suivant : la
couverture se mesure sur ce qui a réellement été ouvert, une reprise immédiate
ne changerait rien tant que rien n'a eu le temps d'être vu.

## Ce qu'il ne faut pas faire

- Conclure qu'une annonce a baissé, disparu ou quoi que ce soit d'autre. Ce
  n'est pas le rôle de cette session — voir `RUNBOOK-revisites.md`.
- Corriger l'URL d'une recherche à la main parce qu'un paramètre semble faux.
  Journaliser l'écart, laisser la traduction (`sweep_url.py`) se corriger côté
  API.
- Toucher à `shards.json` ou `shards-lacentrale.json` : ce sont ceux du crawl
  exhaustif.
- Ajouter La Centrale.
- Lire, recopier ou construire une clé de licence.

## Enchaînement avec la revisite — décidé par Alexis le 2026-09-22

Le balayage et la revisite (`RUNBOOK-revisites.md`) tournent désormais dans **une
seule tâche planifiée**, balayage d'abord, revisite avec le budget restant.

**Le témoin du balayage fait foi pour les deux phases.** Il est pris sur des pages
de résultats, où l'absence de badge signe vraiment une collecte morte. Conséquences,
dans cet ordre :

- Témoin du balayage **négatif** (aucun badge `[class*="adscope-"]` sur la première
  page de la file) : extension absente du profil — journaliser `error: aucun badge`,
  **ne pas entamer la phase de revisite non plus**, ne demander aucune tranche.
- Témoin du balayage **positif** : l'extension est prouvée vivante pour tout le run.
  Le contrôle des cinq premières fiches d'une tranche de revisite garde sa valeur
  d'observation mais **n'arrête plus le run** : zéro panneau sur cinq fiches ne
  prouve rien, la file de revisite servant en tête les annonces pro anciennes,
  c'est-à-dire celles qui ont le plus de chances d'être déjà des pages
  « Annonce introuvable ». On le journalise et on continue d'ouvrir la tranche.

Motif : entre le 2026-09-20 et le 2026-09-22, quatre runs se sont arrêtés sur ce
contrôle alors que l'extension fonctionnait — la tranche de 100 était déjà
consommée à chaque fois, soit environ 380 fiches gelées sept jours pour rien
(lignes du 09-20 19:35, 09-21 18:38, 09-22 01:33 et 04:33). Le run du 09-22 19:59
a fait l'inverse sur la foi d'un témoin vivant pris avant la tranche, et a ouvert
200 fiches sans incident.

Cette règle ne change rien au reste de `RUNBOOK-revisites.md`, qui reste la
référence pour la phase de revisite : budget par tranche, un clic par tranche,
tout ouvrir avant d'en redemander une.

## Cadence

Tôt le matin, **avant** l'envoi de l'email (lot F1, prévu à 7 h au go-live) : la
couverture d'aujourd'hui doit être fraîche avant que l'email s'appuie dessus. Depuis
le 2026-09-22, une seule tâche planifiée enchaîne balayage puis revisites (voir
« Enchaînement avec la revisite » ci-dessus) — les revisites n'ayant pas de
contrainte d'horaire, elles prennent simplement le budget qui reste.

## Le prompt de la tâche cowork

Prompt de la tâche planifiée unique (balayage puis revisites). Premier run de
balayage vérifié à la main le 2026-09-22 (une recherche, 4 pages, écart 669 vs 101
consigné au journal).

```
Adscope, projet d'Alexis. Run planifié non surveillé : ne poser aucune question,
personne ne répondra.

Dossier connecté : /Users/alexis/Documents/Projets/adscope, accessible via
mcp__remote-devices__device_bash sous $HOME/mnt/adscope.

RÈGLE ABSOLUE : cette session ouvre des URL, elle ne conclut rien. Ne jamais écrire
ni journaliser qu'une annonce est supprimée, ou qu'elle a baissé. C'est l'extension
qui constate ce que le site dit, et l'API qui décide de ce qui s'écrit. Rapporter ce
qui a été ouvert, c'est tout.

BUDGET : 30 minutes au total. Relever l'heure de départ au premier geste (device_bash
: date -u) et s'y tenir. Phase 1 plafonnée à 15 minutes ; tout le reste va à la
phase 2.

1. AVANT tout navigate : lire crawler/RUNBOOK-balayage.md, crawler/RUNBOOK-revisites.md
   et le journal du mois courant crawler/logs/AAAA-MM.log. Les runbooks font foi en cas
   de divergence avec ce prompt.

2. Charger les outils Chrome en UN seul appel ToolSearch :
   "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__browser_batch,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__tabs_close_mcp"
   Puis tabs_context_mcp createIfEmpty:true et retenir le tabId — les appels suivants le
   passent explicitement. Si Chrome est injoignable, ou si l'outil exige un choix entre
   plusieurs navigateurs connectés (ce choix est humain, il ne se devine pas) :
   journaliser l'erreur et s'arrêter sans rien ouvrir.

PHASE 1 — BALAYAGE (crawler/RUNBOOK-balayage.md)

3. navigate vers https://adscope-api.onrender.com/app/balayage.html, cliquer UNE fois
   « Demander la file ». C'est un GET : rien n'est consommé, contrairement à la revisite.
   - « Connectez-vous d'abord sur /app » ou « L'API n'a pas répondu » : journaliser,
     s'arrêter — les deux phases.
   - #count à 0 : journaliser "skip: file vide" pour le balayage et passer à la phase 2.

4. Lire les a de #queue dans l'ordre rendu, avec leurs attributs data-pages et
   data-expected-total (à lire, jamais à recalculer). ATTENTION, constaté le 2026-09-22 :
   la page n'expose les recherches que sous forme d'URL à query string, que l'outil
   refuse de faire transiter en sortie (blocage "Cookie/query string data"). Parade :
   piloter la navigation depuis la page elle-même (location.href = le href lu), puis
   relire l'URL dans le contexte d'onglet que l'outil rend de lui-même pour pouvoir la
   journaliser ; pour les pages suivantes, remplacer le seul paramètre page. Ne jamais
   reconstruire une URL à la main, et ne jamais encoder ou obscurcir une URL pour
   contourner ce blocage.

5. TÉMOIN, sur la première page de résultats ouverte : compter les
   [class*="adscope-"]. Zéro badge → journaliser "error: aucun badge", s'arrêter, ne PAS
   entamer la phase 2. Témoin positif → il vaut pour tout le run, phase 2 comprise.

6. Pour chaque recherche, dans l'ordre : ouvrir page=1, lire total dans __NEXT_DATA__,
   puis N = max(data-pages, ceil(total / 35)) plafonné à 20 (data-pages seul si
   __NEXT_DATA__ manque) ; ouvrir page=2..N, ~2 s d'attente puis
   window.scrollTo(0,9e5) par page, lots de 8 pages maximum par browser_batch. Une ligne TSV par
   recherche dans crawler/logs/AAAA-MM.log :
   <horodatage ISO>\t<url page 1>\t<pages ouvertes>\t<total attendu>\t<total lu>\t<statut>
   statut = "ok" si l'écart est ≤ 20 %, sinon "ecart: <lu> vs <attendu>", ou
   "erreur: <motif>" si la page n'a pas chargé ou si __NEXT_DATA__ manque.

7. File entièrement ouverte, ou 15 minutes atteintes : ne pas redemander la file,
   passer à la phase 2.

PHASE 2 — REVISITES (crawler/RUNBOOK-revisites.md)

8. Boucle de tranches, jusqu'à file vide, budget insuffisant ou incident :
   a. limit = min(100, (secondes restantes - 90 de marge) / 8). Si limit < 10 :
      arrêter, ne demander aucune tranche.
   b. navigate pleine page vers https://adscope-api.onrender.com/app/revisites.html?limit=<limit>,
      puis cliquer UNE SEULE fois « Demander la file ». Si la page restitue la tranche
      précédente depuis sessionStorage et n'offre plus que « Oublier cette file »,
      cliquer d'abord dessus : cela ne consomme rien.
   c. lire #count, puis les href des a de #queue PAR TRANCHES DE 20 : stocker
      window.__u = [...document.querySelectorAll('#queue a')].map(a=>a.href), puis
      ressortir __u.slice(0,20).join('\n'), __u.slice(20,40).join('\n'), etc. La sortie
      de l'outil tronque au-delà, et une URL perdue est une fiche consommée pour rien.
   d. #count à 0 : première tranche → "skip: file vide" ; tranche suivante →
      "ok: file epuisee apres N". Arrêter.
   e. ouvrir TOUTES les URL d'une tranche avant d'en demander une autre. Servir une
      fiche la consomme sept jours, ouverte ou non. Ne jamais redemander après une erreur.

9. Healthcheck de tranche : ouvrir les cinq premières fiches une par une et compter les
   [data-adscope-detail] / [class*="adscope-panel"]. Zéro panneau n'arrête PLUS le run
   quand le témoin du balayage était positif — règle du 2026-09-22, section
   « Enchaînement avec la revisite » de crawler/RUNBOOK-balayage.md : sur une revisite,
   une fiche sans panneau peut être légitimement supprimée, et la file sert en tête les
   annonces les plus susceptibles d'avoir disparu. Journaliser le constat et continuer.

10. Ouvrir chaque URL dans l'ordre, telle quelle : navigate pleine page (une navigation
    interne au site ne rend pas le DOM serveur), attendre la fin du chargement puis ~2 s.
    Ne rien lire, ne rien juger, ne pas ouvrir la popup, ne pas reconstruire l'URL, ne pas
    ajouter de paramètre. browser_batch par lots de 6 pages. Une URL qui ne charge pas :
    la passer, la noter, continuer.

11. Une ligne TSV en fin de phase :
    <horodatage ISO>\trevisites\t<ouvertes>\t<servies>\t<message>
    <ouvertes> et <servies> sont les CUMULS du run, toutes tranches confondues. Message :
    "ok", "ok: file epuisee apres N", "skip: ...", "partial: ..." ou "error: ...".

12. Fermer les onglets créés. Répondre en 3 lignes maximum : balayage (recherches et
    pages ouvertes), revisites (ouvertes / servies), incidents éventuels.

Interdits :
- conclure qu'une annonce est supprimée ou qu'elle a baissé ;
- écrire quoi que ce soit en base, la seule écriture passe par l'extension ;
- toucher à crawler/shards.json ou crawler/shards-lacentrale.json, ils appartiennent au
  crawl exhaustif ;
- ajouter La Centrale ;
- lire, recopier ou construire une clé de licence ;
- corriger à la main l'URL d'une recherche dont un paramètre semble faux : journaliser
  l'écart et laisser Alexis trancher ;
- demander une tranche de revisite avant d'avoir entièrement ouvert la précédente.
```
