"""L'inscription : créer un compte, le vérifier, le renvoyer."""

from sqlalchemy import func, select

from adscope_api import accounts, login_tokens, passwords
from adscope_api.auth_models import Account, Mail

XA = {"X-Adscope": "1"}
EMAIL = "karim@garage.fr"
PASSWORD = "un-garage-solide"


def signup(client, email=EMAIL, password=PASSWORD):
    return client.post("/v1/auth/signup", json={"email": email, "password": password},
                       headers=XA)


def enrolled_without_password(session, email=EMAIL, label="alexis"):
    """Le cas Alexis : un compte du lot Comptes, sans mot de passe."""
    from adscope_api.auth import hash_key, new_key
    from adscope_api.models import License

    account = Account(email=email)
    session.add(account)
    session.flush()
    session.add(License(key_hash=hash_key(new_key()), label=label, account_id=account.id))
    session.commit()
    return account


# Fait rougir `account.pending_password_hash = hashed` et `_send(...)` dans
# `accounts.signup` : l'inscription crée un compte non vérifié et une ligne
# `mails`, sans jamais rendre de jeton dans le corps.
def test_signup_creates_an_unverified_account_and_a_mail(client, session, clock):
    response = signup(client)
    assert response.status_code == 202
    assert response.json() == {"sent": True}
    assert "token" not in response.text
    account = session.scalar(select(Account).where(Account.email == EMAIL))
    assert account is not None and account.email_verified_at is None
    assert session.scalar(select(func.count()).select_from(Mail)) == 1


# Fait rougir `if account.email_verified_at is None: raise HTTPException(403, ...)`
# dans `accounts.login` : tant que Karim n'a pas cliqué, la connexion refuse.
def test_login_is_refused_before_verification(client, session, clock):
    signup(client)
    response = client.post("/v1/auth/login", json={"email": EMAIL, "password": PASSWORD},
                           headers=XA)
    assert response.status_code == 403
    assert "vérifiez" in response.json()["detail"].lower()


def verify(client, token):
    return client.post("/v1/auth/verify", json={"token": token}, headers=XA)


def mailed_token(session):
    text = session.scalar(select(Mail.text).order_by(Mail.id.desc()))
    return text.split("token=")[1].split()[0]


# Fait rougir `account.password_hash = account.pending_password_hash` dans
# `accounts.verify` : le clic promeut le mot de passe en attente et ouvre une
# session, dans le même geste.
def test_verify_promotes_the_password_and_opens_a_session(client, session, clock):
    signup(client)
    token = mailed_token(session)
    response = verify(client, token)
    assert response.status_code == 204
    assert "adscope_session=" in response.headers["set-cookie"]
    session.expire_all()
    account = session.scalar(select(Account).where(Account.email == EMAIL))
    assert account.email_verified_at is not None
    assert passwords.verify_password(account.password_hash, PASSWORD)


# Fait rougir `UPDATE ... WHERE used_at IS NULL` dans `login_tokens.consume` :
# un lien rejoué ne doit pas rouvrir une deuxième session.
def test_a_replayed_token_is_refused(client, session, clock):
    signup(client)
    token = mailed_token(session)
    assert verify(client, token).status_code == 204
    replay = verify(client, token)
    assert replay.status_code == 400
    assert replay.json() == {"detail": accounts.BAD_TOKEN}


# Fait rougir `AND purpose = :purpose` dans `login_tokens.consume` : un jeton
# de réinitialisation ne doit pas vérifier un email.
def test_a_reset_token_is_refused_by_verify(client, session, clock):
    account = enrolled_without_password(session)
    account.password_hash = passwords.hash_password("un-mot-de-passe-existant")
    session.commit()
    raw = login_tokens.mint(session, account.id, "reset", clock.now)
    session.commit()
    assert verify(client, raw).status_code == 400


# Fait rougir `raise HTTPException(status_code=409, detail=ALREADY_EXISTS)` :
# une adresse déjà pourvue d'un mot de passe le dit, mot pour mot.
def test_signing_up_twice_on_the_same_address_is_a_409(client, session, clock):
    signup(client)
    token = mailed_token(session)
    verify(client, token)
    again = signup(client)
    assert again.status_code == 409
    assert again.json() == {"detail": accounts.ALREADY_EXISTS}


# Fait rougir `account.pending_password_hash = hashed` sur un compte déjà là
# sans mot de passe (cas Alexis) : D2 — le mot de passe reste en attente, la
# connexion refuse (403, le mot de passe est le bon) tant que le lien n'a pas
# été suivi.
def test_signup_on_a_passwordless_account_stays_pending_until_the_click(client, session, clock):
    enrolled_without_password(session)
    response = signup(client)
    assert response.status_code == 202
    denied = client.post("/v1/auth/login", json={"email": EMAIL, "password": PASSWORD},
                         headers=XA)
    assert denied.status_code == 403
    token = mailed_token(session)
    assert verify(client, token).status_code == 204
    allowed = client.post("/v1/auth/login", json={"email": EMAIL, "password": PASSWORD},
                          headers=XA)
    assert allowed.status_code == 204


# Fait rougir `INSERT ... ON CONFLICT (email) DO NOTHING RETURNING id` redevenu
# un simple `INSERT` : deux inscriptions simultanées sur la même adresse
# lèveraient `UNIQUE(email)` et rendraient un 500.
def test_two_concurrent_signups_on_the_same_address_make_one_account(session, sessions, clock, concurrently):
    def work(_, s):
        accounts.signup(s, EMAIL, PASSWORD, clock.now)

    errors = concurrently(2, work)
    assert errors == []
    assert session.scalar(select(func.count()).select_from(Account)) == 1


def test_resend_on_an_unknown_address_answers_like_a_known_one(client, session, clock):
    response = client.post("/v1/auth/resend", json={"email": "inconnu@ailleurs.fr"},
                           headers=XA)
    assert response.status_code == 202
    assert response.json() == {"sent": True}


# Fait rougir `guard("signup", email, request, now)` placé après le hachage :
# le limiteur doit trancher avant tout appel à Argon2 (D4 du plan). Le
# plafond `signup` est 10 par IP ; toutes ces requêtes viennent de la même IP
# de test, avec des adresses distinctes pour ne pas cogner le plafond email.
def test_the_limiter_cuts_before_any_hashing(client, session, clock, monkeypatch):
    calls = []
    monkeypatch.setattr(passwords, "hash_password", lambda p: calls.append(p) or "x")
    for i in range(10):
        signup(client, email=f"marchand{i}@garage.fr")
    calls.clear()
    limited = signup(client, email="encore-un-autre@garage.fr")
    assert limited.status_code == 429
    assert calls == []


# Fait rougir `if len(password) < MIN_LENGTH` côté route : un mot de passe
# trop court est refusé avant tout hachage, avec le message de la règle.
def test_a_short_password_is_refused_with_the_rule(client, session, clock):
    response = signup(client, password="court")
    assert response.status_code == 422
    assert response.json() == {"detail": passwords.TOO_SHORT}


def test_signup_without_x_adscope_header_is_refused(client, session, clock):
    response = client.post("/v1/auth/signup", json={"email": EMAIL, "password": PASSWORD})
    assert response.status_code == 403
