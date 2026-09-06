import hashlib
import secrets
from datetime import datetime, timezone

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


def mark_automated(session, key_or_hash: str, automated=True) -> License | None:
    """Marque un émetteur qui n'est pas un utilisateur, désigné par sa clé.

    Jamais par le libellé : deux licences peuvent le porter — la base en a deux
    — et une migration qui marquait `label = 'crawler'` marquait au hasard.
    L'empreinte est acceptée pour une licence dont la clé n'est plus en main.
    """
    for candidate in (hash_key(key_or_hash), key_or_hash):
        license_ = session.get(License, candidate)
        if license_ is not None:
            license_.automated = automated
            return license_
    return None
