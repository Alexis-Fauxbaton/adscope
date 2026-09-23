"""`BodySizeLimit` : un corps trop lourd n'entre jamais en mémoire (A1, audit
d'abus). Aucune authentification requise pour se faire refuser — c'est le
point : la mémoire est prise avant que `require_license` ne tranche.
"""

from adscope_api.body_limit import MAX_BODY_BYTES

XA = {"X-Adscope": "1"}


# Fait rougir `if declared is not None and int(declared) > MAX_BODY_BYTES`
# dans `BodySizeLimit.__call__` : un `Content-Length` énorme, sans la moindre
# licence ni cookie, se fait refuser avant que la route ne s'exécute.
def test_a_huge_declared_body_is_rejected_before_any_route_runs(client):
    oversized = b"0" * (MAX_BODY_BYTES + 1)
    response = client.post("/v1/observations", content=oversized,
                           headers={**XA, "Content-Type": "application/json"})
    assert response.status_code == 413


def test_a_body_within_the_limit_reaches_the_route(client, key):
    small = b'{"items":[]}'
    response = client.post(
        "/v1/observations", content=small,
        headers={**XA, "Content-Type": "application/json", "Authorization": f"Bearer {key}"},
    )
    assert response.status_code != 413
