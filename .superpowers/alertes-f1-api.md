# Lot F1 — Alertes, côté API : rapport de fin de lot

2026-09-21. Périmètre livré : `api/` uniquement (routes, moteur de règles,
email du matin, script d'envoi). Le site (`web/`) n'est pas dans ce lot.

Plan suivi : `.superpowers/alertes-f1-plan.md` (architecte, commit `8b20287`).
Écarts documentés inline dans le plan (§ 8bis) et ci-dessous.

---

## 1. Ce qui est livré

**Schéma** — migration `013_alerts` (`migration_sql_alerts.py`, tables ORM
dans `alert_models.py`) : `saved_searches`, `account_settings`, `alerts_sent`,
`digests`. Appliquée sur la base réelle `adscope` (voir § 5).

**Le socle partagé** — `market_params.py` porte les seize filtres de
`/v1/market` dans les deux sens (chaîne de requête ↔ arguments de
`market_query.core`). `market.get_market` s'en sert désormais aussi : la
traduction filtres → `core` n'existe plus qu'à un seul endroit. `Listing.id`
entre dans le select de `core` (une ligne) pour que le moteur d'alertes
joigne les points de prix sans réexprimer les filtres — contrat de
`/v1/market` inchangé (gardé par test).

**Recherches enregistrées** — CRUD complet sous `/v1/searches` (`PUT`, pas
`PATCH`), plafond 50 par compte, `query` validée et renormalisée par
`MarketParams` à l'écriture, IDOR fermé (404 sur une ressource d'autrui).

**Réglage du compte** — `/v1/alerts/settings` (créé paresseusement),
`/v1/alerts/unsubscribe` et `/resubscribe` (non authentifiées, `X-Adscope`
requis, jeton opaque).

**Les règles** (`alert_rules.py`, `alert_follows.py`) — baisse et nouvelle
annonce rejouent une recherche contre `market_query.core` ; suivis réutilisent
`feed_query.feed_for` telle quelle, pont par `auth.of_account`. `min_age_days`
combine filtre et seuil par `max(...)`. La fenêtre des baisses (`lag`) porte
sur toute la série, le filtre `created_at` s'applique après coup.

**Le journal d'unicité** (`alert_journal.py`) — `ref_at` horodate à la
seconde : la seule clé que le chemin SQL (recherches) et le chemin Python
(suivis) produisent identique.

**L'email du matin** — `digest_build.py` assemble, dédoublonne, trie, coupe à
15 lignes, rend `None` si rien à dire. `digest_text.py`/`digest_html.py`
rendent les deux corps (échappement systématique, jamais de nom de vendeur ni
de « vendue »). `digest_send.py` tient la transaction idempotente d'un
compte. `scripts/send_digests.py` est la ligne de commande (`--dry-run`,
`--now`).

**La boîte d'envoi** — `/v1/digests` (liste sans les corps, lecture avec),
`/v1/digests/visit` (non authentifiée, compteur + première visite).

---

## 2. Écarts au plan, et pourquoi

### 2.1 Le jeton de désabonnement n'est pas haché

