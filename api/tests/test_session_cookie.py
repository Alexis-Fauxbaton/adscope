"""La session de navigateur : le cookie, ce qu'il ouvre, et ce qu'il ne peut pas.

Le fil de tous ces tests : un humain n'a plus de clé. Ce qu'il présente est un
cookie, et un cookie voyage tout seul — d'où l'en-tête `X-Adscope` sur les
écritures, que seule une requête venue de nous peut poser.
"""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from adscope_api.auth import hash_key, new_key
from adscope_api.auth_models import Account, SessionToken
from adscope_api.db import get_session
from adscope_api.main import app
from adscope_api.models import License, Listing
from adscope_api.sessions import COOKIE

from conftest import NOW, auth

MINE = "3263259495"
XA = {"X-Adscope": "1"}


@pytest.fixture(autouse=True)
def _dev(monkeypatch):
    monkeypatch.setenv("ADSCOPE_DEV_LOGIN", "1")


# Le navigateur du marchand : le service tourne en HTTP sur sa machine, donc
# sur `localhost`. Le client partagé, lui, parle à `testserver` — un hôte que
# `is_secure` tient pour distant, et dont le cookie `Secure` ne repartirait
# jamais sur `http://`. C'est précisément ce que le test des attributs vérifie.
@pytest.fixture
def browser(session):
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app, base_url="http://localhost") as opened:
        yield opened
    app.dependency_overrides.clear()


def enrolled(session, email="pro@garage.fr", label="garage"):
    account = Account(email=email)
    session.add(account)
    session.flush()
    key = new_key()
    session.add(License(key_hash=hash_key(key), label=label, account_id=account.id))
    session.commit()
    return account, key


def sign_in(browser, email="pro@garage.fr"):
    """Le parcours entier, comme un navigateur : lien, vérification, cookie."""
    link = browser.post("/v1/auth/login", json={"email": email}).json()["dev_link"]
    browser.get(link, follow_redirects=False)
    return browser


def listed(session, site_id=MINE):
    listing = Listing(site="lbc", site_id=site_id, first_seen=NOW, last_seen=NOW,
                      observations=1)
    session.add(listing)
    session.commit()
    return listing


# Fait rougir `sessions.create` puis `sessions.set_cookie` dans `get_verify` :
# sans eux la vérification ne laisse rien derrière elle et le marchand
# recommence à chaque page.
def test_the_cookie_opens_the_routes_without_a_key(browser, session, clock):
    enrolled(session)
    sign_in(browser)
    assert browser.get("/v1/follows").status_code == 200


# Fait rougir `token_hash=hash_token(raw)` dans `sessions.create` : l'identifiant
# de session vaut la clé, une base lue ne doit pas en livrer un seul en clair.
def test_the_session_id_is_never_stored_in_the_clear(browser, session, clock):
    enrolled(session)
    sign_in(browser)
    stored = session.scalars(select(SessionToken.token_hash)).all()
    assert stored and browser.cookies[COOKIE] not in stored


def posed_cookie(opened):
    link = opened.post("/v1/auth/login", json={"email": "pro@garage.fr"}) \
                 .json()["dev_link"]
    return opened.get(link, follow_redirects=False).headers["set-cookie"]


# Fait rougir chaque attribut posé par `sessions.set_cookie` : `HttpOnly` tient
# le cookie hors de portée d'un script de page, `SameSite=Lax` l'empêche de
# partir sur une écriture venue d'ailleurs, et les quatre-vingt-dix jours sont
# la session longue que le marchand ne doit pas rouvrir chaque matin.
def test_the_cookie_carries_its_attributes(client, session, clock):
    enrolled(session)
    posed = posed_cookie(client)
    assert "adscope_session=" in posed
    assert "HttpOnly" in posed and "Path=/" in posed
    assert "Max-Age=7776000" in posed and "SameSite=lax" in posed
    assert "Secure" in posed


# Fait rougir `is_secure` : le service tourne en HTTP sur la machine du
# marchand. Un cookie `Secure` n'y serait jamais renvoyé — la connexion
# marcherait une fois puis plus jamais.
def test_the_cookie_is_not_secure_on_the_local_machine(browser, session, clock):
    enrolled(session)
    assert "Secure" not in posed_cookie(browser)


# Fait rougir `if row.expires_at <= now` dans `sessions.resolve` : une session
# est longue, elle n'est pas éternelle.
def test_an_expired_session_is_refused(browser, session, clock):
    enrolled(session)
    sign_in(browser)
    clock.now = NOW + timedelta(days=91)
    assert browser.get("/v1/follows").status_code == 401


# Fait rougir `row.expires_at = now + LIFETIME` dans `sessions.touch` : sans le
# glissement, le marchand serait déconnecté au quatre-vingt-dixième jour même
# s'il s'est servi du site tous les jours.
def test_a_session_in_use_slides(browser, session, clock):
    enrolled(session)
    sign_in(browser)
    clock.now = NOW + timedelta(days=89)
    assert browser.get("/v1/follows").status_code == 200
    clock.now = NOW + timedelta(days=178)
    assert browser.get("/v1/follows").status_code == 200


