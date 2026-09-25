"""Mot de passe oublié, réinitialisation, changement connecté."""

from sqlalchemy import func, select

from adscope_api import login_tokens, passwords, sessions
from adscope_api.auth import hash_key, new_key
from adscope_api.auth_models import Account, LoginToken, Mail, SessionToken
from adscope_api.models import License

from conftest import NOW, auth, sign_in

XA = {"X-Adscope": "1"}
EMAIL = "karim@garage.fr"
PASSWORD = "un-garage-solide"
NEW_PASSWORD = "un-autre-garage-solide"


def verified(session, email=EMAIL, password=PASSWORD, now=NOW):
    account = Account(email=email, password_hash=passwords.hash_password(password),
                      email_verified_at=now)
    session.add(account)
    session.flush()
    session.add(License(key_hash=hash_key(new_key()), label=email[:64],
                        account_id=account.id))
    session.commit()
    return account


def forgot(client, email=EMAIL):
    return client.post("/v1/auth/forgot", json={"email": email}, headers=XA)


# Fait rougir `if account is not None and account.password_hash is not None`
# dans `accounts.forgot` : la réponse est la même, adresse connue ou non.
def test_forgot_answers_the_same_whether_the_account_exists_or_not(client, session, clock):
    verified(session)
    known = forgot(client)
    unknown = forgot(client, "inconnu@ailleurs.fr")
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json() == {"sent": True}


def test_forgot_on_a_known_account_posts_a_reset_mail(client, session, clock):
    account = verified(session)
    forgot(client)
    row = session.scalar(select(Mail).where(Mail.account_id == account.id))
    assert row is not None and row.kind == "reinitialisation"
    token = session.scalar(
        select(LoginToken).where(LoginToken.account_id == account.id, LoginToken.purpose == "reset")
    )
    assert token is not None


def reset(client, token, password=NEW_PASSWORD):
    return client.post("/v1/auth/password/reset", json={"token": token, "password": password},
                       headers=XA)


def mailed_token(session):
    text = session.scalar(select(Mail.text).order_by(Mail.id.desc()))
    return text.split("token=")[1].split()[0]


# Fait rougir `sessions.close_all` dans `accounts.reset_password` : la
# réinitialisation ferme toutes les autres sessions du compte et en ouvre une.
def test_reset_changes_the_password_and_closes_every_session(client, session, clock):
    account = verified(session)
    sign_in(client, session, account.id, clock.now)
    forgot(client)
    token = mailed_token(session)
    response = reset(client, token)
    assert response.status_code == 204
    assert "adscope_session=" in response.headers["set-cookie"]
    session.expire_all()
    assert passwords.verify_password(
        session.scalar(select(Account.password_hash).where(Account.id == account.id)),
        NEW_PASSWORD,
    )
    assert session.scalar(select(func.count()).select_from(SessionToken)) == 1


# Fait rougir `AND purpose = :purpose` dans `login_tokens.consume` : un jeton
# de vérification ne réinitialise pas un mot de passe.
def test_a_verify_token_does_not_reset_a_password(client, session, clock):
    account = verified(session)
    raw = login_tokens.mint(session, account.id, "verify", clock.now)
    session.commit()
    assert reset(client, raw).status_code == 400


def change(client, current=PASSWORD, password=NEW_PASSWORD, headers=None):
    return client.post("/v1/auth/password", json={"current": current, "password": password},
                       headers=headers)


# Fait rougir `if ... not passwords.verify_password(account.password_hash, current)`
# dans `accounts.change_password` : l'ancien mot de passe est exigé.
def test_change_requires_the_current_password(client, session, clock):
    account = verified(session)
    sign_in(client, session, account.id, clock.now)
    response = change(client, current="pas-le-bon", headers=XA)
    assert response.status_code == 401
    assert response.json() == {"detail": "Mot de passe actuel incorrect."}


# Fait rougir `guard("password", ...)` dans `post_change_password` (AUTH-04,
# audit auth) : seule route à vérifier un mot de passe sans jamais appeler le
# limiteur, une session volée pouvait deviner le mot de passe courant en
# essais illimités.
def test_change_is_rate_limited_after_repeated_wrong_current_passwords(
    client, session, clock,
):
    from adscope_api.rate_limit import LIMITS

    account = verified(session)
    sign_in(client, session, account.id, clock.now)
    per_account, _, _ = LIMITS["password"]
    codes = [change(client, current="pas-le-bon", headers=XA).status_code
             for _ in range(per_account + 1)]
    assert codes[:per_account] == [401] * per_account
    assert codes[-1] == 429


# Fait rougir `sessions.close_others` : les autres sessions tombent, la
# courante — celle qui vient de changer le mot de passe — reste.
def test_change_closes_other_sessions_and_keeps_the_current_one(client, session, clock):
    account = verified(session)
    sign_in(client, session, account.id, clock.now)
    other_raw = sessions.create(session, account.id, clock.now)
    session.commit()
    kept = client.cookies[sessions.COOKIE]
    response = change(client, headers=XA)
    assert response.status_code == 204
    remaining = {row.token_hash for row in session.scalars(select(SessionToken))}
    assert sessions.hash_token(kept) in remaining
    assert sessions.hash_token(other_raw) not in remaining
    assert len(remaining) == 1


def test_change_without_a_session_cookie_is_401(client, session, clock, key):
    response = change(client, headers={**XA, **auth(key)})
    assert response.status_code == 401


# Fait rougir `of_account(...) is None` dans `require_account_by_cookie` :
# un compte dont l'unique licence est suspendue ne change plus son mot de
# passe par cookie — la route ne consultait jamais `License.active`.
def test_change_is_refused_when_the_accounts_license_is_suspended(client, session, clock):
    account = verified(session)
    sign_in(client, session, account.id, clock.now)
    license_ = session.scalar(select(License).where(License.account_id == account.id))
    license_.active = False
    session.commit()
    response = change(client, headers=XA)
    assert response.status_code == 401
    assert response.json()["detail"] == "licence suspendue"


# Fait rougir `require_account_by_cookie` (route restreinte au cookie de
# session) : une clé de machine — même rattachée au compte, comme celle du
# crawler dans `crawler/.license` en clair — ne change plus le mot de passe
# d'un humain (revue de code, prise de compte prouvée par sonde).
def test_change_is_refused_for_a_machine_key_even_one_attached_to_the_account(
    client, session, clock
):
    account = verified(session)
    raw = new_key()
    session.add(License(key_hash=hash_key(raw), label="crawler", account_id=account.id))
    session.commit()
    response = change(client, headers={**XA, **auth(raw)})
    assert response.status_code == 401


# Fait rougir `login_tokens.invalidate_pending` dans `accounts.reset_password` :
# un lien de réinitialisation oublié dans la boîte ne survit pas à celui
# qu'on vient d'utiliser.
def test_reset_invalidates_the_other_outstanding_reset_links(client, session, clock):
    verified(session)
    forgot(client)
    first = mailed_token(session)
    forgot(client)
    second = mailed_token(session)
    assert reset(client, first).status_code == 204
    stale = reset(client, second, password="un-troisieme-garage-solide")
    assert stale.status_code == 400


# Même correctif, côté changement de mot de passe connecté : un lien
# « oublié » resté dans la boîte ne doit pas survivre à un changement fait
# la main.
def test_change_invalidates_an_outstanding_reset_link(client, session, clock):
    account = verified(session)
    sign_in(client, session, account.id, clock.now)
    forgot(client)
    token = mailed_token(session)
    assert change(client, headers=XA).status_code == 204
    stale = reset(client, token, password="un-troisieme-garage-solide")
    assert stale.status_code == 400
