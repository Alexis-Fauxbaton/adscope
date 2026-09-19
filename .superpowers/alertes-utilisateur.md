# Alertes utilisateur : dire ce qui empêche de travailler, et le geste qui répare

Lot livré le 2026-09-19, `extension/` seulement. 434 tests verts
(`cd extension && node --test tests/*.test.mjs`), 398 avant le lot — +36, et
verts aussi avec l'horloge du processus décalée d'un an. Tous les fichiers
source restent sous 150 lignes.

Le principe posé par Alexis : **dès que l'extension ne peut pas travailler et
que l'utilisateur peut y faire quelque chose, elle le lui dit, avec le geste à
faire.** Le 2026-09-19, l'accès de l'extension à un des deux sites était coupé
dans Chrome depuis douze jours. Rien ne l'a dit ; la session de crawl s'est
arrêtée, à raison, faute de pastilles, et personne n'a su pourquoi.

---

## Ce que l'exécution a établi sur `chrome.permissions`

C'est le point dur du lot, et il a changé la conception. Mesuré dans un
Chromium 151 réel (Chrome for Testing, contexte persistant Playwright,
`--load-extension` sur `extension/`), en évaluant dans la page de la fenêtre :

| manifeste | `getAll().origins` | `contains({origins:['https://www.lacentrale.fr/*']})` |
|---|---|---|
| origines dans `content_scripts.matches` **seulement** (l'état d'avant le lot) | les deux sites y **sont** | **`false`** |
| les mêmes origines aussi dans `host_permissions` | les deux sites y sont | **`true`** |

**`contains` rendait `false` alors même que l'accès était accordé.** Chrome
range une origine déclarée par `content_scripts.matches` dans les *scriptable
hosts* ; `permissions.contains` construit son jeu de comparaison avec les seuls
*explicit hosts*, et ne trouve donc rien. Branché tel quel, le contrôle d'accès
aurait crié au loup en permanence sur une extension en parfait état.

**D'où la seule modification du manifeste côté permissions** : les deux
origines des sites rejoignent `host_permissions`. Elles étaient déjà demandées
à l'installation (Chrome présente les `content_scripts.matches` comme « lire et
modifier vos données sur… ») : l'écran d'installation ne change pas, et
`contains` devient une question à laquelle Chrome sait répondre. Vérifié après
coup sur l'extension livrée : `contains` rend `true` pour les deux sites, le
service worker ne signale aucun problème, la fenêtre n'affiche aucune alerte,
aucune erreur de page.

Deux autres constats de la même séance, qui expliquent ce qui n'a **pas** pu
être automatisé :

- `chrome.permissions.remove({origins:['https://www.lacentrale.fr/*']})` est
  refusé : *« You cannot remove required permissions »*. Les origines des sites
  sont **requises** (elles viennent du manifeste) ; seul le réglage « Accès aux
  sites » de `chrome://extensions` peut les retenir, et aucune API ne l'imite.
- Poser l'état retenu directement dans le profil ne marche pas non plus :
  `withholding_permissions: true` et un `runtime_granted_permissions` amputé,
  écrits dans `Default/Secure Preferences`, sont **rejetés au chargement**
  (les MAC de protection de Chrome) et remis à `false`.

**Le dernier maillon — Chrome retire vraiment l'accès, `contains` passe à
`false` — se vérifie donc à la main.** La procédure est plus bas, dans « À
essayer par Alexis ». Tout le reste du chemin est établi par l'exécution : que
`contains` répond juste une fois les origines déclarées, et que le bouton
**Réactiver** appelle `chrome.permissions.request` avec exactement
`{ origins: ['https://www.lacentrale.fr/*'] }` — constaté par un vrai clic dans
la vraie fenêtre, dans le vrai navigateur.

### `optional_host_permissions: ["https://*/*"]` : elle reste, et voici ce qui en dépend

