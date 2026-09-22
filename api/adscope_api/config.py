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
