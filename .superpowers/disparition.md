# La disparition, constatée par revisite directe

`listings.disappeared_at` vaut NULL sur les 43 457 annonces de la base : rien ne
l'écrivait. Ce travail pose les trois pièces qui l'écrivent — la file qui dit
quelle fiche rouvrir, la constatation que l'extension rapporte quand la page dit
elle-même que l'annonce n'est plus là, et les refus qui empêchent une extraction
cassée de marquer la base entière disparue.

Un seul site est couvert : **leboncoin**. La Centrale est écartée, et le
paragraphe « Ce qui n'est pas couvert » dit pourquoi.

## Ce qui a été livré

Côté API :

- `api/adscope_api/revisit.py` — la file : ce qui vaut une page, dans quel
  ordre, et la reconstruction d'adresse qui refuse ce qu'elle n'a pas mesuré.
- `api/adscope_api/disappearance.py` — l'écriture : la preuve unique qui écrit,
  la double constatation, le garde-fou de flotte.
- `POST /v1/revisits` `{site, limit}` → `[{site, site_id, url}]`, et
  `POST /v1/disappearances` `{site, site_id, evidence}` → `{verdict}`
  (`main.py`), avec leurs gabarits d'entrée (`intake.AbsenceIn`) et de sortie
  (`schemas.RevisitIn/RevisitOut/AbsenceOut`).
- deux colonnes sur `listings` (`absent_since`, `last_revisit_at`) et
  l'index `ix_listings_revisit`, par la migration `005_listings_revisit`.
- `observations.record` efface l'absence en cours quand une observation montre
  l'annonce vivante — une seule ligne, et c'est un invariant central.

Côté extension :

- `extension/src/sites/leboncoin-absence.js` — la signature, dans le registre
  des sites, avec ce qui a été observé et ce qui ne l'a pas été.
- `extension/src/absence.js` — le pilote, code partagé qui ne nomme aucun site :
  il lit la page une fois au chargement et se tait là où le registre ne déclare
  pas de signature. Chargé sur les deux sites ; La Centrale n'en déclare pas, il
  n'y fait rien.
- `sync.js` porte la constatation au service worker, `sw.js` la poste sur sa
  propre route. Rien n'est mis en cache : un verdict n'est pas un signal.

**L'extension n'émet toujours aucune requête d'elle-même.** Elle lit le document
que le navigateur a déjà rendu, comme partout ailleurs ; c'est le crawler qui
décide d'ouvrir la fiche.

Le patch du crawler est en fin de rapport, en texte : `crawler/` n'a pas été
touché.

## La signature, et les quatre conditions

Reconnaissance du 2026-09-07, Chrome réel : une fiche leboncoin supprimée rend un
**200 portant un message**, pas un 404 ni une redirection. L'adresse ne bouge
pas, la route Next est celle de la fiche, et c'est la charge qui est vidée.

`ADS.leboncoin.absence(doc, id)` rend `absent`, `alive`, `status:<état>` ou
`unreadable`, sur quatre conditions dont **deux témoins indépendants** :

1. `__NEXT_DATA__.page === '/ad/[cat]/[id]'` — la route de fiche a bien rendu ;
2. `query.id` égale l'identifiant de l'URL — c'est bien notre annonce ;
3. `'ad' in props.pageProps` **et** `props.pageProps.ad === null` — une valeur
   posée par le site, pas un champ manquant ;
4. `document.title === 'Annonce introuvable'` **ou** un h1 disant « annonce est
   désactivée » — le libellé visible.

Les points 1 et 2 écartent le 404 générique du site (279 caractères, h1 « 404 »,
**aucun `__NEXT_DATA__`**), la page voisine, et le mur Datadome — qui ne rend pas
la coquille Next. Le point 3 est le piège central : écrit `!pageProps.ad`, il
confondrait « clé absente » et « valeur nulle », et une refonte de gabarit
marquerait la base entière disparue en une nuit. Le point 4 empêche qu'un `null`
transitoire du backend suffise seul.

