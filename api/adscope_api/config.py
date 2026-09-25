import os

_LOCAL_DATABASE_URL = "postgresql+psycopg://localhost/adscope"


# L'environnement de service : vide (poste local) ou "production" — la seule
# valeur qui active les refus de démarrage ci-dessous (C-2/AUTH-08, C-6,
# audit-config). Lu à chaque appel, comme le reste de cette configuration.
def env() -> str:
    return os.environ.get("ADSCOPE_ENV", "")


def _normalized(raw: str) -> str:
    """Render fournit `postgres://` ou `postgresql://` ; seul le dialecte
    `psycopg` (3) est installé — sans la normalisation, le service tombe à
    l'import avec un `ModuleNotFoundError`/`NoSuchModuleError` qui ne dit rien
    de la cause (C-6, audit-config)."""
    for prefix in ("postgresql://", "postgres://"):
        if raw.startswith(prefix):
            return "postgresql+psycopg://" + raw[len(prefix):]
    return raw


# Jamais figée à l'import (l'ancien `Settings(frozen=True)` la lisait une
# fois pour toutes) : comme `public_url`/`operator_email`, une valeur posée
# après coup — par un script, par un test — doit compter (C-6, audit-config).
def database_url() -> str:
    raw = os.environ.get("DATABASE_URL")
    if raw is None:
        if env() == "production":
            raise RuntimeError(
                "DATABASE_URL absente : le service refuse de démarrer sur la "
                "base locale par défaut en production (ADSCOPE_ENV=production). "
                "Pose la variable — voir api/DEPLOY.md."
            )
        return _LOCAL_DATABASE_URL
    return _normalized(raw)


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
# `.strip().lower()` — un espace en trop dans un champ de tableau de bord
# Render (ou une casse différente de celle tapée à l'inscription) fermait la
# porte en silence : Alexis perdait `/v1/sweep` sans aucun message (C-9,
# audit-config). Même normalisation que `payload.email.strip().lower()` à
# l'inscription (`auth_signup.py`).
def operator_email() -> str:
    return os.environ.get("ADSCOPE_OPERATOR_EMAIL", "").strip().lower()


# Vide par défaut : `X-Forwarded-For` n'est jamais une donnée de confiance
# sans décision explicite. Derrière un proxy qui ne le pose pas (poste local,
# tout autre déploiement), l'en-tête est une donnée du CLIENT — un tiers qui
# l'envoie contournerait le plafond par IP de `rate_limit.guard` (AUTH-06/C-1,
# audit-config). Sur Render, la frontière réseau reste `--forwarded-allow-ips`
# (voir `api/DEPLOY.md`) : cette variable dit si, en plus, l'application lit
# elle-même l'en-tête pour ses propres plafonds.
def trusted_proxy() -> bool:
    return os.environ.get("ADSCOPE_TRUSTED_PROXY", "") != ""


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


# Appelée une fois par `main.py`, à l'import : en local (`ADSCOPE_ENV` vide),
# rien ne change, aucune des deux variables n'est validée. En production, un
# schéma non-`https` enverrait le cookie de session de 90 jours en clair et
# les liens d'email vers `localhost` (C-2/AUTH-08) ; une base de données non
# posée écrirait silencieusement dans la base locale par défaut (C-6) — les
# deux sont des refus de démarrer, pas des avertissements.
def validate_startup() -> None:
    if env() != "production":
        return
    if not public_url().startswith("https://"):
        raise RuntimeError(
            "ADSCOPE_ENV=production exige ADSCOPE_PUBLIC_URL en https:// "
            "(le cookie de session partirait sans Secure) — voir api/DEPLOY.md."
        )
    database_url()  # lève RuntimeError si DATABASE_URL est absente