Elle est trop large pour la revue du Chrome Web Store, et elle n'est pas là par
hasard. **Deux choses en dépendent, toutes deux dans `popup/account.js` :**

- « Adresse de l'API » → *Enregistrer* appelle
  `chrome.permissions.request({ origins: ['<origine saisie>/*'] })` ;
- « Tester la connexion » fait la même demande avant de sonder.

Le domaine de production n'est pas connu à la compilation : c'est tout l'objet
de ce réglage. Réduire `optional_host_permissions` aux deux sites rendrait ces
deux boutons inopérants pour toute adresse d'API autre que `localhost`. **Elle
est donc laissée telle quelle.** Le jour où l'adresse de production sera fixée,
le bon geste sera de la mettre en dur dans `host_permissions` et de réduire
`optional_host_permissions` à rien — pas de la rogner aux deux sites, qui n'en
ont plus besoin depuis qu'ils sont dans `host_permissions`.

---

## Les quatre situations, et ce qu'elles font maintenant

| Situation | Ce que voit Alexis |
|---|---|
| **Accès à un site désactivé** | Icône « ! ». Fenêtre : « La Centrale : accès désactivé » + bouton **Réactiver**, qui demande l'accès au navigateur. |
| **Session tombée** (401 sans clé) | Icône « ! ». Fenêtre : « Session adscope expirée : reconnectez-vous. » + bouton **Se reconnecter**. Dans la page, inchangé : la pastille et le panneau cèdent la place à « adscope — reconnectez-vous ». |
| **Serveur injoignable** | Icône « ! ». Fenêtre : « adscope est injoignable. » + bouton **Réessayer**, qui refait un vrai appel. **Jamais « reconnectez-vous »** — ce serait la mauvaise consigne. |
| **Onglet périmé** | À la place des pastilles et du panneau : « adscope a été mis à jour — rechargez la page ». Une ligne `console.info`, une seule. Aucun message envoyé — le script orphelin ne peut plus parler à personne. |

## Comment c'est fait

**Un seul état de santé**, `src/health.js`, tenu par le service worker : une
liste de problèmes (`site_access` par site, `logged_out`, `unreachable`), un
ordre d'affichage fixe — l'accès d'abord, c'est le seul qui se répare sans
quitter la fenêtre —, et l'icône qui porte « ! » dès que la liste n'est pas
vide. Le badge ne se repeint qu'au changement d'état.

Nouveaux fichiers :

| fichier | ce qu'il tient |
|---|---|
| `src/health.js` | la liste des problèmes, l'icône, et la phrase + le bouton de chacun |
| `src/reach.js` | joignable ou non : la règle des échecs répétés |
| `src/access.js` | l'accès aux sites, lu sur le registre et `chrome.permissions` |
| `src/api.js` | `config` et `call`, extraits de `sw.js` — c'est là que chaque appel rapporte son issue |
| `src/observation.js` | l'observation et le seuil de fraîcheur, extraits de `sw.js` (qui tenait 151 lignes) |
| `src/stale-notice.js` | la mention de l'onglet périmé |
| `popup/alerts.js` | les problèmes en tête de la fenêtre, et leurs gestes |

Trois retouches méritent d'être signalées :

- **`src/auth.js` ne peint plus le badge** : il note `logged_out` dans l'état
  commun, et `health` décide. Le fichier passe de 49 à 33 lignes, et la
  correction du « ! » resté posé en passant en mode clé tient toujours.
- **`src/sw.js`, `badge`** : le badge d'onglet vaut désormais `null` et non
  `''` quand il n'a rien à dire. **Un texte par onglet, fût-il vide, recouvre
  le badge global** : c'est ainsi que le « ! » d'une session tombée restait
  invisible précisément sur les onglets où on regardait. Et tant qu'un problème
  est en cours, l'onglet ne pose rien du tout — le compte dit ce que la page
  montre, le « ! » dit que l'extension ne travaille plus.
