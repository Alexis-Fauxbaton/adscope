"""Le lien magique : ce qu'on répond, ce qu'on frappe, ce qu'on brûle."""

from datetime import timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select

from adscope_api import login_tokens
from adscope_api import sessions as sessions_module
from adscope_api.auth import hash_key, new_key
from adscope_api.auth_models import Account, LoginToken, SessionToken
from adscope_api.models import License

from conftest import NOW

EMAIL = "pro@garage.fr"


@pytest.fixture
def dev(monkeypatch):
    monkeypatch.setenv("ADSCOPE_DEV_LOGIN", "1")


@pytest.fixture
def closed(monkeypatch):
    monkeypatch.delenv("ADSCOPE_DEV_LOGIN", raising=False)
    monkeypatch.delenv("ADSCOPE_OPEN_SIGNUP", raising=False)


def enrolled(session, email=EMAIL, label="garage"):
    account = Account(email=email)
    session.add(account)
    session.flush()
    key = new_key()
    session.add(License(key_hash=hash_key(key), label=label, account_id=account.id))
    session.commit()
    return account, key


def login(client, email=EMAIL):
    return client.post("/v1/auth/login", json={"email": email})


# Fait rougir `raw = mint(...) if account is not None else None` et le corps
# commun de `auth_email.post_login` : répondre 404 — ou seulement autre chose —
# à une adresse inconnue ferait de la route un annuaire de clients, interrogeable
# par n'importe qui, autant de fois qu'on veut.
def test_an_unknown_address_is_answered_like_a_known_one(client, session, clock, closed):
    enrolled(session)
    known = login(client)
    unknown = login(client, "inconnu@ailleurs.fr")
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json() == {"sent": True}


# Fait rougir `if account is None and open_signup()` dans `post_login` :
# l'inscription est fermée, une adresse inconnue ne crée ni compte ni licence.
def test_an_unknown_address_creates_nothing(client, session, clock, closed):
    login(client, "inconnu@ailleurs.fr")
    assert session.scalars(select(Account)).all() == []
    assert session.scalars(select(License)).all() == []


# Fait rougir `enroll` : avec `ADSCOPE_OPEN_SIGNUP=1`, la même requête pose un
# compte et la licence qui portera ses suivis.
def test_open_signup_creates_the_account_and_its_license(client, session, clock,
                                                         closed, monkeypatch):
    monkeypatch.setenv("ADSCOPE_OPEN_SIGNUP", "1")
    login(client)
    account = session.scalar(select(Account).where(Account.email == EMAIL))
    assert account is not None
    assert session.scalar(select(License).where(License.account_id == account.id))


# Fait rougir `if dev_login():` dans `post_login` : sans la variable, le lien
# ne doit jamais revenir dans la réponse — qui peut appeler l'API entrerait
# dans n'importe quel compte.
def test_the_link_never_comes_back_without_the_variable(client, session, clock, closed):
    enrolled(session)
    assert login(client).json() == {"sent": True}


def test_the_link_comes_back_with_the_variable(client, session, clock, dev):
    enrolled(session)
    assert login(client).json()["dev_link"].startswith(
        "http://localhost:8000/v1/auth/verify?"
    )


# Fait rougir `f"{public_url()}/v1/auth/verify?token={raw}"` redevenu
# `f"{request.url_for('verify_login')}?token={raw}"` : un `Host` forgé ne doit
# jamais décider où pointe le lien envoyé au marchand — sans quoi un inconnu
# ferait envoyer, à un vrai client, un lien qui lui livre son propre jeton.
def test_a_forged_host_does_not_change_the_link(client, session, clock, dev):
    enrolled(session)
    link = client.post(
        "/v1/auth/login", json={"email": EMAIL}, headers={"Host": "evil.example"}
    ).json()["dev_link"]
    assert link.startswith("http://localhost:8000/v1/auth/verify?")


def test_the_link_host_is_configurable(client, session, clock, dev, monkeypatch):
    monkeypatch.setenv("ADSCOPE_PUBLIC_URL", "https://app.adscope.fr")
    enrolled(session)
    assert login(client).json()["dev_link"].startswith(
        "https://app.adscope.fr/v1/auth/verify?"
    )


# Fait rougir `send_login_link(email, link)` : sans cet appel, le lien n'atteint
# personne et la connexion ne marche qu'en mode local.
def test_the_link_reaches_the_transport(client, session, clock, closed, monkeypatch):
    enrolled(session)
    sent = []
    monkeypatch.setattr(login_tokens, "send_login_link",
                        lambda email, link: sent.append((email, link)))
    login(client)
    assert sent and sent[0][0] == EMAIL and "token=" in sent[0][1]


# Fait rougir `token_hash=hash_token(raw)` dans `mint` : le jeton en clair est
# un droit d'entrée, une base lue ne doit pas en livrer un seul.
def test_the_token_is_never_stored_in_the_clear(client, session, clock, dev):
    enrolled(session)
    raw = login(client).json()["dev_link"].split("token=")[1]
    stored = session.scalars(select(LoginToken.token_hash)).all()
    assert stored and raw not in stored


