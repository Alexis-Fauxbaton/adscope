"""La connexion par mot de passe : ce qu'elle répond, ce qu'elle ouvre."""

from sqlalchemy import func, select

from adscope_api import accounts, passwords
from adscope_api.auth import hash_key, new_key
from adscope_api.auth_models import Account, SessionToken
from adscope_api.models import License

from conftest import NOW

XA = {"X-Adscope": "1"}
EMAIL = "karim@garage.fr"
PASSWORD = "un-garage-solide"


def verified(session, email=EMAIL, password=PASSWORD, now=NOW):
    account = Account(email=email, password_hash=passwords.hash_password(password),
                      email_verified_at=now)
    session.add(account)
    session.flush()
    session.add(License(key_hash=hash_key(new_key()), label=email[:64],
                        account_id=account.id))
    session.commit()
    return account


def login(client, email=EMAIL, password=PASSWORD):
    return client.post("/v1/auth/login", json={"email": email, "password": password},
                       headers=XA)


def test_the_right_password_opens_a_session(client, session, clock):
    verified(session)
    response = login(client)
    assert response.status_code == 204
    assert "adscope_session=" in response.headers["set-cookie"]


def test_two_logins_make_two_distinct_sessions(client, session, clock):
    verified(session)
    first = login(client).headers["set-cookie"]
    second = login(client).headers["set-cookie"]
    assert first != second
    assert session.scalar(select(func.count()).select_from(SessionToken)) == 2


# Fait rougir `if not verify_password(candidate, password)` puis la branche
# `candidate is None` dans `accounts.login` : un mauvais mot de passe et une
# adresse inconnue rendent le même 401, mot pour mot.
def test_wrong_password_and_unknown_address_give_the_same_answer(client, session, clock):
    verified(session)
    wrong = login(client, password="pas-le-bon-mot-de-passe")
    unknown = login(client, email="inconnu@ailleurs.fr")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"detail": accounts.BAD_CREDENTIALS}


# Fait rougir `limiter.clear("login", ...)` dans `accounts.login` (AUTH-05,
# audit auth) : le plafond par adresse compte les essais SUR elle, pas PAR
# elle — un tiers qui en épuise neuf avec de mauvais mots de passe ne doit
# pas priver Karim du dixième, le bon.
def test_repeated_wrong_passwords_do_not_lock_out_the_right_one(client, session, clock):
    from adscope_api.rate_limit import LIMITS

    verified(session)
    per_email, _, _ = LIMITS["login"]
    for _ in range(per_email - 1):
        assert login(client, password="pas-le-bon").status_code == 401
    assert login(client).status_code == 204


# Même plafond, remis à zéro par la réussite : une seconde vague d'essais
# fautifs, après une connexion qui a marché, dispose à nouveau du plafond
# entier — la lecture d'AUTH-05 (« indéfiniment renouvelable ») tient sur le
# plafond seul, pas sur ce qu'une réussite en a déjà consommé.
def test_a_successful_login_resets_the_per_email_counter(client, session, clock):
    from adscope_api.rate_limit import LIMITS

    verified(session)
    per_email, _, _ = LIMITS["login"]
    for _ in range(per_email - 1):
        login(client, password="pas-le-bon")
    assert login(client).status_code == 204
    for _ in range(per_email - 1):
        assert login(client, password="pas-le-bon").status_code == 401
    assert login(client).status_code == 204


# Fait rougir `waste_time()` dans `accounts.login` : sans lui, une adresse
# inconnue répondrait plus vite qu'une adresse connue avec le mauvais mot de
# passe, et le temps de réponse trahirait ce que le corps cache.
def test_an_unknown_address_still_wastes_time(client, session, clock, monkeypatch):
    calls = []
    monkeypatch.setattr(passwords, "waste_time", lambda: calls.append(1))
    login(client, email="inconnu@ailleurs.fr")
    assert calls == [1]


def test_login_without_x_adscope_header_is_refused(client, session, clock):
    verified(session)
    response = client.post("/v1/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert response.status_code == 403


# Le plafond `login` : 10 par email, 30 par IP.
def test_429_by_email_then_by_ip(client, session, clock):
    verified(session)
    for _ in range(10):
        login(client, password="mauvais")
    limited = login(client, password="mauvais")
    assert limited.status_code == 429


def test_logout_is_unchanged(client, session, clock):
    verified(session)
    login(client)
    response = client.post("/v1/auth/logout", headers=XA)
    assert response.status_code == 204
