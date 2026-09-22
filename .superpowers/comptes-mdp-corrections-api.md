# Comptes avec mot de passe — corrections de relecture (côté API)

Suite à `.superpowers/comptes-mdp-api.md` : la relecture a refusé le lot sur
deux bloquants (prise de compte) et signalé sept mineurs. Périmètre de cette
passe : `api/` et ce rapport, comme demandé.

## Statut

Fait. Les deux bloquants et cinq des sept mineurs sont corrigés, prouvés par
sonde (cassée puis restaurée) avant d'écrire le correctif définitif. Deux
mineurs sont documentés mais non traités (voir « Non traité »). Migration
`015_login_tokens_pending_password` appliquée sur `adscope` (DB réelle),
service redémarré, tests verts. Comptes de départ pris avant toute
modification : **880 verts** (`cd api && ./.venv/bin/pytest tests/ -q`) — ce
chiffre inclut déjà le balayage F2 (`e034dcc`, terminé juste avant que cette
passe démarre).

## Bloquants corrigés

### 1. Prise de compte par jeton concurrent

**Le trou** : `account.pending_password_hash` était une case unique du
compte. Plusieurs jetons `verify` pouvaient être en vol en même temps
(`MAX_PENDING=5`) sans qu'aucun ne sache quel mot de passe il portait — le
clic sur N'IMPORTE LEQUEL promouvait la dernière valeur écrite dans cette
case, pas forcément celle correspondant au jeton cliqué. Sonde de la
relecture reproduite telle quelle par
`test_a_concurrent_signup_cannot_hijack_the_original_link` puis
`test_a_concurrent_signup_cannot_hijack_a_passwordless_accounts_link` (cas
Alexis) : cassées en revenant à la case partagée, les deux tombaient
exactement comme décrit (« VICTIME OK ? False »).

**Le correctif** : le mot de passe voyage désormais sur la ligne
`login_tokens` elle-même (nouvelle colonne `pending_password_hash`,
migration 015), posé par `login_tokens.mint` au moment de la frappe et rendu
par `login_tokens.consume` en même temps que le compte. `accounts.verify`
promeut le mot de passe **du jeton qu'il vient de brûler**, jamais une case
partagée. Une inscription concurrente sur la même adresse mint un second
jeton avec SON propre mot de passe, sans toucher au premier : cliquer son
propre lien active toujours son propre mot de passe, quel que soit ce qui
s'est passé entre-temps sur la même adresse.

Résidu accepté, hors correctif (comportement inhérent à une inscription
ouverte sur adresse existante, pas à ce bug précis) : si Karim n'a **jamais**
initié sa propre inscription et clique malgré tout sur un lien de
vérification envoyé par l'inscription de quelqu'un d'autre sur son adresse,
ce clic active le mot de passe de cet autre. C'est un clic non sollicité, pas
un jeton détourné — même limite que n'importe quel « créer un compte » ouvert
sur une adresse existante. Digne d'un futur lot si jugé nécessaire (par
exemple : ne jamais renvoyer de lien de vérification sur une adresse déjà
`email_verified_at IS NOT NULL` sans repasser par « mot de passe oublié »).

### 2. Connexion sans clic sur un mot de passe en attente

**Le trou** : `accounts.login` lisait `password_hash or pending_password_hash`
et ne gardait comme garde-fou que `email_verified_at IS NOT NULL`. Or ce
champ pouvait être vrai sans rapport avec le mot de passe fraîchement posé
(état hérité : la migration 014 requalifie les anciens jetons de lien
magique en `purpose='verify'`, et `accounts.verify` posait déjà
`email_verified_at` même sans mot de passe en attente). Une inscription sur
une telle adresse ouvrait donc une session en `204`, sans aucun clic. Sonde
reproduite par `test_login_never_opens_a_session_on_a_pending_password_alone`
(cassée en réintroduisant la lecture du mot de passe en attente à la
connexion : tombe bien en `204`, comme la sonde de la relecture).

**Le correctif** : `accounts.login` ne lit plus jamais `pending_password_hash`
pour ouvrir une session — seul `password_hash` (posé uniquement par un clic
réel, désormais toujours en même temps que `email_verified_at` grâce au
correctif n°1) peut en ouvrir une. Le message « vérifiez votre email » reste
rendu (`403`, message inchangé, testé par
`test_login_is_refused_before_verification`) : le mot de passe en attente
sert encore à choisir CE message plutôt que « email ou mot de passe
incorrect », mais ne rend plus jamais de session — la distinction entre les
deux 4xx ne fuit donc rien de plus qu'avant, elle n'ouvre juste plus rien.

## Mineurs corrigés

- **Email non validé** (`auth_signup.py`) : `EmailIn.email` passe de `str` à
  `pydantic.EmailStr` (dépendance `email-validator`, ajoutée par `uv add`
  depuis `api/`, vérifiée hors-ligne — pas de résolution DNS, testé). `""`,
  `"  "`, `"pas-une-adresse"`, `"a@"` rendent `422` sans toucher la base.
  Test : `test_a_malformed_email_is_refused_before_creating_an_account`.
- **`verify_password` sur un hash corrompu** (`passwords.py`) : attrape aussi
  `argon2.exceptions.InvalidHashError`, qui n'est **pas** une sous-classe de
  `VerifyMismatchError` ni de `VerificationError` (vérifié : la relecture
  citait `VerificationError` comme « classe mère », ce qui est inexact —
  `InvalidHashError` hérite de `ValueError`, pas de `Argon2Error`). Test :
  `test_a_corrupted_hash_is_refused_not_a_crash`.
