# Audit offensif — authentification et sessions (API)

Dépôt `adscope`, branche `feat/api`, 2026-09-23. Angle : `accounts.py`,
`auth_signup.py`, `auth_email.py`, `passwords.py`, `login_tokens.py`,
`sessions.py`, `rate_limit.py`, `operator.py` (+ `auth.py`, `config.py`,
`auth_models.py`, lus pour le contexte).

Méthode : lecture intégrale des huit modules, puis quatorze sondes jouées avec
le `TestClient` de FastAPI sur une base isolée `adscope_auth_probe`, créée pour
l'audit et détruite ensuite. Aucun appel à l'API réelle, aucune requête vers un
service externe, aucune écriture dans la base `adscope`. Les sondes vivent dans
le bloc-notes de session (hors dépôt) ; leur contenu est repris ci-dessous
scénario par scénario.

Résultat : **14 sondes sur 14 confirment ce qu'elles cherchaient** — 12
trouvailles, dont 1 critique et 5 hautes. Deux contre-sondes rassurent :
l'usage unique du jeton tient sous concurrence (A10) et la réinitialisation
coupe bien les sessions ouvertes (A12).

| # | Gravité | Trouvaille | Fichier |
|---|---|---|---|
| 1 | critique | N'importe quelle clé de licence de marchand ouvre les files « réservées à l'opérateur » | `operator.py:32` |
| 2 | haute | Un jeton `verify` d'un tiers survit à tout et réinstalle SON mot de passe | `accounts.py:85` |
| 3 | haute | Le plafond de jetons en vol affame la victime, et la route répond « envoyé » | `login_tokens.py:42` |
| 4 | haute | `/v1/auth/password` n'a aucun limiteur : brute-force et amplificateur Argon2 | `auth_email.py:57` |
| 5 | haute | Dix mauvais mots de passe verrouillent un marchand nommé hors de son compte | `rate_limit.py:22` |
| 6 | haute | Derrière le proxy Render, le budget « par IP » est mutualisé : panne globale à 10 requêtes | `rate_limit.py:75` |
| 7 | moyenne | Le jeton de réinitialisation est stocké en clair dans `mails.text`, à côté de son empreinte | `accounts.py:40` |
| 8 | moyenne | Sans `ADSCOPE_PUBLIC_URL`, le cookie part sans `Secure` et les liens pointent vers localhost | `sessions.py:110` |
| 9 | moyenne | `/v1/auth/signup` énumère les adresses inscrites, mot pour mot | `accounts.py:58` |
| 10 | basse | `email_verified_at` est écrit et jamais relu : le 403 annoncé n'existe pas | `accounts.py:93` |
| 11 | basse | `forgot` et `resend` n'égalisent pas leur temps de réponse | `accounts.py:112` |
| 12 | basse | `login_tokens.mint` compte puis insère : le plafond de 5 se dépasse à plusieurs fils | `login_tokens.py:37` |

---

## 1 — critique — N'importe quelle clé de licence ouvre les files réservées à l'opérateur

**Fichier** : `api/adscope_api/operator.py:32-37`

```python
scheme, _, key = authorization.partition(" ")
if scheme.lower() == "bearer" and key:
    license_ = resolve(session, key, now)
    if license_ is None:
        raise HTTPException(status_code=401, detail="licence invalide")
    return license_          # ← aucun contrôle d'opérateur sur ce chemin
```

Le lot qui vient d'être livré (`eb875ec`, `a59f9d2`, `41a5880`) referme
`GET /v1/sweep` et `POST /v1/revisits` sur le compte opérateur… côté cookie
seulement. La branche `Bearer` rend la licence **sans jamais regarder à qui elle
appartient**. Or chaque marchand porte une clé de licence en clair dans son
extension (`crawler/.license` pour le crawler, `scripts/mint_license.py` imprime
la clé une fois pour les autres), et `accounts.signup` en frappe une par compte
créé (`accounts.py:54`).

**Scénario** : Karim, marchand légitime, lit sa clé `adsc_…` dans les réglages de
son extension et appelle `GET /v1/sweep` avec `Authorization: Bearer adsc_…`.
Il reçoit 200 et la file complète : pour **chaque recherche enregistrée de chaque
marchand**, l'URL leboncoin traduite — marque, modèle, tranche de prix,
département, nombre de pages attendu. Il apprend le périmètre commercial de tous
ses concurrents abonnés. Idem `POST /v1/revisits`.

Le test `tests/test_operator.py:55` couvre exactement ce trou en le prenant pour
la fonctionnalité : `test_a_license_key_passes_both_routes` vérifie qu'une clé
passe, sans distinguer la clé du crawler de celle d'un marchand.

