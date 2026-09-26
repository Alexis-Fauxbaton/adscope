# Adscope — runbook de revisite

> **Bascule vers Render — 2026-09-26.** L'API est en ligne : `https://adscope-api.onrender.com`.
> Le Chrome qui crawle doit (1) avoir cette adresse comme adresse d'API dans le popup de
> l'extension (réglages), (2) porter la clé de `crawler/.license` dans ce même popup — c'est
> la clé robot, sans elle rien de ce que le lot Corpus journalise ne s'écrit —, ou à défaut une
> session ouverte sur `https://adscope-api.onrender.com/app`. `localhost:8000` ne sert plus
> qu'au développement ; aucune tâche planifiée ne doit plus y écrire.

> **Ce qui a changé — 2026-09-19 (2) :** la file se demande désormais **plusieurs fois par
> run**, en boucle, jusqu'à ce qu'elle revienne vide ou que le budget soit épuisé. Budget
> porté à 20 minutes. La règle d'origine (« un seul clic par run ») protégeait contre le
> gaspillage — une fiche servie est consommée sept jours, ouverte ou non ; elle est
> remplacée par une règle qui protège la même chose plus finement : **ne jamais demander
> une tranche qu'on n'aura pas le temps d'ouvrir**. Motif : à 40 fiches toutes les 3 h, un
> seul passage sur les ~46 500 annonces demandait environ 145 jours, et le lot E attendait
> d'autant. Demandé par Alexis en session interactive le 2026-09-19.

> **Ce qui a changé — 2026-09-18 :** quatre runs de suite à zéro fiche ouverte. Le
> classifieur de sécurité de la session refusait de lire `crawler/.license` et de le
> recopier dans un en-tête `Authorization` (« Credential Materialization ») — c'est la
> lecture de la clé elle-même qu'il bloque, même pour la reposer telle quelle dans un
> en-tête. La file ne se demande donc plus par `curl` avec une clé recopiée à la main :
> cette session pilote `/app/revisites.html` au clic, et c'est le navigateur — connecté une
> fois pour toutes par Alexis — qui porte la licence de bout en bout. Cette session ne lit,
> ne recopie ni ne construit plus jamais de clé.

> **Premier geste de tout run, avant tout `navigate` :** lire `crawler/logs/YYYY-MM.log`

But : rouvrir des fiches déjà connues pour que l'extension constate si elles existent
encore. Complémentaire du crawl de résultats, qui ne repasse jamais sur les anciennes.

## La règle, une seule

**Cette session ouvre des URL. Elle ne conclut rien.**

C'est l'extension qui constate ce que le site dit, et l'API qui décide si une disparition
s'écrit — après deux constatations concordantes à six heures d'écart, et sous un garde-fou
de flotte. Une fiche illisible, un mur anti-bot, un gabarit refondu ne produisent rien.

Ne jamais rapporter « cette annonce est supprimée » dans le journal. Rapporter combien de
fiches ont été ouvertes, c'est tout.

## Périmètre

**leboncoin uniquement.** La Centrale ne déclare aucune signature d'absence et n'entre pas
dans la file : la route ne rendra rien pour elle. Ne pas essayer de l'ajouter.

## Le navigateur — règle du 2026-09-24

Si `tabs_context_mcp` réclame un choix entre plusieurs Chrome connectés, **le Mac est
prioritaire, toujours** : dès qu'un navigateur macOS figure dans la liste, le run le
sélectionne lui-même avec `select_browser`, le journalise et continue. On ne s'arrête que
si la liste ne contient **aucun** macOS, ou en contient **plusieurs** — et dans ce cas
aucune tranche n'est demandée, donc aucune fiche consommée. Détail et historique :
section « Plusieurs Chrome connectés au compte — règle du 2026-09-24 » de `RUNBOOK.md`.

## Le healthcheck est différent de celui du crawl

Sur une page de résultats, zéro badge `[class*="adscope-"]` = collecte morte. **Ce test ne
vaut rien sur une revisite** : une fiche réellement supprimée n'a légitimement aucun badge.
Le confondre ferait passer une extension éteinte pour un site plein d'annonces disparues.

Donc : ouvrir d'abord **une fiche témoin vivante**, vérifier qu'elle porte un
`[data-adscope-detail]` ou un `[class*="adscope-panel"]`, et seulement ensuite entamer les
revisites. Zéro badge sur le témoin = ne pas entamer le run, journaliser et s'arrêter.

Le témoin se prend dans la file elle-même : la première URL rendue fait l'affaire, on
regarde juste si *au moins une* des cinq premières porte un panneau. Cinq fiches mortes
d'affilée sont improbables ; cinq fiches sans panneau signent une extension absente.

## La file