# Fait rougir `if pending >= MAX_PENDING: return None` dans `mint` : sans
# plafond, la boîte du marchand sert de mégaphone à qui connaît son adresse.
def test_five_links_a_quarter_hour_and_no_more(client, session, clock, closed):
    enrolled(session)
    for _ in range(7):
        assert login(client).json() == {"sent": True}
    assert session.scalar(select(func.count()).select_from(LoginToken)) == 5


# Fait rougir `LoginToken.expires_at > now` dans `mint` : le plafond compte les
# jetons encore valables, donc ceux du dernier quart d'heure — pas ceux d'hier.
def test_the_next_quarter_hour_is_let_through(client, session, clock, closed):
    enrolled(session)
    for _ in range(5):
        login(client)
    clock.now = NOW + timedelta(minutes=16)
    login(client)
    assert session.scalar(select(func.count()).select_from(LoginToken)) == 6


def verify(client, link):
    return client.get(link, follow_redirects=False)


# Fait rougir `row.used_at = now` dans `consume` et le `row.used_at is not None`
# qui le lit : un lien magique traîne dans une boîte mail et dans les journaux
# du serveur de messagerie — il ne vaut qu'une fois.
def test_a_link_serves_once(client, session, clock, dev):
    enrolled(session)
    link = login(client).json()["dev_link"]
    assert verify(client, link).headers["location"] == "/app/"
    assert verify(client, link).headers["location"] == "/app/?login=expired"


# Fait rougir `row.expires_at <= now` dans `consume` : un quart d'heure, pas
# un lien qui ouvre le compte six mois plus tard.
def test_a_link_dies_after_a_quarter_hour(client, session, clock, dev):
    enrolled(session)
    link = login(client).json()["dev_link"]
    clock.now = NOW + timedelta(minutes=16)
    assert verify(client, link).headers["location"] == "/app/?login=expired"


def test_a_link_still_fresh_is_taken(client, session, clock, dev):
    enrolled(session)
    link = login(client).json()["dev_link"]
    clock.now = NOW + timedelta(minutes=14)
    assert verify(client, link).headers["location"] == "/app/"


# Fait rougir l'ancien `consume` (lecture puis écriture en deux temps) : huit
# requêtes lancées ensemble sur le même lien lisent toutes un jeton encore
# valable avant qu'aucune ne l'ait marqué, et ouvrent huit sessions. La mise à
# jour atomique (`UPDATE ... RETURNING`) n'en laisse passer qu'une.
def test_eight_concurrent_uses_of_the_same_link_open_one_session(
    session, sessions, clock, concurrently
):
    account, _ = enrolled(session)
    raw = login_tokens.mint(session, account.id, clock.now)
    session.commit()

    def use_once(_, s):
        account_id = login_tokens.consume(s, raw, clock.now)
        if account_id is not None:
            sessions_module.create(s, account_id, clock.now)

    errors = concurrently(8, use_once)
    assert errors == []
    assert session.scalar(select(func.count()).select_from(SessionToken)) == 1


# Fait rougir `if row is None` dans `get_verify` : un jeton inventé ne doit pas
# rendre 500, il doit ramener le marchand sur une page qui le lui dit.
def test_an_invented_token_lands_on_the_expired_page(client, session, clock, closed):
    response = verify(client, "/v1/auth/verify?token=nimportequoi")
    assert response.status_code == 303
    assert response.headers["location"] == "/app/?login=expired"


# Fait rougir `headers=NO_REFERRER` : l'URL de vérification porte le jeton, et
# sans cet en-tête le site d'arrivée le lirait dans son `Referer`.
def test_the_redirect_carries_no_referrer(client, session, clock, dev):
    enrolled(session)
    link = login(client).json()["dev_link"]
    assert verify(client, link).headers["referrer-policy"] == "no-referrer"


# Le refus part de la même URL et porte le même jeton : il a autant besoin de
# l'en-tête que l'acceptation.
def test_the_refusal_carries_no_referrer_either(client, session, clock, closed):
    refused = verify(client, "/v1/auth/verify?token=nimportequoi")
    assert refused.headers["referrer-policy"] == "no-referrer"


# Fait rougir `if dev_login():` dans `announce_dev_login` : le mode local ouvre
# tous les comptes à qui appelle l'API, il ne doit pas s'oublier en silence.
def test_the_local_mode_announces_itself(dev):
    said = []
    login_tokens.announce_dev_login(log=SimpleNamespace(warning=said.append))
    assert said and "n'importe quel compte" in said[0]


def test_nothing_is_announced_without_the_variable(closed):
    said = []
    login_tokens.announce_dev_login(log=SimpleNamespace(warning=said.append))
    assert said == []