**Preuve** — sonde A6 jouée, verte :

```python
raw = new_key()
session.add(License(key_hash=hash_key(raw), label="marchand", account_id=account.id))
headers = {"Authorization": f"Bearer {raw}"}
assert client.get("/v1/sweep", headers=headers).status_code == 200      # ✔
assert client.post("/v1/revisits", json={"site": "lbc"},
                   headers={**headers, **XA}).status_code == 200        # ✔
sign_in(client, session, account.id, clock.now)
assert client.get("/v1/sweep").status_code == 403   # le MÊME compte, par cookie
```

Le même compte est refusé par cookie et accepté par clé : la porte n'en est pas
une.

**Correctif** : sur la branche `Bearer` de `require_operator`, exiger que la
licence soit celle de l'opérateur — soit `license_.account` dont l'email passe
`_is_operator`, soit un marqueur explicite sur la licence (une colonne
`operator boolean` ou la réutilisation de `automated`, à décider, mais pas le
libellé — `auth.by_key_or_hash:36` explique déjà pourquoi le libellé ne désigne
rien). Une licence sans compte (la clé du crawler) doit être désignée
nommément, par empreinte en configuration (`ADSCOPE_CRAWLER_KEY_HASH`), pas
admise par défaut. Et corriger `test_operator.py:55` pour qu'il prouve le refus
d'une clé de marchand.

---

## 2 — haute — Le jeton `verify` d'un tiers survit à tout et réinstalle son mot de passe

**Fichiers** : `api/adscope_api/accounts.py:85-86`, `accounts.py:56-64`,
`accounts.py:126` et `accounts.py:139`

```python
# accounts.py:56-64 — signup
account = session.scalar(select(Account).where(Account.email == email))
if account.password_hash is not None:
    raise HTTPException(status_code=409, detail=ALREADY_EXISTS)
_send(..., pending_password_hash=hashed)      # compte sans mot de passe : on envoie

# accounts.py:85-86 — verify
if pending_password_hash is not None:
    account.password_hash = pending_password_hash   # écrase, sans condition
```

La revue précédente a bien fermé le détournement du lien de la victime (le mot
de passe voyage sur le jeton, `b7a00cc`). Ce qui reste ouvert est l'autre bout :
**le jeton de l'attaquant n'est jamais invalidé**. `reset_password:126` et
`change_password:139` ne périment que les jetons `purpose='reset'` ;
`verify:80-88` ne périme rien du tout. Un jeton `verify` vit donc ses soixante
minutes pleines, et le consommer écrase le mot de passe courant quel qu'il soit.

**Scénario** — le compte d'Alexis, créé par `attach_account.py` sans mot de passe :

1. Un tiers POSTe `/v1/auth/signup` avec `alexis@…` et le mot de passe `P`.
   Pas de 409 (`password_hash` est `NULL`) : un courriel « Vérifiez votre email »
   part **vers la boîte d'Alexis**, portant un lien qui installe `P`.
2. Alexis, qui ne comprend pas, s'inscrit lui-même avec `Q`. Deuxième courriel,
   mot pour mot identique au premier (`accounts.py:40` : « Bonjour, Suivez ce
   lien : … ») — rien ne les distingue, ni date ni objet ni corps.
3. Alexis clique le second : `Q` est posé, session ouverte. Tout va bien.
4. Une heure moins une minute plus tard, Alexis clique le premier courriel, en
   croyant purger sa boîte d'un doublon. Le mot de passe du compte redevient
   `P` — celui du tiers — et une session s'ouvre.
5. Le tiers se connecte avec `P`.

Même mécanique si Alexis avait changé son mot de passe entre-temps
(`change_password` laisse le jeton en vol, sonde A11) ou réinitialisé
(`invalidate_pending` ne touche pas `verify`).

**Preuve** — sondes A1 et A11 jouées, vertes :

```python
# A1
signup(client, password=ATTACKER_PWD)          # lien du tiers
signup(client, password=VICTIM_PWD)            # lien d'Alexis
assert written[0].replace(attacker_token, "") == written[1].replace(victim_token, "")
verify(client, victim_token)                   # 204, mot de passe = VICTIM_PWD
replay = verify(client, attacker_token)        # 204 — et non 400
assert "adscope_session=" in replay.headers["set-cookie"]
assert passwords.verify_password(account.password_hash, ATTACKER_PWD)
assert login(client, password=ATTACKER_PWD).status_code == 204

# A11 — même chose après un changement de mot de passe réussi
changed = client.post("/v1/auth/password", json={"current": VICTIM_PWD, ...})
assert changed.status_code == 204
assert still.used_at is None                   # le jeton du tiers est intact
assert verify(client, attacker_token).status_code == 204
```