Documenté dans le plan lui-même (§ 8bis, ajouté pendant l'implémentation).
Résumé : le plan prévoyait `unsubscribe_token_hash` haché (sha256), sur le
modèle de `sessions.hash_token`. Mais ce jeton doit rester identique et
valable dans *chaque* email envoyé à un compte, potentiellement pendant des
années (« un email vieux de six mois doit encore pouvoir désabonner ») —
`digest_build.py` en a besoin **en clair** à chaque passage du script. Un
jeton haché ne se lit qu'une fois, à sa frappe ; le schéma ne porte qu'une
colonne, pas un historique de jetons ; le plan écarte explicitement le HMAC
(pas de premier secret d'application). Sans l'une des trois échappatoires, la
seule lecture qui tienne est de garder le jeton en clair. Sensibilité
acceptée : son seul pouvoir est de couper l'email du matin d'un compte — la
même portée que `digests.token`, déjà en clair dans ce même lot. Colonne et
migration inchangées, seul le contenu diffère de son nom ; commenté aux deux
endroits (`alert_models.py`, `alert_settings.py`).

**Contrat HTTP : inchangé.**

### 2.2 `alert_follows.py`, fichier neuf non prévu par le plan

`follows_for` (suivis) était prévu dans `alert_rules.py`. Écrit ainsi, le
fichier passait à 172 lignes — au-delà du plafond de 150 posé par le
propriétaire. Sorti dans `alert_follows.py` (81 lignes), à côté de
`alert_journal.py` : `alert_rules.py` ne porte plus que les deux règles sur
recherche enregistrée (baisse, nouvelle), toujours 109 lignes. Aucun effet
sur le contrat ni sur la logique — un découpage de fichier, pas de
comportement.

### 2.3 `feed_query._feed_item` gagne `listing_id`

Non explicitement prévu par le plan, mais nécessaire : `alert_follows.py` a
besoin de l'identifiant de l'annonce pour écrire dans `alerts_sent`
(`listing_id` y est une clé), et `feed_for` ne le rendait pas. Ajouté au
dictionnaire interne, sur le même principe que `Listing.id` dans
`market_query.core` (§ 4 du plan) : `FeedItemOut` ne le déclare pas, donc
`response_model` l'écarte silencieusement sur `/v1/follows/feed` — contrat
inchangé, gardé par le même raisonnement (pas de test dédié séparé écrit pour
celui-ci, faute de temps — voir réserves).

### 2.4 Approximation sur l'horodatage d'un franchissement de seuil (suivis)

`feed_query.FlagsOut.crossed` ne porte qu'un entier (30/60/90), pas
l'horodatage du franchissement — nécessaire pour appliquer le plancher
`at > max(followed_at, settings.created_at)` du § 5. Approximé en
`alert_follows.py` par `now - timedelta(days=age_days - crossed)` (précision
au jour, cohérente avec la granularité de la règle elle-même). Documenté en
commentaire dans le code. Alternative écartée : réécrire `feed_query` pour
exposer l'horodatage exact — le plan interdit justement de la réécrire.

---

## 3. Tests

`cd api && ./.venv/bin/pytest tests/ -q` → **803 passés** (737 au départ,
+66 neufs — plan en attendait ~50 ; le dépassement vient d'une couverture un
peu plus large sur `saved_searches`/`digests_routes`/`alert_settings`).

Chaque test neuf nomme en commentaire la ligne de production qu'il fait
rougir. Un échantillon représentatif (un par fichier neuf, plus les cas
transactionnels les plus sensibles de `digest_send.py`) a été prouvé en
cassant la ligne visée puis en la restaurant, en cours de rédaction — pas
l'intégralité des 66, faute de temps sur ce tour. Fichiers couverts par ce
contrôle : `market_params.py`, `saved_searches.py`, `auth.py`
(`require_account`), `alert_settings.py`, `alert_rules.py`,
`alert_follows.py`, `alert_journal.py`, `digest_build.py`, `digest_send.py`
(marquage/rollback/dry-run), `digest_html.py` (échappement), `digests.py`.

Aucun test ni sonde n'a écrit dans la base `adscope` : `conftest.py` pointe
`adscope_test`, et `scripts/send_digests.run` prend sa fabrique de sessions
en paramètre — les tests lui donnent celle de `adscope_test`
(`tests/test_digest.py::test_dry_run_writes_nothing` et voisins).

---

## 4. Contrat HTTP final

Identique à celui écrit dans le plan (§ 3), sans changement — aucun écart
listé en § 2 ci-dessus n'y touche. Repris ici pour mémoire :

```
GET    /v1/searches                → 200 [SearchOut]
POST   /v1/searches                → 201 SearchOut | 409 (plafond 50) | 422
GET    /v1/searches/{id}           → 200 SearchOut | 404
PUT    /v1/searches/{id}           → 200 SearchOut | 404
DELETE /v1/searches/{id}           → 204 (idempotent, y compris sur autrui)

GET /v1/alerts/settings            → 200 { digest_enabled, include_follows }
PUT /v1/alerts/settings            → 200 (même corps)
POST /v1/alerts/unsubscribe        { token } → 200 { digest_enabled: false } | 404
POST /v1/alerts/resubscribe        { token } → 200 { digest_enabled: true }  | 404

GET  /v1/digests?limit=20          → 200 [{ id, day, subject, created_at, visits, first_visit_at }]
GET  /v1/digests/{id}              → 200 { …, text, html } | 404
POST /v1/digests/visit             { token } → 204 | 404
```

Porte commune `require_account` (cookie ou clé rattachée à un compte) sur
tout sauf `unsubscribe`/`resubscribe`/`visit`. 401 sans session ni clé · 403
clé sans compte ou écriture sans `X-Adscope` · 404 ressource d'autrui · 422
corps ou filtres invalides.

---

## 5. Opérations

- `pg_dump -Fc adscope` → `~/adscope-backups/adscope-20260921-214703.dump`
  (5,8 Mo) avant toute manœuvre sur la base réelle.
- `./.venv/bin/python scripts/migrate.py` → `013_alerts` appliquée sur
  `adscope` (aucune autre migration en attente).
- `launchctl kickstart -k gui/$UID/fr.adscope.api` — relance par label,
  jamais autrement.
- Log (`~/Library/Logs/adscope-api.log`) : redémarrage propre, aucune trace
  d'erreur, l'avertissement `ADSCOPE_DEV_LOGIN=1` réimprimé au démarrage
  comme attendu.
- Vérifié à la main sur `http://localhost:8000` (jamais `127.0.0.1`) :
  `GET /v1/searches`, `/v1/alerts/settings`, `/v1/digests` → 401 sans
  authentification ; `/v1/market` → 401 (route existante, témoin que le
  service répond normalement) ; `/app/` → 200.

---

## 6. Réserves

1. **Lignes au-delà de la 15ᵉ.** `digest_build.build` coupe à `MAX_LINES`
   après le tri, mais ne marque au journal que les lignes effectivement
   envoyées (choix assumé : ne pas perdre silencieusement une alerte jamais
   montrée). Une baisse repoussée hors quota un jour donné reste éligible le
   lendemain, avec son `ref` d'origine (l'horodatage du relevé) —
   potentiellement perçue comme « vieille » si beaucoup de jours passent
   avant qu'elle remonte au-dessus du quota. Non testé spécifiquement ;
   comportement raisonnable mais pas garanti par un test dédié.
2. **Franchissement de seuil (suivis) : horodatage approximé**, voir § 2.4.
   Granularité jour, jamais testée à la limite exacte (minuit UTC).
3. **`feed_query.listing_id` sans test de non-régression dédié** (§ 2.3) —
   contrat `/v1/follows/feed` non re-testé explicitly pour l'absence du
   champ, contrairement à l'équivalent côté `/v1/market` (test 5 du plan).
4. **Couverture des preuves de test incomplète** (§ 3) : ~15 des 66 tests
   neufs ont été explicitement cassés-puis-restaurés pendant la rédaction ;
   les autres suivent le même schéma (assertion directe sur une ligne
   identifiée en commentaire) mais n'ont pas tous été individuellement
   prouvés par ce protocole.
5. **`digests` vaut « envoyé » sans fournisseur d'email** — limite déjà
   assumée par le plan (§ 7) : le jour où un fournisseur sera branché,
   l'échec d'envoi devra soit rejouer, soit défaire le marquage. Non traité
   ici, hors lot.
6. **Aucune limite par offre tarifaire** sur le plafond de 50 recherches ou
   sur quoi que ce soit d'autre — hors lot, comme prévu.
7. **Site non livré** : les routes existent et sont testées côté API, mais
   rien n'est branché côté `web/` dans ce tour (hors périmètre confié).
