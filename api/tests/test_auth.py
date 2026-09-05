import hashlib
from datetime import datetime, timedelta, timezone

from adscope_api.auth import hash_key, new_key, resolve
from adscope_api.models import License

NOW = datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)


def add_license(session, key, **kw):
    session.add(License(key_hash=hash_key(key), label=kw.pop("label", "test"), **kw))
    session.commit()


def test_new_key_is_prefixed_and_unique():
    a, b = new_key(), new_key()
    assert a.startswith("adsc_") and len(a) == 37
    assert a != b


def test_valid_key_resolves(session):
    key = new_key()
    add_license(session, key)
    assert resolve(session, key, now=NOW) is not None


def test_unknown_key_is_rejected(session):
    assert resolve(session, new_key(), now=NOW) is None


def test_inactive_key_is_rejected(session):
    key = new_key()
    add_license(session, key, active=False)
    assert resolve(session, key, now=NOW) is None


def test_expired_key_is_rejected(session):
    key = new_key()
    add_license(session, key, expires_at=NOW - timedelta(days=1))
    assert resolve(session, key, now=NOW) is None


def test_key_expiring_later_is_accepted(session):
    key = new_key()
    add_license(session, key, expires_at=NOW + timedelta(days=30))
    assert resolve(session, key, now=NOW) is not None


def test_raw_key_is_never_stored(session):
    key = new_key()
    add_license(session, key)
    assert session.query(License).one().key_hash == hashlib.sha256(key.encode()).hexdigest()


def test_key_expiring_exactly_now_is_rejected(session):
    key = new_key()
    add_license(session, key, expires_at=NOW)
    assert resolve(session, key, now=NOW) is None