**Correctif**, trois gestes qui vont ensemble :

1. `accounts.verify` doit périmer les autres jetons du compte avant de rendre la
   main : `login_tokens.invalidate_pending(session, account_id, "verify", now)`,
   et `reset_password`/`change_password` doivent périmer **`verify` autant que
   `reset`** (passer une liste d'usages, ou tous les usages).
2. `accounts.verify` doit refuser de poser un mot de passe sur un compte qui en
   a déjà un : si `account.password_hash is not None`, ne promouvoir rien (le
   jeton reste consommé, la session ne s'ouvre pas — 400 `BAD_TOKEN`).
3. Le courriel doit dire ce qu'il fait : « quelqu'un a demandé un mot de passe
   pour ce compte le 23/09 à 14 h 02 ; si ce n'est pas vous, ignorez ce
   message » — deux liens identiques dans une boîte ne se choisissent pas.

Plus profondément : une inscription sur une adresse qui a déjà un compte devrait
envoyer un courriel de *revendication* explicite, pas un « Vérifiez votre
email » indistinguable d'une inscription neuve.

---

## 3 — haute — Le plafond de jetons en vol affame la victime, et la route répond « envoyé »

**Fichiers** : `api/adscope_api/login_tokens.py:42`, `accounts.py:38-39`,
`auth_signup.py:67`

```python
# login_tokens.py:42
if pending >= MAX_PENDING:
    return None
# accounts.py:38-39
if token is None:
    return                      # plafond atteint — silence
# auth_signup.py:67
return {"sent": True}           # …et la route affirme le contraire
```

`MAX_PENDING = 5` est posé pour empêcher qu'on se serve de la boîte du marchand
comme mégaphone. Il se retourne : **c'est l'attaquant qui remplit les cinq
places**, et la victime n'a plus de place pour son propre lien pendant une heure.

**Scénario**, enchaîné avec la trouvaille 2 : le tiers POSTe cinq fois
`/v1/auth/signup` sur `alexis@…` avec son mot de passe `P` (le plafond du
limiteur est justement 5 par heure et par adresse, `rate_limit.py:23`). Cinq
courriels partent, cinq jetons en vol, tous porteurs de `P`. Alexis s'inscrit :
429, puis — autre IP, ou après le redémarrage qui remet `_hits` à zéro
(`rate_limit.py:11`) — **202 `{"sent": true}` et aucun courriel écrit**. Il
attend un lien qui n'arrivera pas, et clique finalement l'un des cinq qu'il a
reçus : tous installent `P`. « Renvoyer l'email » (`accounts.resend:71-74`)
renvoie lui aussi `P`, puisqu'il relit `latest_pending_password`.

**Preuve** — sonde A2 jouée, verte :

```python
for _ in range(login_tokens.MAX_PENDING):
    assert signup(client, password=ATTACKER_PWD).status_code == 202
assert len(mails(session)) == 5
assert signup(client, password=VICTIM_PWD).status_code == 429
limiter.reset()
answered = signup(client, password=VICTIM_PWD)
assert answered.status_code == 202 and answered.json() == {"sent": True}
assert len(mails(session)) == 5     # aucun courriel de plus
pending = session.scalars(select(LoginToken.pending_password_hash)).all()
assert all(passwords.verify_password(h, ATTACKER_PWD) for h in pending)
```

Le même mécanisme s'applique à `forgot` : cinq demandes d'un tiers et la victime
ne peut plus réinitialiser son mot de passe de l'heure — 429 d'abord
(`rate_limit.py:24`), puis silence plafonné.

**Correctif** : le plafond doit compter **par demandeur**, pas par compte — ou,
plus simplement, remplacer le plafond par un remplacement : une nouvelle demande
périme les jetons en vol du même usage et en frappe un seul (`MAX_PENDING = 1`
de fait). La boîte ne reçoit alors jamais plus d'un lien vivant, et le dernier
demandeur est toujours celui qui gagne — ce qui est aussi le comportement
attendu par un humain. Et une route qui n'a rien envoyé ne doit pas répondre
`{"sent": true}` : `202` avec `{"sent": false}` ne trahit rien (l'attaquant
savait déjà qu'il avait rempli le plafond) et évite d'égarer la victime.

---

## 4 — haute — `/v1/auth/password` n'a aucun limiteur

**Fichier** : `api/adscope_api/auth_email.py:56-68`

```python
@router.post("/v1/auth/password", status_code=204)
def post_change_password(payload: ChangeIn, request: Request, session=Depends(get_session),
                         now=Depends(now_utc), account_id=Depends(require_account_by_cookie)):
    error = policy_error(payload.password)          # ← aucun guard(...)
    ...
    accounts.change_password(session, account_id, payload.current, ...)
```

Six routes d'authentification appellent `guard` ; celle-ci est la seule qui ne
le fait pas. Or elle vérifie un mot de passe (`accounts.py:134` →
`passwords.verify_password`), donc elle coûte **un Argon2id complet par appel**,
soit ~60 ms de CPU et 64 MiB de mémoire au coût de production
(`passwords.py:25-27`).

Deux conséquences, la même requête :

- **Brute-force du mot de passe actuel.** Une session volée (cookie récupéré sur
  un poste partagé, ou ouverte par la trouvaille 2) ne permet pas, en théorie,
  de changer le mot de passe sans connaître l'actuel. Sans limiteur, elle le
  permet : essais illimités, aucun verrou, aucune trace.
- **Amplificateur de charge — exactement le D4 du plan.** Le service tourne en
  une seule instance (`rate_limit.py:11`). Un compte valide qui poste en boucle
  `/v1/auth/password` consomme 100 % du CPU en Argon2 : 16 requêtes
  concurrentes suffisent à saturer 1 Go de RAM (16 × 64 MiB) et à faire tomber
  l'API pour tous les marchands. Le commentaire d'en-tête d'`auth_signup.py`
  décrit ce risque mot pour mot ; la route voisine l'a oublié.

**Preuve** — sonde A14 jouée, verte :

```python
codes = set()
for i in range(50):
    codes.add(client.post("/v1/auth/password",
                          json={"current": f"essai-numero-{i}",
                                "password": "un-nouveau-mot-de-passe"},
                          headers=XA).status_code)
assert codes == {401}          # cinquante hachages, jamais un 429
```

**Correctif** : `guard("password", "", request, now)` en tête de route, avant
`policy_error` et avant le moindre hachage, avec un plafond serré — par exemple
`(None, 10, timedelta(minutes=15))` dans `LIMITS`, plus un plafond par compte
(la clé du limiteur peut être `f"account:{account_id}"`, disponible ici alors
qu'aucune autre route n'a de compte à ce stade). Et fermer toutes les autres
sessions au bout de N échecs, ou au moins écrire l'échec au journal.

---

## 5 — haute — Dix mauvais mots de passe verrouillent un marchand hors de son compte

**Fichiers** : `api/adscope_api/rate_limit.py:22` et `rate_limit.py:76-79`

```python
"login": (10, 30, timedelta(minutes=15)),      # 10 par email / 15 min
...
if per_email is not None and not limiter.hit(bucket, f"email:{email}", per_email, now, window):
    raise HTTPException(status_code=429, detail=RATE_LIMITED)
```

Le plafond par adresse est un plafond de **tentatives sur cette adresse**, pas
de tentatives *par* cette adresse : il compte les essais de l'attaquant et
refuse ensuite la victime. Dix requêtes toutes les quinze minutes — quarante par
heure, trivial — et le marchand ne peut plus se connecter, jamais, avec son bon
mot de passe. Aucun déverrouillage, aucun signalement, aucune page qui explique.
Il n'y a pas non plus de porte de secours : « mot de passe oublié » est plafonné
à 5/h par adresse (`rate_limit.py:24`), donc verrouillable de la même façon avec
cinq requêtes de plus.

**Scénario** : un concurrent connaît l'adresse professionnelle de Karim (elle est
sur son site). Il poste dix `/v1/auth/login` avec cette adresse et un mot de
passe au hasard, quatre fois par heure, depuis un script. Karim est dehors, et
sa réinitialisation aussi. Le budget par IP (30/15 min) laisse au concurrent
trois marchands simultanés depuis une seule adresse IP.

**Preuve** — sonde A4 jouée, verte :

```python
assert login(client).status_code == 204            # le bon mot de passe passe
limiter.reset()
for _ in range(10):
    assert login(client, password="peu-importe-quoi").status_code == 401
assert login(client).status_code == 429            # le BON mot de passe, refusé
```

**Correctif** : le plafond par adresse ne doit pas refuser une requête **qui
aurait réussi**. Deux façons, cumulables :

1. Vérifier le mot de passe d'abord et ne compter que les échecs — impossible
   ici sans rouvrir le D4 (hacher avant de compter).
2. Donc : garder le compteur par adresse, mais l'utiliser pour **ralentir** (un
   délai croissant, ou un défi) plutôt que pour refuser, et réserver le refus
   sec au couple (adresse, IP). Un attaquant depuis une IP n'épuise alors que
   son propre budget. C'est la clé `f"email:{email}|ip:{ip}"` qui manque.

Et remettre à zéro le compteur de l'adresse dès qu'une connexion réussit.

---

## 6 — haute — Derrière le proxy Render, le budget « par IP » est mutualisé

**Fichier** : `api/adscope_api/rate_limit.py:75`

```python
ip = request.client.host if request.client else "inconnu"
```

Le docstring de `guard` note la dette (« derrière un proxy sans
`proxy_protocol`, l'IP vue est celle du proxy et le plafond par IP devient
global »). La dette est plus lourde que « noté au rapport » : elle transforme un
limiteur de sécurité en **interrupteur d'arrêt du service**, actionnable par
n'importe qui, sans compte.

Sur Render, `request.client.host` vaut l'IP du routeur Render pour toutes les
requêtes (uvicorn n'accorde `X-Forwarded-For` qu'aux pairs listés par
`--forwarded-allow-ips`, `127.0.0.1` par défaut — et rien dans le dépôt ne fixe
la commande de lancement : pas de `Procfile`, pas de `render.yaml`). Tous les
marchands partagent donc un seul budget.

Les chiffres, lus dans `LIMITS` (`rate_limit.py:21-28`) :

- **10 POST `/v1/auth/signup`** ferment l'inscription pour tout le monde pendant
  une heure.
- **10 POST `/v1/auth/forgot`** ferment la réinitialisation pour tout le monde
  pendant une heure.
- **30 POST `/v1/auth/login`** ferment la connexion pour tout le monde pendant
  un quart d'heure — indéfiniment renouvelable.

Et si l'on corrige en posant `--forwarded-allow-ips='*'`, on passe au défaut
inverse : `X-Forwarded-For` devient une donnée du client, et le plafond par IP
disparaît complètement (un en-tête différent par requête).

**Preuve** — sondes A5 et A13 jouées, vertes. Le `TestClient` présente un seul
`client.host` pour toutes les requêtes : c'est exactement la situation derrière
le proxy.

```python
# A5
for i in range(30):
    assert login(client, email=f"marchand{i}@garage.fr").status_code == 401
assert login(client, email="encore-un-autre@garage.fr").status_code == 429

# A13
for i in range(10):
    assert signup(client, email=f"quelconque{i}@ailleurs.fr").status_code == 202
assert signup(client, email="karim@garage.fr").status_code == 429
for i in range(10):
    client.post("/v1/auth/forgot", json={"email": f"x{i}@ailleurs.fr"}, headers=XA)
assert client.post("/v1/auth/forgot", json={"email": EMAIL}, headers=XA).status_code == 429
```

**Correctif** : lire l'IP cliente par une fonction dédiée qui prend le **dernier
saut de confiance** de `X-Forwarded-For` et seulement quand la requête vient
bien du proxy — c'est-à-dire lancer uvicorn avec `--proxy-headers` et
`--forwarded-allow-ips` réglé sur le réseau de Render, et non `'*'`. Tant que ce
n'est pas fait, les plafonds par IP doivent être **hauts** (ils ne protègent
rien) et la protection réelle doit reposer sur la clé (adresse, IP) de la
trouvaille 5. Un test qui pose deux `client.host` différents et vérifie que les
budgets ne se mélangent pas garderait le correctif.

