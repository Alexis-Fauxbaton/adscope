# Comptes avec mot de passe — côté site et extension, rapport de fin de lot

Périmètre : `web/` (points 8) et `extension/` (point 9, deux endroits) du plan
(`.superpowers/comptes-mdp-plan.md`, commit `f4ed153`), plus les captures et
ce rapport (point 10, complété par `.superpowers/comptes-mdp-api.md` côté
API). Le lot API (points 1-7) est déjà livré et commité — lu ici en lecture
seule, jamais modifié.

## Statut

Fait, tests verts. Compteurs de départ pris au début de ce lot (API déjà à
876 passed / 3 failed pré-existants, non miens — voir « Dette » plus bas) :
**web 155**, **extension 429**. À l'arrivée : **web 166**, **extension 430**.

## Le parcours de Karim, rejoué sur les captures

1. `docs/site-v0-connexion.png` — email, mot de passe, « Mot de passe
   oublié ? », « Créer un compte ». Remplace l'ancienne capture (un seul
   champ email, lien magique).
2. `docs/site-v0-inscription.png` — email, mot de passe avec un œil pour
   l'afficher (jamais de champ « confirmez »), la règle écrite dessous avant
   l'envoi : « Choisissez un mot de passe d'au moins 10 caractères. » — mot
   pour mot le texte que rend l'API (`passwords.TOO_SHORT`), testé littéral.
3. Écran « Vérifiez votre email » (pas de capture nommée dans la liste,
   composant partagé `signup.verifiezCard`, réutilisé tel quel par le 403 de
   connexion) : « Un email est parti à … » + bouton « Renvoyer l'email ».
4. Page d'arrivée `#/verification?token=…` : POSTe le jeton lu dans le
   fragment (jamais envoyé en `GET`), l'efface de l'URL
   (`history.replaceState`, même geste que `digest-visit.js` pour `?d=`),
   affiche « Votre email est vérifié » et un bouton qui mène à Mes suivis.
5. `docs/site-v0-mdp-oublie.png` — un email, un message indistinct qu'il
   existe un compte ou non : « Si un compte existe pour cette adresse, un
   lien vient de partir. »
6. Page d'arrivée `#/nouveau-mdp?token=…` : même mécanique de jeton, un
   champ, connecté à la fin (toutes les autres sessions du compte tombent,
   côté API).
7. `docs/site-v0-mon-compte.png` — adresse, changer le mot de passe (ancien +
   nouveau), se déconnecter.
8. `docs/site-v0-connexion-mobile.png` — même écran de connexion, 390 px réels.

Captures prises en mode `?demo=1` (aucun réseau), Playwright, sur
`http://localhost:8000/app`, jamais `127.0.0.1`. Un écart à la convention
notée dans `.superpowers/site-web.md` : prises à l'échelle CSS (×1), pas ×2 —
l'outil de capture de cette session ne pilote pas `deviceScaleFactor`.
Netteté suffisante pour relecture, à reprendre en ×2 si une capture doit
servir de support imprimé.

## Ce qui a été livré