- **`src/sw.js` ne nomme aucun site**, alors qu'il charge leurs modules : il
  lit le manifeste (`chrome.runtime.getManifest()`), garde les `src/sites/*` des
  blocs de son monde, et les charge dans l'ordre déclaré. La garde
  « aucun module partagé ne nomme un site » tient, et ajouter un site reste
  un fichier plus deux lignes au manifeste.

### La règle du serveur injoignable

Trois issues à un appel, qui ne disent pas la même chose : `fetch` qui rejette
(personne au bout), un 5xx (quelqu'un, mais qui va mal), et toute autre réponse
— **401 comprise** : le serveur est là, il répond, même pour dire non.

> **Deux échecs consécutifs, et le premier remonte à au moins trente secondes.**
> Une seule réponse non-5xx remet le compteur à zéro.

Le délai n'est pas décoratif : une page de résultats produit ses lots de
mutations en rafale, et `src/sync.js` n'y oppose qu'une pause de trente
secondes. Sans lui, trois échecs dans la même seconde suffiraient à décréter le
serveur mort. L'instant et le compteur sont injectables (`now` en paramètre,
`reset(count, since)`) : aucun test n'a à lire l'horloge réelle.

Conséquence voulue : un 401 **efface** « injoignable » et pose « session
tombée ». Les deux ensemble, c'est ne rien dire.

### Dans la page

Les mentions n'occupent que les emplacements déjà pris par l'extension : la
pastille des cartes, le panneau de la fiche. Rien ajouté ailleurs, aucun
bandeau. Leurs classes sont préfixées `ads-`, **jamais `adscope-`** : le
contrôle de santé du crawl compte les `[class*="adscope-"]` et doit **échouer**
quand l'extension ne travaille pas. Le commentaire qui l'explique est dans
`src/auth-notice.js` et repris dans `src/stale-notice.js`.

Au passage, un garde-fou qui ne gardait rien : le DOM de fabrique des tests
(`tests/stage.mjs`) ne rendait pas `className` sous l'attribut `class`, si bien
que `querySelectorAll('[class*="adscope-"]')` **ne trouvait jamais rien**, même
sur une pastille bien posée. Il est corrigé, et chaque test du garde commence
désormais par constater qu'il y en avait avant.

---

## Les tests

+36 tests, dans trois fichiers neufs et un complété.

- `tests/health.test.mjs` (16) — les quatre situations vues du service worker,
  chacune avec son retour à la normale ; trois problèmes à la fois, dans un
  ordre d'apparition inverse de l'ordre d'affichage ; le « ! » qui passe
  au-dessus du compte de l'onglet.
- `tests/stale-notice.test.mjs` (7) — l'onglet périmé sur les deux sites, dont
  une annonce La Centrale à deux cartes ; la mention posée sans le moindre
  message ; la console qui ne le dit qu'une fois.
- `tests/alerts.test.mjs` (9) — la fenêtre : rien quand tout va bien, une
  phrase et un bouton par problème, **Réactiver** qui demande la bonne origine
  et elle seule.
- `tests/auth-notice.test.mjs` (+4) — **le trou de couverture relevé** : les
  tests de session tombée ne tournaient que sur le DOM leboncoin. Le pendant
  sur `lc-page.mjs` est là, y compris l'annonce à deux cartes.

**Chaque test nomme la ligne de production qui le fait rougir, et ça a été
prouvé en la cassant** : 22 mutations passées une à une sur la ligne nommée,
chacune fait tomber au moins le test qui la cite, et le fichier est restauré
après chaque passage. Deux d'entre elles n'avaient d'abord aucun témoin — la
remise à zéro du compteur de `reach.js` et le verrou `posted` de
`stale-notice.js` : deux tests ont été ajoutés pour les couvrir, et non les
lignes supprimées.

---

## À essayer par Alexis