---

## 7 — moyenne — Le jeton de réinitialisation est stocké en clair, à côté de son empreinte

**Fichiers** : `api/adscope_api/accounts.py:40-41`, `auth_models.py:78-98`

```python
text = f"Bonjour,\n\nSuivez ce lien : {_link(kind, token)}\n\nL'équipe adscope."
mail_outbox.post(session, account_id, kind, subject, text, now)
```

`login_tokens` prend grand soin de ne garder que `hash_token(raw)`
(`login_tokens.py:45`), et le docstring d'`auth_models.py:8-11` en fait un
principe : « les deux secrets ne sont jamais enregistrés en clair ». La ligne
`mails` juste à côté enregistre le secret en clair, dans une colonne `text`, sans
purge et sans chiffrement.

**Scénario** : un accès en lecture seule à Postgres — une réplique, une
sauvegarde Render, un `SELECT` d'un script d'exploitation, ou la sortie de
`api/scripts/mail_outbox.py --tail` copiée dans un canal de discussion — donne
des liens de réinitialisation **fonctionnels** pour tous les comptes qui en ont
demandé un dans la demi-heure, et des liens de vérification pour l'heure. Une
requête, `SELECT text FROM mails ORDER BY id DESC`, et l'on prend la main sur
ces comptes : `reset_password` pose un nouveau mot de passe, ferme toutes les
sessions et en ouvre une.