`status` ∈ {sold, inactive, pending, deleted} est la **signature seconde** :
l'énumération vient du site (`seoIndexingData.rules.non_indexable_statuses`),
mais aucune page n'a été vue la portant. Elle se rapporte pour être journalisée,
et l'API ne l'écrit pas.

## Ce qui empêche une extraction cassée de marquer la base disparue

Quatre refus, dans cet ordre :

**1. Une seule preuve écrit.** `disappearance.WRITES = "absent"`. `unreadable` et
`status:*` sont journalisés et ne touchent à rien. Une extraction qui échoue est
une extraction qui échoue.

**2. Deux constatations concordantes, séparées d'au moins six heures.** La
première pose `absent_since` et ramène l'échéance de revisite ; la seconde écrit,
et elle écrit **la date de la première** — le premier moment où le site nous a dit
l'absence, pas celui où on a fini de le vérifier. Et une observation vivante entre
les deux efface l'absence en cours : deux constatations séparées par un passage
vivant ne sont pas concordantes.

**3. Le garde-fou de flotte.** Deux questions, dans cet ordre. *Qui mesure-t-on ?*
Les fiches que la file a servies dans les 24 dernières heures — `last_revisit_at`
sert à ça et à rien d'autre. *Que sait-on de chacune, aujourd'hui ?* `gone`, une
absence en cours (`absent_since` non nul) ; `seen`, une annonce revue vivante
dans la fenêtre (`last_seen`). Au-delà de 30 revisites abouties et d'une
disparition pour trois, l'écriture s'interrompt et se journalise. Les
constatations, elles, continuent d'être prises : elles sont réversibles, la date
ne l'est pas.

**Le numérateur ne se compte pas contre la dernière ouverture.** La première
écriture du garde-fou comparait `absent_since` à `last_revisit_at` — et
s'effaçait à l'instant précis où on la consultait. `due` rafraîchit
`last_revisit_at` à chaque ouverture : la fiche constatée absente à T0 est
rouverte à T0+6 h, l'ouverture passe devant l'absence, et la seconde constatation
— celle qui écrit — trouvait toujours `gone = 0`. **Ce n'était pas un angle mort
de bord : c'était tout le trafic crawler**, c'est-à-dire tout le trafic prévu.
Reproduit sur quarante fiches (40 disparitions écrites sur 40) et sur une flotte
mixte de 120 (60 sur 120) ; les deux reproductions sont devenues des tests
(`test_a_signature_that_started_lying_suspends_the_whole_fleet`,
`test_a_mixed_fleet_still_reads_the_pic_when_the_write_comes_due`). Le garde-fou
compte des fiches, `last_revisit_at` compte des ouvertures ; la colonne ne dit
plus que la population, et les deux termes du rapport parlent enfin du même
objet.

**L'asymétrie entre les deux termes est voulue.** Une absence est un *état* :
`observations.record` l'efface dès que l'annonce est revue vivante, donc une
absence qui subsiste est courante par construction, et la borner à la fenêtre la
ferait expirer. Le cas n'est pas théorique : servie, constatée, retenue, la fiche
retombe sous le bail de sept jours ; la file la rouvre une semaine plus tard,
l'absence du premier jour est hors fenêtre, `gone` retombe à zéro et le pic qu'on
venait de retenir s'écrit d'un coup. Un test l'interdit
(`test_an_absence_still_pending_after_the_lease_still_counts`). Une vue, elle,
est un *événement* : `last_seen` est toujours rempli, et sans fenêtre le
dénominateur avalerait la base entière.

Le dénominateur ne compte **que les revisites abouties**, jamais les fiches
servies. La nuit où le mur tombe, le crawler prend trente fiches et n'en ouvre
que trois : compter les fiches servies diviserait la proportion par le budget non
consommé et endormirait le garde-fou exactement quand il sert. Un test l'exige
(`test_claims_the_crawler_never_opened_do_not_dilute_the_guard`), un second
interdit la dilution par l'ancienneté — une fiche servie trente heures plus tôt
et revue vivante depuis n'appartient plus à la flotte du jour
(`test_a_serve_older_than_the_window_does_not_dilute_the_guard`, qui tient aussi
le chiffre de la fenêtre).

