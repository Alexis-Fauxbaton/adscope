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
    now = now or datetime.now(timezone.utc)
    license_ = session.get(License, hash_key(key))
    if license_ is None or not license_.active:
        return None
    if license_.expires_at is not None and license_.expires_at <= now:
        return None
    return license_