**Preuve** — sonde A9 jouée, verte :

```python
client.post("/v1/auth/forgot", json={"email": EMAIL}, headers=XA)
body = mails(session)[-1]
raw = token_of(body)
stored = session.get(LoginToken, sessions_mod.hash_token(raw))
assert stored is not None and stored.purpose == "reset"
assert raw in body                    # le clair et l'empreinte cohabitent
assert client.post("/v1/auth/password/reset",
                   json={"token": raw, "password": "un-tout-autre-mot"},
                   headers=XA).status_code == 204
```

**Correctif** : ne pas garder le corps. `mails` devient une trace d'envoi
(compte, nature, objet, date, état), et le corps se reconstruit à la demande
pour l'affichage de développement — ou, si `--tail` doit continuer de montrer le
lien, supprimer la ligne `mails` dès que son jeton est consommé ou périmé, et
purger la table à chaque `invalidate_pending`. Au go-live 2, quand
`mail_outbox.post` sera remplacé par un fournisseur (`mail_outbox.py:8`), ne pas
reporter le corps dans la base.

---

## 8 — moyenne — Sans `ADSCOPE_PUBLIC_URL`, le cookie part sans `Secure`

**Fichiers** : `api/adscope_api/sessions.py:110-118`, `config.py:23-24`

