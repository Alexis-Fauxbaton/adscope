"""`/docs`, `/redoc`, `/openapi.json` : fermés par défaut (INJ-1, audit
injection). Ils vivent sur la même origine que le cookie de session, et
Swagger charge son script depuis un CDN sans intégrité — un outil de poste
local, jamais un endroit public.
"""

from adscope_api.config import docs_enabled


# Fait rougir `docs_url=_docs_url` (et ses voisins) dans `main.py` : l'app
# réellement servie par la suite entière — construite une fois, à l'import,
# sans `ADSCOPE_ENABLE_DOCS` posée — ne répond plus sur ces trois routes.
def test_docs_are_closed_on_the_app_actually_served(client):
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404


# Fait rougir `os.environ.get("ADSCOPE_ENABLE_DOCS", "") == "1"` dans
# `config.docs_enabled` : la variable, posée à autre chose qu'"1", ne rouvre
# rien — un `true` ou un `yes` tapé de bonne foi resterait fermé, jamais
# ouvert par accident sur une valeur inattendue.
def test_docs_enabled_reads_the_escape_variable_strictly(monkeypatch):
    monkeypatch.delenv("ADSCOPE_ENABLE_DOCS", raising=False)
    assert docs_enabled() is False
    monkeypatch.setenv("ADSCOPE_ENABLE_DOCS", "yes")
    assert docs_enabled() is False
    monkeypatch.setenv("ADSCOPE_ENABLE_DOCS", "1")
    assert docs_enabled() is True
