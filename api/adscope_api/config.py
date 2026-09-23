import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str = os.environ.get(
        "DATABASE_URL", "postgresql+psycopg://localhost/adscope"
    )


settings = Settings()


# L'hôte du lien de vérification envoyé par email — jamais celui de la
# requête. Un `Host` forgé changerait alors l'hôte du lien pour quiconque peut
# appeler `/v1/auth/login`, et un client livrerait son jeton à un inconnu dès
# qu'un vrai transport d'envoi serait branché. Lu à chaque appel, comme
# comme le reste de la configuration lue par variable d'environnement, pour
# rester configurable par test.
# `http://localhost:8000` est l'hôte que l'extension utilise par défaut
# (`extension/src/sw.js`, `DEFAULTS.apiBase`).
def public_url() -> str:
    return os.environ.get("ADSCOPE_PUBLIC_URL", "http://localhost:8000").rstrip("/")


# Le compte opérateur (Alexis) : le seul, en plus des clés de licence, que
# les files de machine (`operator.require_operator`) laissent passer par
# cookie. Vide — le défaut — désigne aucun compte : lu à chaque appel, comme
# `public_url` ci-dessus, pour rester configurable par test.
def operator_email() -> str:
    return os.environ.get("ADSCOPE_OPERATOR_EMAIL", "")


# `/docs`, `/redoc` et `/openapi.json` : fermés par défaut. Ils vivent sur la
# même origine que le cookie de session (`main.py`, `web/` monté sous `/app`)
# et Swagger charge son script depuis `cdn.jsdelivr.net` sans intégrité — une
# compromission du CDN ou du DNS s'exécuterait sur l'origine qui porte la
# session d'un marchand connecté (INJ-1, audit injection). Rien ne les
# ouvrait au développement local avant cette variable : elle vaut donc "1"
# dans l'environnement de poste, jamais en production.
def docs_enabled() -> bool:
    return os.environ.get("ADSCOPE_ENABLE_DOCS", "") == "1"


def docs_urls() -> tuple[str | None, str | None, str | None]:
    """(`docs_url`, `redoc_url`, `openapi_url`) pour `FastAPI(...)` — les trois
    fermés ensemble, ou ouverts ensemble."""
    if not docs_enabled():
        return None, None, None
    return "/docs", "/redoc", "/openapi.json"