```python
def is_secure() -> bool:
    return public_url().startswith("https://")
# config.py:24
return os.environ.get("ADSCOPE_PUBLIC_URL", "http://localhost:8000").rstrip("/")
```

Le choix de ne pas lire la requête est le bon. Ce qui manque est le garde-fou :
si la variable n'est pas posée sur Render — un oubli de tableau de bord, une
faute de frappe dans le nom, un service recréé —, l'API démarre sans broncher,
le cookie de session part **sans `Secure`** (donc rejouable sur un
`http://` intercepté), et les liens envoyés par courriel pointent vers
`http://localhost:8000/app/#/…`, c'est-à-dire nulle part. Rien dans le code ne
signale l'écart, et rien dans le dépôt ne fixe la variable.

**Preuve** — sonde A8 jouée, verte :

```python
monkeypatch.delenv("ADSCOPE_PUBLIC_URL", raising=False)
header = client.post("/v1/auth/verify", json={"token": ...}, headers=XA).headers["set-cookie"]
assert "Secure" not in header
assert "HttpOnly" in header and "SameSite=lax" in header
assert "http://localhost:8000/app/#/" in mails(session)[-1]
```

En-tête observé :
`adscope_session=…; HttpOnly; Max-Age=7776000; Path=/; SameSite=lax`.
`HttpOnly` et `SameSite=lax` sont bien là ; seul `Secure` manque, et il manque
silencieusement.

**Correctif** : refuser de démarrer si `ADSCOPE_PUBLIC_URL` n'est pas posée
quand un marqueur d'environnement dit « production » (`RENDER`,
`ADSCOPE_ENV=prod`) — un `raise` au chargement de `main.py` vaut mieux qu'un
cookie clair. À défaut, inverser le défaut : `https://` obligatoire, et
`http://localhost:8000` seulement si `ADSCOPE_ENV=dev` est explicite.

---

## 9 — moyenne — `/v1/auth/signup` énumère les adresses inscrites

**Fichier** : `api/adscope_api/accounts.py:56-58`

```python
if account.password_hash is not None:
    raise HTTPException(status_code=409, detail=ALREADY_EXISTS)
```

Le reste du parcours est soigneusement muet : `resend` répond 202 sur une
adresse inconnue (`accounts.py:67-70`), `forgot` aussi (`accounts.py:112-116`),
`login` égalise même son temps de réponse par `waste_time` (`passwords.py:69`).
L'inscription, elle, dit tout : 409 « Un compte existe déjà avec cet email » sur
une adresse inscrite, 202 sur une inconnue.

**Scénario** : un concurrent veut savoir lesquels des vingt garages de son
département sont clients d'adscope. Il poste vingt `/v1/auth/signup` avec leurs
adresses professionnelles publiques et un mot de passe quelconque ; les 409
répondent. Le limiteur ralentit (10/h par IP, `rate_limit.py:23`) sans empêcher :
deux heures suffisent, et il apprend au passage que les adresses en 202 existent
peut-être sans mot de passe (trouvaille 2, qui devient alors ciblée).

Effet de bord désagréable : les vingt garages non inscrits reçoivent chacun un
courriel « Vérifiez votre email » d'un service qu'ils n'ont pas demandé.

**Preuve** — sonde A3 jouée, verte :