**Les six tests du garde-fou passent par `due`** et par le flux complet — la file
sert, la page constate, l'API décide —, et aucun ne pose `last_revisit_at`,
`absent_since` ni `next_detail_crawl` à la main. C'est ce rafraîchissement par la
file que les trois premiers tests ne voyaient pas : ils posaient `last_revisit_at`
à `NOW-1h` une fois pour toutes, et attestaient donc un garde-fou qui, dans le
flux réel, ne tirait pas.

Effet mesuré et voulu : le pic se lit **dès les premières constatations**, six
heures avant qu'une seule écriture soit possible. Dans le test de signature
menteuse, aucune des quarante ne passe.

**4. L'adresse.** `revisit.ADDRESS` reconstruit l'URL côté API, jamais côté
appelant : une adresse fausse rend une page qui parle d'absence sur une annonce
vivante. leboncoin ignore le segment de catégorie (mesuré :
`/ad/motos/<id d'une voiture>` rend la voiture), donc l'identifiant suffit — à
condition d'avoir la forme observée, six chiffres au moins. Ce qui ne l'a pas est
refusé et journalisé, et n'entre pas dans la file.

Le journal part en `warning` à dessein : l'API tourne en `--log-level warning`, et
c'est le seul niveau qui atteigne `~/Library/Logs/adscope-api.log`. Vérifié de
bout en bout : `constatation non concluante: lbc/3254194817, preuve unreadable`.

## La file, et pourquoi cet ordre

Le coût, cadré : une page de résultats rend une trentaine d'annonces, une fiche en
rend une. Les journaux du crawler donnent **7 à 7,8 pages par minute** (194 pages
en 25 minutes le 2026-09-07). Vingt-cinq revisites par run coûtent ~3,5 min sur
les 25 du budget — **14 % du crawl**, environ 600 fiches par jour si les 24 runs
horaires aboutissent, et ils n'aboutissent pas tous. Un recensement des 43 457
annonces prendrait **72 jours à ce rythme**. La file ne recense pas : elle
priorise, et c'est le tri qui décide de ce qu'on saura.

Ce qu'elle refuse d'abord — `QUIET`, trois jours de silence. Une annonce revue il
y a deux heures est vivante, le balayage l'a dit gratuitement. **C'est ainsi que
toute observation, y compris depuis une page de résultats, repousse l'échéance de
revisite** : sans que rien n'ait à l'écrire, l'annonce sort du jeu pour trois
jours. Trois, parce qu'un cycle complet de tranches de prix en prend au moins
autant (69 shards, ~1 h de crawl chacun).

Le silence n'est qu'un ordre de priorité, **jamais une conclusion** : sur six
annonces tirées au hasard parmi celles vues au premier passage et jamais revues,
les six étaient vivantes — le balayage par tranches de prix fait sortir du champ
une annonce qui baisse. La revisite ne souffre pas de ça, puisque c'est le site
qui répond.

L'ordre servi, du plus utile au moins utile :

| rang | population | pourquoi |
|---|---|---|
| 0 | pro publiée depuis plus de 31 j | **4 578 annonces.** Les annonces pro n'expirent pas — la base en porte au-delà de 834 jours quand aucune annonce de particulier ne dépasse 120. Leur disparition est un retrait, pas une échéance : c'est la seule population dont la durée de vie se lise sans démêler les deux. |
| 1 | pro récente | 5 324. Même valeur, mais une annonce publiée hier ne disparaîtra pas cette semaine. |
| 2 | particulier de plus de 31 j | 9 847. La fenêtre où « disparue avant l'expiration » veut dire quelque chose. |
| 3 | le reste | 23 684. Une page dépensée là est presque toujours perdue. |

