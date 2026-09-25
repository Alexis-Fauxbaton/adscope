"""`config.py` : ce qui décide si le service a le droit de démarrer, et
comment il lit `DATABASE_URL` (C-2/AUTH-08, C-6, audit-config)."""

import pytest

from adscope_api.config import database_url, trusted_proxy, validate_startup


# Fait rougir `for prefix in ("postgresql://", "postgres://"):` dans
# `_normalized` : l'« Internal Database URL » que Render fournit tombe le
# service à l'import avec un `ModuleNotFoundError` sans elle (seul `psycopg`
# 3 est installé).
def test_a_bare_postgres_url_is_normalized_to_psycopg(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@dpg-example/adscope")
    assert database_url() == "postgresql+psycopg://u:p@dpg-example/adscope"


def test_a_bare_postgresql_url_is_normalized_to_psycopg(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@dpg-example/adscope")
    assert database_url() == "postgresql+psycopg://u:p@dpg-example/adscope"


# Un schéma déjà correct traverse tel quel.
def test_an_already_qualified_url_is_left_alone(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@host/db")
    assert database_url() == "postgresql+psycopg://u:p@host/db"


# Fait rougir `return _LOCAL_DATABASE_URL` : sans variable posée, en local
# (`ADSCOPE_ENV` absente), le défaut reste la base locale — comportement
# inchangé.
def test_a_missing_database_url_defaults_to_the_local_database(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("ADSCOPE_ENV", raising=False)
    assert database_url() == "postgresql+psycopg://localhost/adscope"


# Fait rougir `if env() == "production": raise RuntimeError(...)` : en
# production, une base absente ne doit plus écrire silencieusement dans la
# base locale.
def test_a_missing_database_url_in_production_raises_with_a_clear_message(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("ADSCOPE_ENV", "production")
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        database_url()


# Fait rougir `if env() != "production": return` dans `validate_startup` : en
# local, aucune des deux variables n'est exigée.
def test_validate_startup_does_nothing_locally(monkeypatch):
    monkeypatch.delenv("ADSCOPE_ENV", raising=False)
    monkeypatch.delenv("ADSCOPE_PUBLIC_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    validate_startup()  # ne lève pas


# Fait rougir `if not public_url().startswith("https://"):` : en production,
# une adresse publique en `http` (ou absente, donc le défaut `localhost`)
# empêcherait le cookie de session de partir `Secure` — refuser de démarrer
# plutôt que de le laisser voyager en clair.
def test_validate_startup_refuses_a_non_https_public_url_in_production(monkeypatch):
    monkeypatch.setenv("ADSCOPE_ENV", "production")
    monkeypatch.setenv("ADSCOPE_PUBLIC_URL", "http://app.adscope.fr")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@host/db")
    with pytest.raises(RuntimeError, match="https"):
        validate_startup()


def test_validate_startup_passes_with_https_and_a_database_url(monkeypatch):
    monkeypatch.setenv("ADSCOPE_ENV", "production")
    monkeypatch.setenv("ADSCOPE_PUBLIC_URL", "https://app.adscope.fr")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@host/db")
    validate_startup()  # ne lève pas


# Fait rougir `if env() == "production": raise` posé APRÈS le contrôle
# `https` dans `validate_startup` : une base absente doit, elle aussi, être
# refusée en production — pas seulement l'adresse publique.
def test_validate_startup_refuses_a_missing_database_url_in_production(monkeypatch):
    monkeypatch.setenv("ADSCOPE_ENV", "production")
    monkeypatch.setenv("ADSCOPE_PUBLIC_URL", "https://app.adscope.fr")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        validate_startup()


# Fait rougir `os.environ.get("ADSCOPE_TRUSTED_PROXY", "") != ""` : vide par
# défaut, jamais vrai par accident.
def test_trusted_proxy_is_false_by_default(monkeypatch):
    monkeypatch.delenv("ADSCOPE_TRUSTED_PROXY", raising=False)
    assert trusted_proxy() is False
    monkeypatch.setenv("ADSCOPE_TRUSTED_PROXY", "1")
    assert trusted_proxy() is True