```python
known = signup(client, email="inscrit@garage.fr")
unknown = signup(client, email="jamais-vu@garage.fr")
assert known.status_code == 409
assert known.json() == {"detail": accounts.ALREADY_EXISTS}
assert unknown.status_code == 202
```

**Correctif** : répondre 202 `{"sent": True}` dans les deux cas, et envoyer à
l'adresse inscrite un courriel « vous avez déjà un compte, voici le lien de
connexion / de réinitialisation ». C'est la forme standard, elle n'énumère rien
et elle rend mieux service que le 409 : celui qui s'inscrit deux fois par
inadvertance reçoit la marche à suivre au lieu d'un refus. À combiner avec la
trouvaille 2 : ce courriel-là doit être un courriel de revendication, distinct du
« Vérifiez votre email ».

---

## 10 — basse — `email_verified_at` est écrit et jamais relu

**Fichiers** : `api/adscope_api/accounts.py:91-96`, `auth_models.py:40-42`,
`tests/test_auth_signup.py:42-43`

`auth_models.py:40-42` annonce : « `NULL` = email non vérifié : la connexion par
mot de passe le refuse (403) tant que le lien n'a pas été suivi. » Le commentaire
de `tests/test_auth_signup.py:42` va plus loin et cite le code :
« Fait rougir `if account.email_verified_at is None: raise HTTPException(403, …)`
dans `accounts.login` ». **Ce code n'existe pas.** `grep email_verified_at` sur
`adscope_api/` rend trois occurrences : la migration, l'écriture
(`accounts.py:87`) et la déclaration de colonne. Aucune lecture.

Le 403 observé par le test vient d'ailleurs : avant le clic, `password_hash` est
`NULL`, donc `login` tombe dans la branche « mot de passe en attente »
(`accounts.py:102-106`). L'invariant tient par coïncidence.

**Scénario** : le jour où un chemin pose un `password_hash` sans passer par
`verify` — un script de reprise, une importation de comptes, une migration qui
« rétro-marque » (la migration 014 s'en garde explicitement,
`migration_sql_passwords.py:5-6`, mais la suivante ?), ou simplement la
trouvaille 2 corrigée par le geste 2 ci-dessus — la connexion ouvre une session
sur une adresse dont personne n'a prouvé la possession. La colonne qui devait
l'empêcher est là, pleine ou vide, et personne ne la regarde.

**Preuve** — sonde A7 jouée, verte :

```python
account = passwordless(session)
account.password_hash = passwords.hash_password(VICTIM_PWD)
session.commit()
assert account.email_verified_at is None
assert login(client).status_code == 204        # session ouverte, email non vérifié
```

**Correctif** : ajouter le contrôle annoncé dans `accounts.login`, en tête de la
branche « mot de passe actif » — `if account.email_verified_at is None: raise
HTTPException(403, NOT_VERIFIED)` — et un test qui pose l'état directement en
base (comme la sonde) plutôt que de passer par l'inscription, sinon il
continuera de passer pour la mauvaise raison. Corriger au passage le commentaire
de `test_auth_signup.py:42`, qui décrit du code absent.

---

## 11 — basse — `forgot` et `resend` n'égalisent pas leur temps de réponse

**Fichiers** : `api/adscope_api/accounts.py:67-74` et `accounts.py:112-116`

`login` paie explicitement le prix d'un Argon2 bidon pour ne rien dire de
l'existence de l'adresse (`passwords.waste_time`, `passwords.py:62-70`).
`forgot` et `resend` ne font rien de tel : sur une adresse inconnue ou sans mot
de passe, la fonction rend la main immédiatement ; sur une adresse inscrite, elle
compte les jetons en vol, en insère un, insère une ligne `mails`, et le `commit`
de la route écrit deux lignes. La différence n'est pas un hachage, mais elle est
réelle et répétable — deux `INSERT` et un `COMMIT` contre un `SELECT` seul.

**Preuve** : par lecture. Non mesurée : les sondes tournent avec un hacheur au
rabais et un Postgres local, où le bruit dépasse l'écart ; une mesure honnête
demanderait le coût de production et une centaine d'échantillons.

**Correctif** : sur le chemin « rien à faire », faire le même travail à vide —
au minimum un `waste_time()`, qui domine largement deux `INSERT` et rend l'écart
inobservable. C'est déjà le choix fait pour `login` ; il suffit de l'étendre.

---

## 12 — basse — `login_tokens.mint` compte puis insère

**Fichier** : `api/adscope_api/login_tokens.py:37-48`

```python
pending = session.scalar(select(func.count())...)
if pending >= MAX_PENDING:
    return None
session.add(LoginToken(...))
```

