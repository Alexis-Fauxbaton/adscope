import hashlib
import secrets
from datetime import datetime, timezone

from fastapi import Depends, Header, HTTPException

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


# La porte, ici plutôt que dans `main` : les suivis ouvrent leurs routes dans
# leur propre module, et `main` qui les monte ne peut pas leur prêter sa
# dépendance sans que les deux s'importent l'un l'autre.
def require_license(authorization: str = Header(default=""), session=Depends(get_session)):
    scheme, _, key = authorization.partition(" ")
    license_ = resolve(session, key) if scheme.lower() == "bearer" and key else None
    if license_ is None:
        raise HTTPException(status_code=401, detail="licence invalide")
    return license_
