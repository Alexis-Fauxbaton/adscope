"""Le site sous `/app` : jamais de cache silencieux.

Constaté : après une mise à jour, le navigateur d'Alexis servait encore
l'ancien `web/js/format.js` — seul un rechargement forcé l'a délogé. Les
fichiers de `/app` partaient avec `ETag` et `Last-Modified` mais sans
`Cache-Control` : Chrome décidait seul de la fraîcheur. `adscope_api.static`
force la revalidation à chaque chargement.
"""

from conftest import auth


# Fait rougir `response.headers["cache-control"] = "no-cache"` dans
# `NoCacheStaticFiles.file_response` (adscope_api/static.py) : sans elle, la
# page d'accueil du site part sans consigne de fraîcheur.
def test_app_root_carries_no_cache(client):
    r = client.get("/app/")
    assert r.headers["cache-control"] == "no-cache"


# Même ligne, sur un fichier JavaScript — celui qui restait périmé chez
# Alexis.
def test_a_js_file_carries_no_cache(client):
    r = client.get("/app/js/format.js")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-cache"


# Même ligne, sur une feuille de style.
def test_a_css_file_carries_no_cache(client):
    r = client.get("/app/css/base.css")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-cache"


# Fait rougir le montage sous `NoCacheStaticFiles` dans `main.py` : sans lui,
# `StaticFiles` pose son ETag mais jamais de 304 en-tête de fraîcheur, et le
# test précédent le prouve déjà côté en-tête — celui-ci prouve que la
# revalidation fonctionne réellement de bout en bout.
def test_a_repeat_request_with_the_same_etag_is_not_modified(client):
    first = client.get("/app/js/format.js")
    etag = first.headers["etag"]
    second = client.get("/app/js/format.js", headers={"If-None-Match": etag})
    assert second.status_code == 304


# Fait rougir un montage de `/app` qui appliquerait `no-cache` à `app` tout
# court — la porte `/v1/*` doit rester intacte, sans en-tête de cache que le
# site n'a jamais posé.
def test_v1_routes_are_not_touched(client, key):
    r = client.get("/v1/listings/lc/inconnue", headers=auth(key))
    assert r.status_code == 404
    assert "cache-control" not in {name.lower() for name in r.headers}
