"""La mesure d'un jour d'email du matin : `record` est la seule porte
d'écriture de `digest_runs`, appelée par le planificateur (`scheduler.py`,
trigger « scheduler ») et par le script (`scripts/send_digests.py`, trigger
« script ») — jamais l'envoi lui-même dupliqué, toujours `digest_send.run`.

Au plus `MAX_ATTEMPTS` essais par jour local (Europe/Paris) : un jour en
erreur ne bloque pas indéfiniment, il s'arrête et se compte « manqué »
(`digest_runs.py`, `GET /v1/digests/runs`).
"""

import logging
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from . import digest_send
from .alert_models import DigestRun
from .auth_models import Account
from .config import digest_at

MAX_ATTEMPTS = 3
PARIS = ZoneInfo("Europe/Paris")
LOG = logging.getLogger("adscope.digest_run")


def _due_at(day: date) -> datetime:
    # `digest_at()` peut être vide (planificateur désactivé) : la mesure,
    # elle, garde toujours une cible — celle par défaut.
    at = digest_at() or "07:00"
    hour, minute = (int(part) for part in at.split(":"))
    return datetime.combine(day, time(hour, minute), tzinfo=PARIS)


def record(session_factory, now: datetime, trigger: str) -> dict:
    """Envoie et mesure le jour local (Europe/Paris) de `now` ; jamais
    l'horloge réelle — `now` est injecté par l'appelant."""
    day = now.astimezone(PARIS).date()
    with session_factory() as session:
        existing = session.get(DigestRun, day)
        if existing is not None and (
            existing.sent is not None or existing.attempts >= MAX_ATTEMPTS
        ):
            return {
                "day": day, "already_done": True, "final": True, "sent": existing.sent,
                "sent_list": [], "error": existing.error, "attempts": existing.attempts,
                "accounts": existing.accounts,
            }
        attempts = (existing.attempts if existing else 0) + 1
        due_at = _due_at(day)
        accounts = session.scalar(select(func.count()).select_from(Account)) or 0
        sent_list, sent, error = [], None, None
        try:
            sent_list = digest_send.run(session_factory, now)
            sent = len(sent_list)
        except Exception as exc:  # noqa: BLE001 - la ligne le journalise, le tick suivant réessaie
            error = str(exc)
        session.execute(
            insert(DigestRun)
            .values(day=day, due_at=due_at, started_at=now, finished_at=now, accounts=accounts,
                    sent=sent, error=error, trigger=trigger, attempts=attempts)
            .on_conflict_do_update(
                index_elements=["day"],
                set_={"due_at": due_at, "started_at": now, "finished_at": now,
                      "accounts": accounts, "sent": sent, "error": error,
                      "trigger": trigger, "attempts": attempts},
            )
        )
        session.commit()
    LOG.info("digest_runs jour=%s retard=%.0fs comptes=%s emails=%s erreur=%s",
             day, (now - due_at).total_seconds(), accounts, sent, error)
    return {
        "day": day, "already_done": False, "final": sent is not None or attempts >= MAX_ATTEMPTS,
        "sent": sent, "sent_list": sent_list, "error": error, "attempts": attempts,
        "accounts": accounts,
    }