Lire puis écrire, sans verrou ni contrainte : c'est le motif que `consume`
(`login_tokens.py:51-69`) prend soin d'éviter par `UPDATE … RETURNING`, et que le
docstring commente longuement. Deux requêtes concurrentes lisent chacune
`pending = 4` et insèrent : six jetons en vol pour un plafond de cinq.

**Scénario** : l'attaquant de la trouvaille 3 pousse le nombre de courriels
au-delà du plafond en postant ses inscriptions en parallèle plutôt qu'en série,
et transforme la boîte du marchand en mégaphone — ce que `MAX_PENDING` était
censé empêcher (`login_tokens.py:20-21`). L'ampleur reste bornée par le limiteur
(5/h par adresse), donc l'effet est modeste : quelques courriels de plus.

**Preuve** : par lecture. Le dépassement est de la même nature que celui que
`consume` évite ; je n'ai pas joué la sonde à fils parce que le gain d'un jeton
ou deux ne change pas le verdict de la trouvaille 3, et que le correctif est le
même que celui proposé là (remplacer le plafond par un remplacement, qui
s'exprime en un seul `UPDATE … ; INSERT`).

**Correctif** : compter et insérer en une instruction (`INSERT … SELECT … WHERE
(SELECT count(*) …) < 5`), ou périmer-puis-insérer, ce qui rend le plafond
inutile.

---

## Contre-sondes : ce qui tient

Deux points que je cherchais à casser et qui résistent — à garder tels quels.

**A10 — l'usage unique du jeton tient sous concurrence.** `login_tokens.consume`
(`login_tokens.py:63-68`) marque et lit en un seul `UPDATE … RETURNING` ;
Postgres sérialise les écritures concurrentes sur la ligne et, en `READ
COMMITTED`, les perdantes réévaluent `used_at IS NULL` après le commit de la
gagnante. Huit fils lâchés sur une barrière, sur de vraies connexions
distinctes : **un seul** obtient le jeton, aucune erreur.

```python
errors = concurrently(8, work)
assert errors == []
assert len(won) == 1
```

**A12 — la réinitialisation coupe bien les sessions ouvertes.**
`accounts.reset_password:127` appelle `sessions.close_all`, qui supprime toutes
les lignes du compte (`sessions.py:90-91`). La session ouverte par un jeton
détourné (trouvaille 2) meurt dès que la victime réinitialise son mot de passe —
c'est la seule reprise en main qui marche aujourd'hui, et elle marche.

```python
assert session.get(SessionToken, sessions_mod.hash_token(stolen)) is None
```

Sont également corrects, par lecture : `check_csrf` couvre `POST`/`PUT`/`DELETE`
et aucune route `PATCH` n'existe (vérifié par `grep` sur `adscope_api/`) ; le
secret de session ne rencontre aucune comparaison octet par octet
(`sessions.py:42-43`, clé primaire sur l'empreinte) ; les liens portent le jeton
dans le *fragment*, que le navigateur n'envoie ni au serveur ni dans un
`Referer` (`accounts.py:30-32`) ; les paramètres Argon2id sont explicites et
solides (t=3, m=64 MiB, p=4 — `passwords.py:25-29`), au-dessus des
recommandations OWASP, et `verify_password` attrape `InvalidHashError` pour ne
pas rendre un 500 sur une colonne abîmée ; le limiteur tranche bien avant tout
hachage sur les six routes qui l'appellent ; aucun mot de passe ni jeton n'est
journalisé (aucun `print`, `logging` ni `repr` dans les huit modules).

---

## Ordre de traitement suggéré

1. **Trouvaille 1** (critique) — une ligne de code, elle referme une fuite de
   données entre marchands qui est déjà ouverte en l'état.
2. **Trouvailles 2 et 3** ensemble (prise de compte) — même correctif de fond :
   un seul jeton vivant par compte et par usage, périmé par tout changement de
   mot de passe, et un courriel qui dit ce qu'il fait.
3. **Trouvaille 4** (`guard` manquant) — une ligne, avant la mise en ligne.
4. **Trouvailles 5 et 6** ensemble (limiteur) — à traiter avant Render, sans
   quoi le limiteur est à la fois contournable et retournable contre le service.
5. **Trouvailles 7 à 9** — go-live 1.
6. **Trouvailles 10 à 12** — dette propre, à inscrire au lot suivant.

---

*Base de sonde `adscope_auth_probe` créée pour cet audit et détruite à la fin.
Aucune écriture dans `adscope`, aucun appel à l'API réelle, aucune licence ni
compte réel manipulé, aucune requête vers un service externe.*