L'extension se recharge dans `chrome://extensions` (« Charger l'extension non
empaquetée » sur `extension/`, ou la flèche de rechargement).

### 1. Accès à un site désactivé — c'est le cas du 19 septembre

1. `chrome://extensions` → adscope → **Détails** → **Accès aux sites** →
   choisir **« Sur clic »** (ou décocher `www.lacentrale.fr` en mode
   « Sur des sites spécifiques »).
2. L'icône adscope doit prendre un **« ! »** gris, sans qu'aucune page soit
   ouverte — la vérification a lieu au démarrage du service worker et à chaque
   changement de permission.
3. Ouvrir la fenêtre : en tête, encadrée de rouge tampon,
   **« La Centrale : accès désactivé »** et un bouton **Réactiver**.
4. Cliquer **Réactiver** : Chrome demande l'accès. Accepter.
5. La ligne disparaît, la fenêtre redevient normale, le « ! » s'efface.

**C'est aussi la vérification qui n'a pas pu être automatisée** (voir plus
haut) : si à l'étape 2 l'icône ne porte rien, c'est que Chrome ne retire pas
l'origine des *explicit hosts* quand on restreint l'accès, et il faudra passer
par `getAll().origins` au lieu de `contains` — le changement tient en trois
lignes de `src/access.js`. Pour trancher sans deviner : sur la page de la
fenêtre (clic droit → Inspecter), `await chrome.permissions.contains({origins:
['https://www.lacentrale.fr/*']})` et `(await chrome.permissions.getAll())
.origins` disent laquelle des deux voit la coupure.

### 2. Session tombée

1. Se déconnecter côté API (ou supprimer le cookie de session sur
   `localhost:8000`), sans clé de licence configurée dans la fenêtre.
2. Ouvrir une page de résultats leboncoin **ou La Centrale** : les pastilles
   cèdent la place à « adscope — reconnectez-vous », le panneau d'une fiche
   aussi.
3. Icône : « ! ». Fenêtre : « Session adscope expirée : reconnectez-vous. » +
   **Se reconnecter**, qui ouvre l'application.
4. Se reconnecter, recharger la page : tout revient.

### 3. Serveur injoignable

1. Arrêter l'API.
2. Ouvrir une page de résultats, **puis attendre une trentaine de secondes et
   changer de page** (ou passer à la page 2). Il faut deux échecs espacés — un
   502 passager ne doit pas faire clignoter d'alerte.
3. Icône : « ! ». Fenêtre : « adscope est injoignable. » + **Réessayer**.
   Vérifier qu'il n'y est **pas** question de se reconnecter.
4. Relancer l'API, cliquer **Réessayer** : la ligne disparaît.

### 4. Onglet périmé

1. Ouvrir une page de résultats et laisser l'onglet ouvert.
2. `chrome://extensions` → recharger adscope (la flèche).
3. Revenir sur l'onglet et **faire bouger la page** (défiler, filtrer,
   paginer) : à la place de chaque pastille et du panneau,
   « adscope a été mis à jour — rechargez la page ».
4. Console de la page : une ligne `adscope : adscope a été mis à jour —
   rechargez la page`, **une seule**, même en continuant à naviguer.
5. Recharger la page : tout repart.

---

## Ce qui reste ouvert

- **Le dernier maillon du cas 1** se vérifie à la main (procédure ci-dessus).
  Ni `permissions.remove` ni la retouche du profil ne permettent de simuler le
  retrait d'un accès requis.
- **Le seuil « deux échecs, trente secondes »** est une proposition. Si
  l'alerte « injoignable » se révèle trop bavarde en usage réel, la règle est
  en un seul endroit (`FAILS` et `SPAN_MS` dans `src/reach.js`) et ses tests
  n'ont qu'à suivre.
- **`optional_host_permissions: ["https://*/*"]`** reste à traiter le jour où
  l'adresse de production sera fixée — c'est le seul reste large du manifeste.
