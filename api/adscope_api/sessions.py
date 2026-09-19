"""La session de navigateur : ce que le cookie porte, et ce qu'il vaut.

Le secret ne rencontre jamais de comparaison octet par octet : il est réduit à
son empreinte (`hash_token`), et c'est l'empreinte qui sert de clé primaire. La
comparaison est donc à temps constant par construction — il n'y a pas de
comparaison. C'est déjà ainsi que `auth.resolve` traite les clés de licence.

La session est glissante : chaque usage repousse l'échéance de quatre-vingt-dix
jours. Mais une fois par jour au plus — la popup émet plusieurs requêtes par
fiche ouverte, et une écriture par requête ferait de la lecture du marché un
verrou de ligne sur la session du marchand.

Ce module ne connaît ni licence ni compte : il tient la table `sessions` et le
cookie, rien de plus. `auth.require_license` fait le pont, et c'est pourquoi la
dépendance va d'`auth` vers ici, jamais l'inverse.

Rien ici ne lit l'hôte ni le schéma de la requête : `Secure` suit la base
configurée (`is_secure`), pas un en-tête que le client choisit.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from .auth_models import SessionToken
from .config import public_url

COOKIE = "adscope_session"
LIFETIME = timedelta(days=90)
# Le pas du rafraîchissement : en deçà, `last_seen_at` n'est pas réécrit.
REFRESH = timedelta(days=1)
WRITES = ("POST", "PUT", "DELETE")


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# L'instant, injectable : aucun test ne lit l'horloge réelle, et les routes le
# prennent en dépendance plutôt que de l'appeler elles-mêmes.
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def create(session, account_id: int, now: datetime) -> str:
    """Ouvre une session pour ce compte ; rend le secret, la seule fois qu'il
    existe en clair."""
    raw = new_token()
    session.add(SessionToken(
        token_hash=hash_token(raw), account_id=account_id,
        created_at=now, last_seen_at=now, expires_at=now + LIFETIME,
    ))
    return raw


def resolve(session, raw: str, now: datetime) -> SessionToken | None:
    if not raw:
        return None
    row = session.get(SessionToken, hash_token(raw))
    if row is None or row.expires_at <= now:
        return None
    return row


def touch(row: SessionToken, now: datetime) -> bool:
    """Fait glisser l'échéance, une fois par jour au plus ; dit si elle a bougé."""
    if now - row.last_seen_at < REFRESH:
        return False
    row.last_seen_at = now
    row.expires_at = now + LIFETIME
    return True


def drop(session, raw: str) -> None:
    row = session.get(SessionToken, hash_token(raw)) if raw else None
    if row is not None:
        session.delete(row)


# `Secure` suit la base configurée, jamais la requête : l'en-tête `Host` est
# une donnée du client, et un `proxy_pass` sans `proxy_set_header Host` (le
# défaut de nginx) la remplacerait par celle du service en amont — HTTP, même
# derrière un déploiement HTTPS. `ADSCOPE_PUBLIC_URL` est la même base que le
# lien de connexion (`config.public_url`, voir `auth_email.post_login`) :
# une seule source pour les deux.
def is_secure() -> bool:
    return public_url().startswith("https://")


def set_cookie(response, raw: str, secure: bool) -> None:
    response.set_cookie(
        COOKIE, raw, max_age=int(LIFETIME.total_seconds()), path="/",
        httponly=True, samesite="lax", secure=secure,
    )


def clear_cookie(response, secure: bool) -> None:
    response.delete_cookie(
        COOKIE, path="/", httponly=True, samesite="lax", secure=secure
    )


# Un cookie voyage tout seul : une page tierce qui poste vers l'API l'emporte
# avec elle. Un en-tête personnalisé, non — le navigateur exigerait un prévol
# CORS que l'API n'accorde à personne. L'en-tête est donc la preuve que la
# requête vient de nous. Les requêtes par clé en sont dispensées : rien
# d'ambiant ne les authentifie, une page tierce n'a pas la clé.
def check_csrf(request) -> None:
    if request.method in WRITES and request.headers.get("X-Adscope") != "1":
        raise HTTPException(status_code=403, detail="en-tête X-Adscope attendu")
