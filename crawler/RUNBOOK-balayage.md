# Adscope — runbook de balayage par recherche (lot F2)

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

## Le témoin

Comme le crawl exhaustif (`RUNBOOK.md`) : sur une page de résultats, l'absence de
tout badge `[class*="adscope-"]` signe une collecte morte, jamais un marché vide.
La première page ouverte de la file sert de témoin — compter les badges avant de
poursuivre. Zéro badge = ne pas entamer le run, journaliser `error: aucun badge`,
s'arrêter.

## La file

**Prérequis, une fois pour toutes — à la main, par Alexis :** une session déjà
connectée sur `http://localhost:8000/app` (le prérequis de `RUNBOOK-revisites.md`).
Le même cookie porte les deux pages.

La file se demande sur `/app/balayage.html`, jamais par `curl` — même raison que
la revisite : la clé ne se lit, ne se recopie ni ne se construit jamais ici, le
navigateur la porte seule.

1. `navigate` vers `http://localhost:8000/app/balayage.html` (`?pages=` pour un
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
3. Ouvrir les pages suivantes, `page=2..N` (`N` = `data-pages`), en remplaçant le
   seul paramètre `page` de l'URL lue — jamais de page 101, la file la plafonne
   déjà à 20. Même rythme, ~2 s + scroll par page. **Lots de 8 pages maximum**
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
pages déjà annoncées par `data-pages` pour celle en cours, journaliser
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
| Plusieurs Chrome connectés au compte | un seul doit l'être — voir « Un seul Chrome doit être connecté » de `RUNBOOK.md`, journaliser, s'arrêter |
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

## Cadence

Tôt le matin, **avant** l'envoi de l'email (lot F1, prévu à 7 h au go-live) : la
couverture d'aujourd'hui doit être fraîche avant que l'email s'appuie dessus. Les
revisites (`RUNBOOK-revisites.md`) passent après, elles n'ont pas cette contrainte
d'horaire.

## Le prompt de la tâche cowork

À coller par Alexis dans sa tâche planifiée, une fois le premier run vérifié à la
main :

```
Lis crawler/RUNBOOK-balayage.md en entier et suis-le. Ouvre
http://localhost:8000/app/balayage.html, clique « Demander la file », vérifie
le témoin (badges adscope sur la première page), puis ouvre chaque recherche de
la file page par page (page=1..N, ~2 s et un scroll par page, lots de 8 pages
maximum). Consigne une ligne par recherche dans crawler/logs/YYYY-MM.log au
format du runbook, avec le total lu dans __NEXT_DATA__ comparé au total
attendu. Ouvre des URL, ne conclus rien d'autre.
```
