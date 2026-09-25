import hashlib
import secrets
from datetime import datetime, timezone

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import select

from . import sessions
from .db import get_session
from .models import License

KEY_PREFIX = "adsc_"


def new_key() -> str:
    return KEY_PREFIX + secrets.token_hex(16)


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def resolve(session, key: str, now=None) -> License | None:
    if now is None:
        now = datetime.now(timezone.utc)
    license_ = session.get(License, hash_key(key))
    if license_ is None or not license_.active:
        return None
    if license_.expires_at is not None and license_.expires_at <= now:
        return None
    return license_


def by_key_or_hash(session, key_or_hash: str) -> License | None:
    """La licence désignée par sa clé, ou par son empreinte.

    Jamais par le libellé : deux licences peuvent le porter — la base en a deux
    — et une migration qui marquait `label = 'crawler'` marquait au hasard.
    L'empreinte est acceptée pour une licence dont la clé n'est plus en main.
    """
    for candidate in (hash_key(key_or_hash), key_or_hash):
        license_ = session.get(License, candidate)
        if license_ is not None:
            return license_
    return None


def mark_automated(session, key_or_hash: str, automated=True) -> License | None:
    """Marque un émetteur qui n'est pas un utilisateur, désigné par sa clé."""
    license_ = by_key_or_hash(session, key_or_hash)
    if license_ is not None:
        license_.automated = automated
    return license_


def of_account(session, account_id: int, now: datetime) -> License | None:
    """La licence d'un compte : la plus ancienne qui vaille encore.

    Un compte n'en porte qu'une aujourd'hui — `attach_account` fusionne ce qui
    traînait ailleurs sur celle-là. Rien n'empêche qu'il en porte deux demain
    (une machine rattachée au même humain) : l'ordre par date de création rend
    alors toujours la même, plutôt qu'une au hasard de l'index.
    """
    for license_ in session.scalars(
        select(License).where(License.account_id == account_id)
        .order_by(License.created_at, License.key_hash)
    ):
        if license_.active and (license_.expires_at is None or license_.expires_at > now):
            return license_
    return None


# La porte, ici plutôt que dans `main` : les suivis ouvrent leurs routes dans
# leur propre module, et `main` qui les monte ne peut pas leur prêter sa
# dépendance sans que les deux s'importent l'un l'autre.
#
# Deux façons d'entrer, une seule valeur rendue — la licence. Les machines
# portent la clé, un humain porte le cookie de sa session et ne voit jamais de
# clé. Aucune route n'a à savoir laquelle des deux l'a ouverte.
def require_license(request: Request, authorization: str = Header(default=""),
                    session=Depends(get_session), now=Depends(sessions.now_utc)):
    scheme, _, key = authorization.partition(" ")
    if scheme.lower() == "bearer" and key:
        license_ = resolve(session, key, now)
        if license_ is None:
            found = session.get(License, hash_key(key))
            if found is not None and not found.active:
                raise HTTPException(status_code=401, detail="licence suspendue")
            raise HTTPException(status_code=401, detail="licence invalide")
        return license_
    row = sessions.resolve(session, request.cookies.get(sessions.COOKIE, ""), now)
    if row is None:
        raise HTTPException(status_code=401, detail="licence invalide")
    sessions.check_csrf(request)
    license_ = of_account(session, row.account_id, now)
    if license_ is None:
        has_suspended = session.scalar(
            select(License).where(License.account_id == row.account_id,
                                  License.active.is_(False)).limit(1)
        )
        if has_suspended is not None:
            raise HTTPException(status_code=401, detail="licence suspendue")
        raise HTTPException(status_code=401, detail="licence invalide")
    if sessions.touch(row, now):
        session.commit()
    return license_


# La porte des alertes (lot F1) : une recherche enregistrée, un réglage email,
# se lisent au compte, pas à la licence qui interroge l'API en son nom. Une
# clé de machine (`Bearer`, sans compte) passe `require_license` mais s'arrête
# ici — 403, jamais 401 : la clé est valide, il lui manque un compte.
def require_account(license_=Depends(require_license)) -> int:
    if license_.account_id is None:
        raise HTTPException(status_code=403, detail="compte requis")
    return license_.account_id


# Changer son mot de passe (`/v1/auth/password`) est un geste humain, jamais
# celui d'une clé de machine : `require_account`, via `require_license`,
# accepte pourtant un `Bearer` (revue de code — la clé de licence du crawler,
# en clair dans `crawler/.license`, suffirait sinon). Cette porte n'ouvre
# qu'au cookie de session, comme `require_license` le fait pour lui.
def require_account_by_cookie(request: Request, session=Depends(get_session),
                              now=Depends(sessions.now_utc)) -> int:
    row = sessions.resolve(session, request.cookies.get(sessions.COOKIE, ""), now)
    if row is None:
        raise HTTPException(status_code=401, detail="session invalide")
    sessions.check_csrf(request)
    if sessions.touch(row, now):
        session.commit()
    return row.account_id