# Fait rougir `if now - row.last_seen_at < REFRESH: return False` : la popup
# émet plusieurs requêtes par fiche ouverte. Rafraîchir à chaque fois ferait de
# chaque lecture du marché une écriture sur la ligne de session.
def test_last_seen_is_refreshed_once_a_day_at_most(browser, session, clock):
    enrolled(session)
    sign_in(browser)
    clock.now = NOW + timedelta(hours=5)
    browser.get("/v1/follows")
    session.expire_all()
    assert session.scalar(select(SessionToken.last_seen_at)) == NOW
    clock.now = NOW + timedelta(days=2)
    browser.get("/v1/follows")
    session.expire_all()
    assert session.scalar(select(SessionToken.last_seen_at)) == clock.now


# Fait rougir `sessions.drop` puis `clear_cookie` dans `post_logout` : se
# déconnecter sur un poste partagé doit fermer la session, pas seulement
# oublier le cookie du côté du navigateur.
def test_logout_closes_the_session(browser, session, clock):
    enrolled(session)
    sign_in(browser)
    kept = browser.cookies[COOKIE]
    assert browser.post("/v1/auth/logout", headers=XA).status_code == 204
    assert session.scalars(select(SessionToken)).all() == []
    browser.cookies.set(COOKIE, kept)
    assert browser.get("/v1/follows").status_code == 401


# Fait rougir `if request.method in WRITES and ... != "1"` dans
# `sessions.check_csrf` : une page tierce peut poster vers l'API avec le cookie
# du marchand, elle ne peut pas y poser un en-tête personnalisé sans un prévol
# CORS que l'API n'accorde à personne.
def test_a_cookie_write_without_the_header_is_refused(browser, session, clock):
    enrolled(session)
    listed(session)
    sign_in(browser)
    posted = browser.post("/v1/follows", json={"site": "lbc", "site_id": MINE})
    assert posted.status_code == 403


def test_a_cookie_write_with_the_header_passes(browser, session, clock):
    enrolled(session)
    listed(session)
    sign_in(browser)
    posted = browser.post("/v1/follows", json={"site": "lbc", "site_id": MINE},
                         headers=XA)
    assert posted.status_code == 201


# Fait rougir le fait que `check_csrf` ne soit appelé que dans la branche
# cookie : une clé n'est pas un identifiant ambiant, une page tierce ne l'a pas.
# Le crawl poste sans rien savoir de cet en-tête.
def test_a_bearer_write_needs_no_header(browser, session, clock):
    _, key = enrolled(session)
    listed(session)
    posted = browser.post("/v1/follows", json={"site": "lbc", "site_id": MINE},
                         headers=auth(key))
    assert posted.status_code == 201


def test_a_cookie_read_needs_no_header(browser, session, clock):
    enrolled(session)
    sign_in(browser)
    assert browser.get("/v1/follows").status_code == 200


# Fait rougir `of_account(session, row.account_id, now)` dans `require_license` :
# la session doit mener à la licence de SON compte. Prendre la première venue
# ouvrirait les suivis d'un marchand à un autre.
def test_a_session_reaches_only_its_own_follows(browser, session, clock):
    _, mine = enrolled(session, "moi@garage.fr", "moi")
    enrolled(session, "autre@garage.fr", "autre")
    listing = listed(session)
    browser.post("/v1/follows", json={"site": "lbc", "site_id": listing.site_id},
                headers=auth(mine))
    sign_in(browser, "autre@garage.fr")
    assert browser.get("/v1/follows").json() == []
    assert browser.get("/v1/me").json()["email"] == "autre@garage.fr"


# Fait rougir `license_.active` dans `of_account` : une licence révoquée ne doit
# pas rester ouverte par une session que le marchand tenait déjà.
def test_a_revoked_license_closes_the_session(browser, session, clock):
    account, _ = enrolled(session)
    sign_in(browser)
    session.scalars(select(License)).one().active = False
    session.commit()
    assert browser.get("/v1/follows").status_code == 401


# Fait rougir `license_.account.email if license_.account else None` : une clé
# de machine n'appartient à personne, et `/v1/me` ne doit pas inventer d'adresse.
def test_me_gives_no_email_for_a_machine_key(browser, session, key, clock):
    assert browser.get("/v1/me", headers=auth(key)).json()["email"] is None


def test_me_gives_the_email_behind_the_cookie(browser, session, clock):
    enrolled(session)
    sign_in(browser)
    assert browser.get("/v1/me").json() == {
        "email": "pro@garage.fr", "label": "garage", "expires_at": None,
    }


# Fait rougir la branche `Bearer` de `require_license` : la clé passe toujours,
# et sans cookie ni clé la porte reste fermée.
def test_no_cookie_and_no_key_is_a_401(browser, session, clock):
    assert browser.get("/v1/follows").status_code == 401