À rang égal, le plus long silence d'abord. Servir marque la fiche
(`last_revisit_at`, `next_detail_crawl = now + 7 j`) : c'est un bail — une fiche
servie que le crawler n'ouvre pas ne revient pas en tête à chaque appel —, c'est
l'espacement minimal entre deux mesures d'une même annonce, et c'est un frein
automatique la nuit où tout est illisible.

Mesuré sur la base réelle : la requête coûte **30 ms** dans le pire cas (parcours
séquentiel des 43 457 lignes, tri top-N), pour un appel par run. Et aujourd'hui
elle rend **zéro** : la base a deux jours, aucune annonce n'a trois jours de
silence. C'est le comportement attendu — rien ne mérite encore une fiche.

## Le piège de mesure, à ne pas oublier au moment d'exploiter la colonne

Les annonces de particuliers **expirent** sur leboncoin : la fiche vivante porte
`expiration_date`, vue à 60 jours après publication. En base, 251 annonces de
particuliers sur 29 653 dépassent 60 jours, aucune ne dépasse 120, quand les pro
vont au-delà de 834. **Toute distribution de durée de vie de particuliers portera
donc un pic à l'expiration qui n'est pas un rythme de vente.**

Ce que le modèle permet aujourd'hui : la séparation *statistique* — `seller_type`
sépare les deux populations, `published_at` et `disappeared_at` donnent l'âge à la
disparition, et un pic net à 60 jours chez les particuliers se lit pour ce qu'il
est. Ce qu'il ne permet pas encore : la séparation *mécanique*, annonce par
annonce. Elle demande de conserver `expiration_date` à côté de `disappeared_at` —
on saurait alors si l'annonce a disparu à son échéance ou avant. Le champ existe
dans la charge (`pageProps.ad.expiration_date`, observé sur trois fiches) ; sa
présence sur les cartes de résultats n'a pas été vérifiée, et rien n'a été
collecté ici. **C'est le prochain pas, et il est petit.**

Second piège, propre à la file : la durée de vie mesurée est **bornée par la
politique de revisite**. Une annonce ne reçoit de date de disparition que si on la
rouvre ; les rangs 2 et 3 en recevront rarement, et la distribution obtenue est
celle du rang, pas celle du marché. La résolution, elle, est lisible en base :
la disparition a eu lieu dans l'intervalle `(last_seen, disappeared_at]`, et les
deux colonnes y sont déjà.

## Ce qui n'est pas couvert : La Centrale

La signature observée est solide sur ce qu'elle dit — « le site déclare que cette
adresse ne porte pas d'annonce » : titre vide, h1 « Erreur 404 (pas la voiture) »,
« Cette annonce n'est plus disponible », bloc `[class^="Error404_"]`, aucune
charge. Mais **l'équivalence entre « référence retirée » et « référence jamais
émise » n'a pas été vérifiée** : la base ne porte que 24 annonces du site, toutes
d'un seul relevé, toutes vivantes ; les deux références mortes testées sont un
raisonnement par plausibilité. Si le site rendait une page distincte pour une
annonce retirée récemment, on ne l'aurait pas vue. S'ajoute qu'aucun champ d'état
structuré n'existe nulle part côté La Centrale : le libellé serait le seul témoin,
là où leboncoin en donne deux.

Décision : `ADS.lacentrale` ne déclare **aucune** `absence`, et `revisit.ADDRESS`
ne connaît pas `lc` — deux verrous, une décision. Un test l'exige
(`seul le site dont la signature d'absence est mesurée en déclare une`). Mieux
vaut un site couvert et sûr que deux dont un invente des disparitions.