> **Sonde `/v1/me` — piège vérifié le 2026-09-08 :** un `navigate` simple vers
> `http://127.0.0.1:8000/v1/me` n'envoie aucun en-tête `Authorization` et répond donc
> `{"detail":"licence invalide"}` **même quand la licence est parfaitement valide**.
> Ne jamais conclure « licence révoquée » sur cette réponse. Le vrai test est un `fetch`
> depuis l'origine http locale avec `Authorization: Bearer <clé>` : `200 {"label":"crawler"}`
> = API vivante + licence valide.

> **Sortie tronquée — constaté le 2026-09-12 :** la réponse de `/v1/revisits` passée telle
> quelle dans le résultat d'un `javascript_tool` dépasse la limite de sortie de l'outil et
> est coupée en plein tableau (run du 07:28 : 9 entrées lisibles sur 40). Les entrées
> perdues sont **déjà servies** et ne reviendront pas avant sept jours ; rien ne permet de
> les relire (aucune route de relecture, la base Postgres du Mac est hors de portée de
> `device_bash`), et redemander la file en consommerait 40 de plus — donc on ne redemande
> pas. Parade : stocker la réponse dans la page (`window.__q = await fetch(...)`) et ne
> ressortir que du compact, par tranches — p. ex. `__q.map(x=>x.site_id).slice(0,20).join(',')`
> puis `.slice(20)`. Ouvrir ensuite chaque URL reconstruite depuis son `site_id` seulement
> si le gabarit est bien celui rendu par la file.

> **Un seul hôte — corrigé le 2026-09-18 :** ce runbook pointait vers `127.0.0.1:8000`
> alors que l'extension appelle toujours `https://adscope-api.onrender.com` (`extension/src/sw.js`,
> `DEFAULTS.apiBase`) et que le lot Comptes a fait passer la connexion humaine sur un
> cookie de session. Pour un cookie ce sont deux hôtes distincts : une session ouverte sur
> l'un n'existe pas sur l'autre — se connecter sur `127.0.0.1:8000/app` aurait posé une
> session que l'extension, servie sur `https://adscope-api.onrender.com`, n'aurait jamais vue. Toutes les URL
> de ce runbook portent donc `https://adscope-api.onrender.com` (bascule Render du 2026-09-26 ; avant, `localhost:8000`), y compris pour ouvrir la file de revisite.

**Prérequis, une fois pour toutes — à la main, par Alexis :** se connecter une fois, à la
main, par email, sur `https://adscope-api.onrender.com/app` — donner l'adresse, cliquer le lien reçu,
comme n'importe quel marchand. Le navigateur garde ensuite la session par cookie ; cette
session ne la lit jamais, ne la recopie jamais, ne la voit jamais.

La file se demande sur `/app/revisites.html`, jamais par `curl` :

1. `navigate` vers `https://adscope-api.onrender.com/app/revisites.html`.
2. Cliquer **« Demander la file »**. Un clic par tranche : le clic consomme les fiches
   servies pour sept jours, ouvertes ou non. Recliquer n'est légitime qu'une fois la
   tranche précédente **entièrement ouverte**, et s'il reste de quoi ouvrir la suivante
   (cf. « La boucle » ci-dessous).