**Site (neufs)** — `js/api-auth.js` (les huit appels d'auth, `ApiError` qui
porte le `status` et le message exact rendu par l'API, mode `?demo=1` court-
circuité sans réseau), `js/password-field.js` (le champ mot de passe avec son
œil, réutilisé par inscription/réinitialisation/changement), `js/signup.js`
(créer un compte + la carte « vérifiez votre email » partagée avec la
connexion + `REGLE_MDP`), `js/password-reset.js` (oublié + nouveau mot de
passe), `js/account-page.js` (Mon compte), `js/auth-routes.js` (le routeur
public : `pageFor`, `tokenFromHash`, `emailFromHash`, `withoutToken`, la page
d'arrivée de vérification).

**Site (modifiés)** — `js/login.js` (réécrit : email + mot de passe, bascule
sur la carte de vérification au 403), `js/app.js` (`demarrer()` bascule sur
le routeur public pour les six routes non authentifiées ; `#/compte` ;
`navCourante()` distincte de `route()` pour ne plus allumer « Mes suivis »
par erreur sur la page compte), `js/api.js` (perd `login`/`logout`, déménagés
dans `api-auth.js`, dont les erreurs ne veulent jamais dire « session
tombée »), `css/views.css` (`.entree .champ` en police proportionnelle, plus
en monospace hérité du collage de clé ; `.regle`, `.entree-liens`,
`.champ-mdp`, `.oeil`), `css/base.css` (`.moi` devient un lien vers
`#/compte`, sans soulignement).

**Extension** — `src/auth-notice.js` et `popup/account.js` : la mention
« reconnectez-vous » et le bouton « Se connecter » de la popup ouvrent
désormais `${apiBase}/app/#/connexion` plutôt que `${apiBase}/app` (qui
n'aurait fait qu'y rediriger, un aller-retour de moins pour Karim). Le bouton
« Ouvrir adscope » (session déjà ouverte) continue d'ouvrir `${apiBase}/app`
tel quel : `popup/account.js` retient l'état connecté posé par
`showAccount()` pour choisir. `src/auth.js` : un commentaire corrigé (« depuis
le lien magique » → « depuis sa connexion par mot de passe »), aucun
changement de code. Rien d'autre touché.

Aucun fichier source neuf au-delà de 150 lignes (`app.js` à 129, le plus
long). Tests neufs sous la même limite.

## Vérifié contre le contrat (lecture seule d'`api/`)

Contrat livré relu dans `api/adscope_api/{auth_signup,auth_email,accounts,
passwords}.py` : les huit routes, leurs statuts (202/204/400/401/403/409/422/
429), les neuf messages exacts, `X-Adscope: 1` sur tout POST y compris non
authentifié — `js/api.js` le pose déjà sur toute écriture, aucun changement
requis côté site pour ça. Les liens de vérification/réinitialisation portent
le jeton dans le fragment (`#/verification?token=…`,
`#/nouveau-mdp?token=…`) : le site les lit avec `tokenFromHash`, les poste,
jamais en `GET`.

Un point du contrat vérifié en le cassant volontairement puis en le
restaurant (`web/js/api-auth.js`, test dédié) : l'erreur de l'API doit
survivre telle quelle jusqu'à l'écran — sans le `try { detail = (await
res.json()).detail || detail }`, Karim lirait « /v1/auth/login a répondu
401 » au lieu de « Email ou mot de passe incorrect. ».

## Tests

`node --test web/tests/*.test.mjs` : **166 passed**, 0 rouge (155 avant,
+11 : 2 conservés et réécrits dans `login.test.mjs`, +3 `signup.test.mjs`,
+5 `auth-routes.test.mjs`, +1 `password-reset.test.mjs`, +3
`api-auth.test.mjs` — net +9 fichiers de test, +11 cas après retrait des deux
anciens tests du lien magique).

`node --test extension/tests/*.test.mjs` : **430 passed**, 0 rouge (429
avant, +1 : le cas « session ouverte, le bouton ne repasse pas par la
connexion » dans `popup.test.mjs`, qui manquait).

Aucun test ne lit l'horloge réelle (aucun des tests neufs n'en avait besoin —
pas de jeton, pas d'expiration testée côté site, ça reste au lot API).

Chaque test neuf nomme la ligne de production qui le fait rougir en
commentaire, et j'ai vérifié à la main trois cas représentatifs en cassant
puis restaurant la ligne visée : `outcomeFor` (login.js), `withoutToken`
(auth-routes.js), l'extraction du message d'erreur (api-auth.js) — les trois
sont passés au rouge puis revenus au vert.

`cd api && ./.venv/bin/pytest tests/ -q` : non modifié par ce lot (lecture
seule). Lancé en observation : **778 passed / 12 failed / 90 errors** au
moment de la rédaction — nettement pire que les 876/3 rapportés en tête de
`comptes-mdp-api.md`. Un test pris isolément (`test_sweep.py::
test_null_coverage_comes_first`) passe seul : c'est la contamination croisée
avec les tests de F2 tournant en parallèle sur la même base `adscope_test`,
déjà documentée dans le rapport API (« Contamination croisée pendant les
tests »). Rien à faire côté web/extension ; signalé pour qu'Alexis ne
s'inquiète pas d'une régression que je n'ai pas causée (je n'ai pas touché à
`api/`).

## Décisions notables (au-delà du plan)

- **`onAuthenticated` relit `/v1/me`** après connexion, vérification ou
  réinitialisation plutôt que de faire confiance à l'adresse tapée dans un
  formulaire déjà quitté — une seule source de vérité pour l'identité
  affichée, comme avant ce lot.
- **La carte « vérifiez votre email » est un seul composant**
  (`signup.verifiezCard`), utilisée à l'identique après l'inscription et
  après un 403 de connexion : Karim ne voit jamais deux formulations du même
  écran.
- **`navCourante()` distincte de `route()`** dans `app.js` : `route()` sert à
  choisir *quelle vue rendre* et retombe sur « Mes suivis » par défaut (utile
  pour un hash de filtre inconnu) ; réutilisée telle quelle pour l'entête,
  elle aurait allumé « Mes suivis » sur la page Mon compte. Repéré à la
  capture d'écran, corrigé avant de livrer.
- **Mode démo systématiquement court-circuité avant tout réseau** dans
  `api-auth.js` (`isDemo() ? demo() : call(...)`), y compris sur les routes
  d'écriture (inscription, connexion…) : une capture ne doit jamais dépendre
  d'une route qui répond, ni risquer d'écrire dans la vraie base si quelqu'un
  clique pendant une démo.

## Réserves pour Alexis

1. **Captures à ×1, pas ×2** (voir plus haut) — cosmétique, à reprendre si
   besoin d'un support plus net.
2. **`api/` : 12 failed / 90 errors observés en lecture seule**, contamination
   croisée avec F2 documentée côté API — pas une régression de ce lot, à
   confirmer une fois les deux lots terminés et la suite relancée seule.
3. **Léger avertissement navigateur** sur le formulaire de changement de mot
   de passe (Mon compte) : Chrome recommande un champ email caché pour
   l'accessibilité des gestionnaires de mots de passe, absent ici (le
   formulaire n'a que les deux mots de passe). Cosmétique, aucun test ni
   ligne du plan ne l'exige — signalé, pas corrigé.
4. **Dette RGPD déjà portée par le rapport API** : pas de route de
   suppression de compte. Rien à ajouter côté site — aucune donnée neuve n'y
   transite (ni jeton, ni mot de passe, ni email en dehors du formulaire
   qu'on soumet) : le cookie de session reste la seule chose que le
   navigateur garde, comme avant ce lot.

## Hors lot (rappel, confirmé toujours hors périmètre)

Fournisseur d'email réel (go-live 2) · 2FA · connexion Google · suppression
de compte (dette RGPD, rapport API) · reprise des captures à ×2.