- **Jetons de réinitialisation survivants** : `login_tokens.invalidate_pending`
  (nouvelle fonction) périme tout jeton `reset` encore en vol pour le compte ;
  appelée par `accounts.reset_password` et `accounts.change_password`. Tests :
  `test_reset_invalidates_the_other_outstanding_reset_links`,
  `test_change_invalidates_an_outstanding_reset_link`.
- **`/v1/auth/password` ouvert aux clés machine** : nouvelle dépendance
  `auth.require_account_by_cookie` (cookie de session seulement, jamais de
  `Bearer`) remplace `require_account` sur cette route. Corrige au passage le
  `close_others` qui fermait toutes les sessions en chemin `Bearer` (le
  cookie est maintenant garanti présent et valide avant d'y arriver). Test :
  `test_change_is_refused_for_a_machine_key_even_one_attached_to_the_account`
  (rejoue la sonde exacte : une clé de licence rattachée au compte).
- **`rate_limit._hits` non borné** : `Limiter.hit` balaie `_hits` à chaque
  appel et purge les clés dont la plus récente entrée dépasse la fenêtre la
  plus large (`MAX_WINDOW`, 60 min). Gratuit (le balayage se fait de toute
  façon à chaque requête gardée), une clé morte ne survit jamais plus d'un
  appel d'écart. Test : `test_a_stale_entry_is_purged_after_the_widest_window`.

## Mineurs non traités

- **`passwords.MAX_LENGTH`/`TOO_LONG` inatteignable par HTTP** : corrigé en
  élargissant le plafond `pydantic` des champs mot de passe (128 → 256,
  `PASSWORD_FIELD_MAX` dans `auth_signup.py`) : `policy_error` reçoit
  maintenant les mots de passe de 129 à 256 caractères et rend son message
  français ; au-delà de 256, `pydantic` coupe toujours en premier (borne dure
  contre un corps énorme), avec son message générique — jugé acceptable, ce
  cas est hors de la plage réaliste.
- **Liste des mots de passe courants** : vérifiée, pas seulement corrigée à
  l'aveugle. Le chiffre de la relecture (« aucun classique français au-delà
  d'azertyuiop ») est inexact — `motdepasse`, `motdepasse1`, `bonjour123`,
  `bienvenue1`, `marseille1`, `garage1234` sont déjà présents et font tous
  ≥ 10 caractères (donc effectifs, MIN_LENGTH=10). Le constat sur le
  gâchis reste vrai (44 des 100 entrées font < 10 caractères, jamais
  atteintes) : deux entrées manquantes et réellement longues ajoutées
  (`azertyuiop123`, `12345678910`) ; le grand nettoyage des entrées mortes
  n'a pas été fait (dépasserait la marge « dix lignes », aucun risque de
  sécurité derrière, juste de la clarté).
- **Longueur des fichiers de test** : `test_auth_signup.py` était déjà à 173
  lignes avant cette passe (signalé par la relecture) ; il en compte 238
  après — les tests neufs exigés par les deux bloquants (quatre tests) et
  deux mineurs (deux tests) y sont allés, aucun autre fichier ne convenait
  mieux (même sujet : inscription/vérification). Un découpage
  (`test_auth_signup.py` / `test_auth_signup_security.py` ?) dépasse la marge
  « dix lignes » de cette passe — à faire dans un lot dédié.
  `test_migrations.py` (529 lignes avant cette passe, inchangé ici) reste la
  même dette, non touchée.

## Vérification

Chaque test neuf a été cassé (revenu à la ligne fautive citée par la
relecture ou à son équivalent direct) puis restauré, dans cette session :
les dix nouveaux tests tombent tous rouges sur le bug qu'ils nomment, avant
le correctif définitif.

`cd api && ./.venv/bin/pytest tests/ -q` sur une base de test isolée
(`adscope_test_fixlot_<user>`, créée puis détruite) : **890 passed** (880 de
départ + 10 nouveaux, 0 régression).

`web/tests/*.test.mjs` et `extension/tests/*.test.mjs` : non touchés par
cette passe (périmètre `api/` uniquement), non rejoués ici.

## Opérations réelles

- `pg_dump -Fc adscope` → `~/adscope-backups/adscope-20260922-100054-avant-015-login-tokens-password.dump`.
- `python scripts/migrate.py` sur `adscope` (DB réelle) : seule
  `015_login_tokens_pending_password` appliquée (une colonne nullable sur
  `login_tokens`, aucun `UPDATE`). Vérifié après coup : le compte d'Alexis
  intact (`password_hash IS NULL`, `email_verified_at IS NULL`, inchangé).
- `launchctl kickstart -k gui/$UID/fr.adscope.api` : redémarré une fois les
  tests verts, jamais avant. Sondes sur le service réel : `403` sans
  `X-Adscope`, `422` email mal formé, `401` connexion inconnue, `401` clé
  `Bearer` sur `/v1/auth/password` — toutes confirmées par `curl`.

## Dette RGPD (rappel, inchangée par cette passe)

Toujours vraie depuis le rapport précédent : pas de route de suppression de
compte (droit à l'effacement) — à traiter avant tout usage à grande échelle
de données de production.