3. Lire `#count` : le nombre de fiches servies, au plus `limit` (`?limit=` dans l'URL de la
   page, 40 par défaut, jusqu'à 100 — jamais un corps de requête à construire à la main).
   La taille de chaque tranche se calcule sur le budget restant, jamais en aveugle :
   `limit = min(100, (secondes restantes - 90 de marge) / 8)`, 8 s par fiche étant le
   rythme mesuré de bout en bout (run du 2026-09-19 : 40 fiches en 370 s, tout compris).
   Si ce calcul rend moins de 10, ne pas demander de tranche : le run s'arrête là.
4. Lire les `href` des `a` de `#queue`, par tranches si la sortie de l'outil est limitée —
   même parade qu'au 2026-09-12 ci-dessus, mais sans `fetch` à rejouer : la file reste
   affichée à l'écran tant que la page n'est pas rechargée, elle se relit sans rien
   consommer de plus (`document.querySelectorAll('#queue a')`, ou un rechargement de la
   page : la file revient telle quelle depuis `sessionStorage`).

Priorisation déjà faite côté API : annonces pro anciennes d'abord — elles n'expirent pas,
donc leur disparition est un retrait et non une échéance administrative.

Servir une fiche la marque : elle ne reviendra pas dans la file avant sept jours, même si
elle n'est pas ouverte. D'où la seule règle qui compte ici : **ne jamais demander une
tranche qu'on n'aura pas le temps d'ouvrir**, et ouvrir tout ce qu'une tranche rend avant
d'en demander une autre. Une tranche demandée puis abandonnée est perdue pour une semaine.

`#count` à `0` (file vide) est une réponse normale : rien n'a atteint les trois jours de
silence exigés. Le crawl de résultats vient de tout revoir. Sur la **première** tranche,
journaliser `skip: file vide` et s'arrêter ; sur une tranche suivante, c'est la fin normale
de la boucle — journaliser `ok: file epuisee apres N`.

## Le run

Pour chaque URL rendue, dans l'ordre :

1. `navigate` vers l'URL, telle quelle — ne pas la reconstruire, ne pas ajouter de
   paramètre, ne pas suivre de redirection à la main.
2. Attendre la fin du chargement, puis ~2 s. La navigation doit être **pleine page** : une
   navigation interne au site ne rend pas le DOM serveur, et la constatation passe par lui.
3. Passer à la suivante. **Ne rien lire, ne rien juger, ne pas ouvrir la popup.**

Rythme : le même que le crawl, ~2 s d'attente par page. 40 fiches ≈ 3 à 4 minutes.

## La boucle

Un run enchaîne des tranches jusqu'à l'une de ces trois fins :

1. la file revient vide (`#count` à `0`) — tout ce qui était éligible a été servi ;
2. le budget restant ne permet plus d'ouvrir une tranche d'au moins 10 fiches ;
3. un incident de la table « Ce qui casse » — et alors on s'arrête sans redemander.

Entre deux tranches : revenir sur `/app/revisites.html?limit=<calculé>` par un `navigate`
pleine page (la page repart propre), cliquer une fois, ouvrir tout. Les compteurs
`ouvertes` et `servies` du journal sont les **cumuls** du run, toutes tranches confondues.

## Cadence

Une fois par heure convient, en même temps ou juste après le crawl de résultats. Budget
20 minutes par run, tranches dimensionnées sur le budget restant (cf. « La file », point 3).

**Attention aux runs isolés.** Le garde-fou de flotte de l'API ne se déclenche qu'au-delà de
30 revisites abouties sur 24 heures. Une session qui tourne une fois puis s'arrête plusieurs
jours passe sous ce seuil : les écritures se font alors sans filet de flotte, avec pour
seule protection la double constatation. Si le run reprend après une interruption longue,
enchaîner deux ou trois runs rapprochés plutôt qu'un seul.

## Journal

Même fichier et même format que le crawl : `crawler/logs/YYYY-MM.log`, TSV,
`horodatage \t identifiant \t ouvertes \t servies \t message`. L'identifiant vaut
`revisites`.

```
2026-09-08T20:00:00+00:00	revisites	40	40	ok
2026-09-08T21:00:00+00:00	revisites	0	0	skip: file vide
2026-09-08T22:00:00+00:00	revisites	12	40	partial: budget epuise apres 12
2026-09-19T10:36:00+00:00	revisites	140	140	ok: file epuisee apres 140 (4 tranches)
```

## Ce qui casse, et quoi en faire

| Symptôme | Conduite |
|---|---|
| La page dit « L'API n'a pas répondu » | journaliser `error: API injoignable`, ne rien ouvrir |
| La page dit « Connectez-vous d'abord sur /app », ou « Licence refusée » après le clic | la licence gardée par le navigateur est absente, invalide ou révoquée — se reconnecter sur `/app` à la main (le prérequis, ci-dessus), journaliser, s'arrêter |
| Aucun panneau sur les cinq premières | extension absente du profil — journaliser, s'arrêter |
| Chrome non connecté au compte | journaliser, s'arrêter, ne pas réessayer en boucle |
| Plusieurs Chrome connectés, aucun sélectionné | **un macOS dans la liste → le sélectionner (`select_browser`) et continuer** (règle du 2026-09-24, voir `RUNBOOK.md`). Aucun macOS, ou plusieurs : journaliser, s'arrêter sans demander de tranche |
| Une URL ne charge pas | la passer, journaliser en fin de run, continuer |
| Le budget tombe en cours de tranche | finir d'ouvrir ce qui est déjà servi si possible, journaliser `partial: budget epuise apres N`, ne pas redemander |

Dans tous les cas d'incident, **ne pas relancer la file** : les fiches servies sont déjà
consommées pour sept jours. La boucle ne reprend qu'après une tranche entièrement ouverte,
jamais après une erreur.

## Ce qu'il ne faut pas faire

- Conclure qu'une annonce est supprimée. Ce n'est pas le rôle de cette session.
- Écrire quoi que ce soit en base. La seule écriture passe par l'extension.
- Toucher à `shards.json` : il appartient au crawl de résultats, pas à la revisite.
- Ajouter La Centrale.
- Demander une tranche qu'on n'aura pas le temps d'ouvrir, ou en demander une avant
  d'avoir entièrement ouvert la précédente.
- Lire, recopier ou construire une clé de licence. La page la porte seule ; cette session
  ne la voit jamais.