Le verrou de la file demandait une précaution de test. Le test qui l'atteste
n'interrogeait `lc` qu'avec `W103538172`, que la forme d'adresse leboncoin refuse
de toute façon : il passait pour la mauvaise raison, et remplacer
`ADDRESS.get(site)` par `_lbc` ne le faisait pas rougir. Il est désormais joué
aussi avec un identifiant portant la forme leboncoin — qui n'est pas une
référence La Centrale, les 24 relevées portent toutes une lettre de tête, et
c'est précisément ce qui isole le verrou du site de celui de l'adresse.

## Le patch du crawler (non appliqué)

`crawler/run_crawl.py` n'a pas été touché. Le patch ci-dessous ouvre les fiches
que l'API désigne, et **rien d'autre** : le crawler n'analyse aucune page, ne
conclut rien, ne connaît pas la signature. Il ouvre des URLs ; l'extension
constate ; l'API décide.

```diff
@@ imports @@
 import socket
 import subprocess
 import sys
 import time
+import urllib.error
+import urllib.request
 from datetime import datetime, timezone

@@ constantes @@
 API_HOST, API_PORT = "127.0.0.1", 8000
+# La licence de l'extension, la meme que celle du navigateur : la file est
+# derriere la meme authentification que le reste de l'API. A poser dans le
+# plist du service (EnvironmentVariables > ADSCOPE_LICENSE).
+LICENSE = os.environ.get("ADSCOPE_LICENSE", "")
+REVISITS_URL = "http://%s:%d/v1/revisits" % (API_HOST, API_PORT)

@@ apres crawl_shard / avant preflight @@
+def revisit_queue(count):
+    """Demande a l'API les fiches a rouvrir. Aucune analyse ici."""
+    body = json.dumps({"site": "lbc", "limit": count}).encode("utf-8")
+    req = urllib.request.Request(REVISITS_URL, data=body, headers={
+        "Content-Type": "application/json",
+        "Authorization": "Bearer " + LICENSE,
+    })
+    with urllib.request.urlopen(req, timeout=10) as res:
+        return json.load(res)
+
+
+def crawl_revisits(tab, args):
+    """Ouvre les fiches que la file designe, au meme rythme que les resultats.
+
+    Le crawler ne lit pas ces pages : c'est l'extension qui constate ce que le
+    site dit, et l'API qui decide si cela s'ecrit. Une fiche illisible - mur
+    anti-bot, gabarit refondu - ne produit donc rien, et surtout pas une
+    disparition.
+    """
+    if args.revisits <= 0:
+        return
+    if not LICENSE:
+        log("%s\t-\t0\t-\tskip: ADSCOPE_LICENSE absent, revisites non demandees"
+            % now())
+        return
+    try:
+        items = revisit_queue(args.revisits)
+    except (urllib.error.URLError, OSError, ValueError) as exc:
+        log("%s\t-\t0\t-\terror: file de revisite: %s" % (now(), exc))
+        return
+    done = 0
+    for item in items:
+        if time.time() > args.deadline:
+            break
+        try:
+            visit(tab, item["url"], args.settle)
+            done += 1
+        except Exception as exc:
+            log("%s\t%s\t0\t-\terror: revisite: %s" % (now(), item["site_id"], exc))
+    log("%s\t-\t%d\t%d\trevisites ouvertes" % (now(), done, len(items)))
+
+
 def preflight(tab, shard, args):

@@ arguments @@
     p.add_argument("--only", metavar="SHARD_ID",
                    help="ne traiter que ce shard (debug)")
+    p.add_argument("--revisits", type=int, default=25, metavar="N",
+                   help="fiches a rouvrir en debut de run (defaut 25, 0 pour "
+                        "aucune). Une fiche coute une page pour une annonce, "
+                        "une page de resultats en rend trente : ce nombre est "
+                        "un parametre de securite, pas de debit.")
     p.add_argument("--skip-api-check", action="store_true")

@@ dans main(), apres le preflight reussi @@
         if not ok:
             log("%s\t-\t0\t-\terror: extension absente de ce profil Chrome "
                 "(--profile ?), run annule" % now())
             return 1
 
+        # Apres le preflight, jamais avant : sans extension active, ouvrir des
+        # fiches ne collecte rien et depense le budget.
+        crawl_revisits(tab, args)
+
         for shard in todo:
```

