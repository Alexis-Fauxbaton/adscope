"""`GET /healthz` : la sonde de santé Render (`render.yaml`,
`healthCheckPath`, toutes les 5 s) — ni base ni authentification, pour
qu'une sonde aussi fréquente ne dépende jamais d'une connexion.
"""

from fastapi.testclient import TestClient

from adscope_api.main import app


def test_healthz_answers_ok(client):
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


# Fait rougir un `Depends(get_session)` (ou `require_operator`) ajouté à la
# route : sans fixture de session ni cookie ni clé, la sonde répond quand
# même — c'est tout le point de la quitter `/app/` (render.yaml).
def test_healthz_needs_no_session_fixture_and_no_auth():
    plain = TestClient(app)
    resp = plain.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
