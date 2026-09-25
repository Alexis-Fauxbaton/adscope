"""`security_headers.SecurityHeaders` : l'API et `/app` partagent l'origine
qui porte le cookie de session, sans aucun en-tête de sécurité avant ce lot
(C-7/INJ-2, audits config et injection)."""

from conftest import auth


# Fait rougir `headers.append((b"x-content-type-options", b"nosniff"))` — et
# les deux voisines — sur une route API : les trois en-têtes protègent
# l'origine entière, pas seulement le site.
def test_the_api_carries_the_three_baseline_headers(client, key):
    r = client.get("/v1/listings/lc/inconnue", headers=auth(key))
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert r.headers["x-frame-options"] == "DENY"


def test_app_carries_the_three_baseline_headers_too(client):
    r = client.get("/app/")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert r.headers["x-frame-options"] == "DENY"


# Fait rougir `if scope["path"].startswith("/app"):` : la CSP ne porte que sur
# le site, qui rend du HTML — l'API JSON ne l'a pas.
def test_only_app_carries_a_content_security_policy(client, key):
    app_response = client.get("/app/")
    api_response = client.get("/v1/listings/lc/inconnue", headers=auth(key))
    assert "content-security-policy" in app_response.headers
    assert "content-security-policy" not in api_response.headers


# La CSP doit rester compatible avec le site tel qu'il est : les polices
# Google (`web/*.html`) et aucun script en ligne.
def test_the_csp_allows_google_fonts_and_only_local_scripts(client):
    csp = client.get("/app/").headers["content-security-policy"]
    assert "script-src 'self'" in csp
    assert "fonts.googleapis.com" in csp
    assert "fonts.gstatic.com" in csp


# Fait rougir `if public_url().startswith("https://"):` : HSTS ne se pose
# que si l'adresse publique est bien en `https`, jamais sur le poste local
# (le défaut de test, `http://localhost:8000`).
def test_no_hsts_when_the_public_url_is_not_https(client):
    r = client.get("/app/")
    assert "strict-transport-security" not in r.headers


def test_hsts_when_the_public_url_is_https(client, monkeypatch):
    monkeypatch.setenv("ADSCOPE_PUBLIC_URL", "https://app.adscope.fr")
    r = client.get("/app/")
    assert r.headers["strict-transport-security"].startswith("max-age=")