Notes d'exploitation :

- **Le préflight d'abord.** Sans extension active, une revisite ne constate rien
  — elle ne produit pas de fausse disparition, elle gaspille une page.
- **`ADSCOPE_LICENSE` est à ajouter au plist du crawler**, qui n'a pas de bloc
  `EnvironmentVariables` aujourd'hui. Fichier hors périmètre, non modifié.
- **Vingt-cinq est un plafond de sécurité.** Vingt-cinq fiches d'affilée
  ressemblent moins à une consultation humaine que vingt-cinq pages de
  résultats ; `visit` garde le même délai (`settle` + aléa), et si le mur tombe,
  le bail de sept jours freine tout seul.
- Le journal du crawler gagne une ligne par run : `revisites ouvertes`, avec le
  nombre ouvert et le nombre servi. L'écart dit le budget consommé ailleurs.

## Tests

`api` : **194 verts** (159 avant, +35) — `tests/test_revisit.py`,
`tests/test_disappearance.py`, trois ajouts à `tests/test_migrations.py`.
`extension` : **302 verts** (289 avant, +13) — `tests/absence.test.mjs`, deux
ajouts à `tests/sw.test.mjs`, un à `tests/sites.test.mjs`.

Chaque test nomme dans son commentaire la ligne de production qu'il fait rougir,
et **la rougeur a été vérifiée** en cassant ces lignes une à une :

| ligne cassée | test qui tombe |
|---|---|
| `Listing.last_seen <= now - QUIET` | une annonce vue il y a deux heures ne vaut pas une page |
| `_rank` retiré du `order_by` | la pro ancienne d'abord |
| le marquage de `due` | servir une fiche la met en retrait |
| `disappeared_at = absent_since = None` (record) | vue vivante, l'absence en cours tombe |
| la double constatation | six tests |
| `if evidence != WRITES` | aucune preuve hors la mesurée n'écrit (×3) |
| le garde-fou entier retiré | cinq tests de flotte |
| `gone` → `absent_since >= last_revisit_at` (le défaut) | les cinq mêmes |
| `gone` borné à la fenêtre | l'absence en cours au terme du bail |
| `or_(gone, seen)` → `filter(gone)` | une flotte revue vivante laisse écrire |
| `or_(gone, seen)` → `count(*)` | les fiches jamais ouvertes ne diluent pas |
| `seen` → `last_seen is not null` | les mêmes |
| `last_revisit_at >= window` → `is not null` | un service hors fenêtre ne dilue pas |
| `GUARD_WINDOW` 24 h → 72 h | le même |
| le `where` retiré | la fenêtre, et l'angle mort hors file |
| `ADDRESS.get(site)` → `_lbc` | La Centrale n'entre jamais dans la file |
| `disappeared_at = now` au lieu de `= absent_since` | la date écrite est celle de la première |
| `'ad' in props` → `!props.ad` | un gabarit sans la clé ne conclut rien |
| `says(doc)` retiré | une charge vidée sans libellé ne conclut rien |
| la route, l'identifiant | deux tests d'illisibilité |
| `verdict !== 'alive'` | rien ne part d'une fiche vivante |

Deux mutations avaient survécu au premier jet, toutes deux dans le garde-fou de
flotte. Le dénominateur d'abord, d'où le test de dilution. Le numérateur ensuite,
et celui-là a coûté cher : les trois tests qui le gardaient posaient
`last_revisit_at` à la main et ne le rafraîchissaient jamais, si bien qu'ils ne
jouaient pas le flux qu'ils prétendaient jouer — le garde-fou était vert et ne
tirait pas. Réécrits autour de `due`, ils tombent sur la ligne fautive. La
première correction, `absent_since >= now - GUARD_WINDOW`, laissait elle-même
survivre une mutation : c'est en cherchant pourquoi qu'est apparu le cas du bail
de sept jours, et que le numérateur est devenu une question d'état plutôt que de
date.

