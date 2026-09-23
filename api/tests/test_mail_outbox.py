"""`mail_outbox.purge_expired` : une ligne `mails` ne survit pas indéfiniment
au jeton qu'elle porte en clair (C-3/D3, audits config et données).
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from adscope_api import mail_outbox
from adscope_api.auth_models import Account, Mail

NOW = datetime(2026, 9, 18, 12, 0, tzinfo=timezone.utc)


def _mail(session, created_at):
    account = Account(email=f"m{created_at.timestamp()}@garage.fr")
    session.add(account)
    session.flush()
    session.add(Mail(account_id=account.id, kind="verification", subject="x", text="y",
                     created_at=created_at))
    session.commit()


# Fait rougir `Mail.created_at < now - RETENTION` : une ligne plus récente que
# la rétention n'est pas balayée, un lien encore vivant doit rester lisible.
def test_a_recent_mail_survives_the_purge(session):
    _mail(session, NOW - timedelta(minutes=30))
    mail_outbox.purge_expired(session, NOW)
    session.commit()
    assert session.scalar(select(func.count()).select_from(Mail)) == 1


def test_an_expired_mail_is_purged(session):
    _mail(session, NOW - mail_outbox.RETENTION - timedelta(minutes=1))
    mail_outbox.purge_expired(session, NOW)
    session.commit()
    assert session.scalar(select(func.count()).select_from(Mail)) == 0


def test_purge_runs_opportunistically_on_the_observations_route(client, session, key):
    from conftest import auth

    _mail(session, NOW - mail_outbox.RETENTION - timedelta(minutes=1))
    client.post("/v1/observations", json={"items": [{"site": "lc", "site_id": "1"}]},
               headers=auth(key))
    assert session.scalar(select(func.count()).select_from(Mail)) == 0
