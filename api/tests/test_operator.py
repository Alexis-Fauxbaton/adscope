"""`require_operator` (`operator.py`) : la porte des files de machine — une
clé de licence passe toujours, un cookie de session seulement pour le compte
opérateur (`ADSCOPE_OPERATOR_EMAIL`). Éprouvée sur les deux routes qu'elle
garde, `/v1/sweep` et `/v1/revisits` : une seule suffirait à couvrir la
fonction, les deux prouvent qu'elle est bien branchée sur chacune.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update

from adscope_api.auth import hash_key, new_key
from adscope_api.auth_models import Account
from adscope_api.db import get_session
from adscope_api.main import app
from adscope_api.models import License

from conftest import auth, sign_in

XA = {"X-Adscope": "1"}


# Même hôte que le cookie (`http://localhost`, jamais `testserver`) — voir
# `test_session_cookie.py`.
@pytest.fixture
def browser(session):
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app, base_url="http://localhost") as opened:
        yield opened
    app.dependency_overrides.clear()


def enrolled(session, email):
    account = Account(email=email)
    session.add(account)
    session.flush()
    raw = new_key()
    session.add(License(key_hash=hash_key(raw), label="marchand", account_id=account.id))
    session.commit()
    return account


def keyed(session, label="crawler", automated=True):
    raw = new_key()
    session.add(License(key_hash=hash_key(raw), label=label, automated=automated))
    session.commit()
    return raw


def both_routes(client, headers):
    sweep = client.get("/v1/sweep", headers=headers)
    revisits = client.post("/v1/revisits", json={"site": "lbc"}, headers={**headers, **XA})
    return sweep, revisits


def test_an_automated_license_key_passes_both_routes(browser, session, clock, monkeypatch):
    monkeypatch.setenv("ADSCOPE_OPERATOR_EMAIL", "ops@adscope.fr")
    raw = keyed(session)
    sweep, revisits = both_routes(browser, auth(raw))
    assert sweep.status_code == 200
    assert revisits.status_code == 200


# Fait rougir `if not license_.automated: raise HTTPException(403, ...)` : une
# licence de marchand ordinaire — celle qu'`accounts.signup` frappe à
# l'inscription, sans le rôle `automated` — ne doit plus ouvrir le périmètre
# de tous les concurrents (A1/AUTH-01/A4).
def test_an_unautomated_license_key_is_refused_on_both_routes(browser, session, clock, monkeypatch):
    monkeypatch.setenv("ADSCOPE_OPERATOR_EMAIL", "ops@adscope.fr")
    raw = keyed(session, label="marchand", automated=False)
    sweep, revisits = both_routes(browser, auth(raw))
    assert sweep.status_code == 403
    assert revisits.status_code == 403


# Le cas réel de la trouvaille : la licence rattachée au compte d'un marchand
# à l'inscription (`accounts.signup`), pas une clé frappée à la main.
def test_a_merchant_accounts_own_license_key_is_refused_on_both_routes(
    browser, session, clock, monkeypatch,
):
    monkeypatch.setenv("ADSCOPE_OPERATOR_EMAIL", "ops@adscope.fr")
    account = enrolled(session, "marchand@garage.fr")
    raw = keyed(session, label="marchand@garage.fr", automated=False)
    session.execute(
        update(License).where(License.key_hash == hash_key(raw)).values(account_id=account.id)
    )
    session.commit()
    sweep, revisits = both_routes(browser, auth(raw))
    assert sweep.status_code == 403
    assert revisits.status_code == 403


# La casse ne se choisit pas à l'inscription : la comparaison la replie.
def test_the_operator_cookie_passes_both_routes(browser, session, clock, monkeypatch):
    monkeypatch.setenv("ADSCOPE_OPERATOR_EMAIL", "Ops@Adscope.fr")
    account = enrolled(session, "ops@adscope.fr")
    sign_in(browser, session, account.id, clock.now)
    sweep, revisits = both_routes(browser, {})
    assert sweep.status_code == 200
    assert revisits.status_code == 200


def test_another_accounts_cookie_is_refused_on_both_routes(browser, session, clock, monkeypatch):
    monkeypatch.setenv("ADSCOPE_OPERATOR_EMAIL", "ops@adscope.fr")
    account = enrolled(session, "marchand@garage.fr")
    sign_in(browser, session, account.id, clock.now)
    sweep, revisits = both_routes(browser, {})
    assert sweep.status_code == 403
    assert sweep.json()["detail"] == "réservé à l'opérateur"
    assert revisits.status_code == 403


# Une variable non posée ne désigne personne : même le compte qui porterait
# l'adresse choisie plus tard reste un marchand comme un autre.
def test_an_empty_variable_refuses_the_would_be_operators_cookie_too(
    browser, session, clock, monkeypatch,
):
    monkeypatch.delenv("ADSCOPE_OPERATOR_EMAIL", raising=False)
    account = enrolled(session, "ops@adscope.fr")
    sign_in(browser, session, account.id, clock.now)
    sweep, revisits = both_routes(browser, {})
    assert sweep.status_code == 403
    assert revisits.status_code == 403


def test_the_routes_need_a_license_or_a_cookie(browser, session, clock):
    sweep, revisits = both_routes(browser, {})
    assert sweep.status_code == 401
    assert revisits.status_code == 401


# Fait rougir `.strip()` dans `config.operator_email` : un espace en trop
# posé par un champ de tableau de bord Render fermait la porte en silence,
# sans que rien ne dise pourquoi (C-9, audit-config).
def test_a_trailing_space_in_the_operator_variable_still_authorizes(
    browser, session, clock, monkeypatch,
):
    monkeypatch.setenv("ADSCOPE_OPERATOR_EMAIL", "ops@adscope.fr ")
    account = enrolled(session, "ops@adscope.fr")
    sign_in(browser, session, account.id, clock.now)
    sweep, revisits = both_routes(browser, {})
    assert sweep.status_code == 200
    assert revisits.status_code == 200