Vérifications hors tests, sur la base de développement (43 457 annonces,
`pg_dump` pris avant migration dans
`/Users/alexis/Documents/Projets/adscope-dumps/`) :

- migration `005` appliquée, colonnes et index en place, aucune ligne touchée ;
- API redémarrée (`launchctl kickstart`), `/v1/me` répond ;
- `/v1/revisits` rend `[]` sur `lbc` (rien n'a trois jours de silence) et `[]`
  sur `lc` (site absent de la file) ;
- aller-retour complet sur une annonce réelle : `first` → `too_soon` →
  `logged` (preuve `unreadable`), ligne de journal écrite dans
  `~/Library/Logs/adscope-api.log`, puis **base remise à zéro** — les quatre
  colonnes sont NULL sur les 43 457 lignes.

## Réserves

1. **Le garde-fou n'a pas tiré pendant tout le premier jet, et cette réserve
   affirmait l'inverse.** Elle présentait la constatation humaine comme le seul
   angle mort ; en réalité c'est *tout le trafic crawler* qui l'était — le
   numérateur s'effaçait au moment d'écrire, parce qu'il se comparait à une
   colonne que la file rafraîchit à chaque ouverture (voir le point 3 plus haut).
   Corrigé, et les deux reproductions sont au jeu de tests. La leçon vaut d'être
   gardée : trois tests verts attestaient ce garde-fou, tous trois en posant à la
   main la colonne dont le rafraîchissement était le défaut. **Un test qui pose
   lui-même l'état qu'il prétend observer n'atteste rien.**

   Ce qui reste hors de vue, et qui est bien plus étroit : la constatation venue
   d'un humain qui navigue. `last_revisit_at` est NULL, la fiche n'est jamais
   passée par `due`, elle n'entre ni au numérateur ni au dénominateur, et n'est
   gardée que par la double constatation — un test le dit noir sur blanc
   (`test_constatations_outside_the_queue_stay_invisible_to_the_guard`).
   L'élargir demanderait d'étendre la population aux absences sans ouverture, ce
   qui ferait tirer le garde-fou sur trente fiches mortes consultées dans la
   journée, sans dénominateur en face. Le volume rend la chose théorique
   aujourd'hui (600 revisites par jour contre quelques fiches consultées). À
   revoir si l'extension sort du poste d'Alexis.
2. **Si le crawler ne tourne pas, le garde-fou dort** : sous 30 revisites
   abouties sur 24 h, il ne se déclenche jamais.
3. **La popup ne dit rien d'une fiche morte.** `detail.js` ne trouve aucune
   annonce et n'écrit pas de diagnostic ; la fenêtre montre alors celui de la
   page précédente, ou « Données présentes mais aucune annonce reconnue ».
   Comportement antérieur à ce travail, non aggravé, non corrigé : le corriger
   demandait une troisième sorte de diagnostic dans `report.js`.
4. **`models.py` a été scindé.** Le fichier était à 150 lignes pile, la limite du
   dépôt, et la file y ajoute deux colonnes. `Base` part dans `base.py`, les deux
   tables d'usage dans `usage_models.py`, réexportées par `models.py` — rien
   d'autre ne bouge, aucun import existant n'a changé. C'est de la place faite,
   pas un remaniement.
5. **Une observation efface `disappeared_at`.** Comportement antérieur, conservé :
   une annonce revue vivante n'est pas disparue. On perd de ce fait la trace d'une
   annonce désactivée puis republiée sous le même identifiant — un signal qui
   intéressera la détection de republication, et qui demanderait de garder
   l'historique plutôt que la dernière valeur.
6. **`status:*` n'a jamais été observé.** La signature seconde se journalise
   depuis aujourd'hui ; quelques semaines de journal diront si elle existe, et à
   quelle fréquence, avant d'envisager de la promouvoir.
