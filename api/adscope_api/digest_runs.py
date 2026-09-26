"""`GET /v1/digests/runs` : la mesure du planificateur pour l'opérateur — la
carte « L'email du matin » de `web/ecarts.html`. Alexis veut répondre en dix
secondes à « est-ce que ça part, à l'heure, et sinon pourquoi »
(`.superpowers/planificateur.md`). Porte aussi `/healthz` (la sonde Render,
`render.yaml`) : `main.py` est au plafond de ses 150 lignes, et les deux
routes tiennent dans le même import plutôt qu'un fichier `healthz.py` d'une
poignée de lignes pour une seule ligne d'inclusion de plus.

Enregistrée AVANT `digests.router` dans `main.py` : `/v1/digests/{digest_id}`
matcherait sinon « runs » comme un identifiant (et le rejetterait, 422,
avant même d'y voir un chemin différent) — Starlette essaie les routes dans
l'ordre où elles ont été ajoutées, jamais par spécificité du gabarit.

`missed` compte des JOURS civils (Europe/Paris), pas des lignes : depuis le
premier jour qui porte une ligne (jamais avant — l'état vide honnête d'un
service pas encore déployé) jusqu'à hier inclus, plus aujourd'hui une fois
son heure cible passée. Un jour y compte dès qu'il n'a pas de ligne réussie
— qu'il porte une ligne en erreur ou qu'il n'en porte aucune : un service
resté éteint minuit à minuit n'écrit rien, et ne doit pas s'en trouver
oublié (c'était l'angle mort de `missed = len(rows) - ran`).
"""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from .alert_models import DigestRun
from .config import digest_at
from .db import get_session
from .operator import require_operator
from .sessions import now_utc

router = APIRouter()

PARIS = ZoneInfo("Europe/Paris")


@router.get("/healthz")
def healthz():
    return {"ok": True}


def _out(row: DigestRun) -> dict:
    return {
        "day": row.day, "due_at": row.due_at.astimezone(PARIS),
        "started_at": row.started_at.astimezone(PARIS),
        "finished_at": row.finished_at.astimezone(PARIS) if row.finished_at else None,
        "accounts": row.accounts, "sent": row.sent, "error": row.error,
        "trigger": row.trigger, "attempts": row.attempts,
        "delay_seconds": int((row.started_at - row.due_at).total_seconds()),
    }


def _last_judged_day(now: datetime) -> date:
    """Hier, ou aujourd'hui si son heure cible (Europe/Paris) est déjà
    passée : un jour ne se déclare pas manqué avant d'avoir eu sa chance.
    Même repli que `digest_run._due_at` — `digest_at()` vide garde tout de
    même une cible pour la mesure."""
    today = now.astimezone(PARIS).date()
    hour, minute = (int(part) for part in (digest_at() or "07:00").split(":"))
    due_today = datetime.combine(today, time(hour, minute), tzinfo=PARIS)
    return today if now >= due_today else today - timedelta(days=1)


def _missed_days(rows, now: datetime) -> list[date]:
    """Les jours civils sans envoi réussi, depuis le premier jour qui porte
    une ligne jusqu'au dernier jour jugé (voir le docstring du module)."""
    first_day = min((row.day for row in rows), default=None)
    last_day = _last_judged_day(now)
    if first_day is None or first_day > last_day:
        return []
    ok_days = {row.day for row in rows if row.sent is not None and row.error is None}
    days, day = [], first_day
    while day <= last_day:
        if day not in ok_days:
            days.append(day)
        day += timedelta(days=1)
    return days


@router.get("/v1/digests/runs")
def get_digest_runs(days: int = Query(default=14, ge=1, le=365), session=Depends(get_session),
                    _=Depends(require_operator), now=Depends(now_utc)):
    since = now.astimezone(PARIS).date() - timedelta(days=days - 1)
    rows = session.scalars(
        select(DigestRun).where(DigestRun.day >= since).order_by(DigestRun.day.desc())
    ).all()
    ran = sum(1 for row in rows if row.sent is not None)
    missed_days = _missed_days(rows, now)
    delays = [(row.started_at - row.due_at).total_seconds() for row in rows if row.sent is not None]
    last_error = next((row.error for row in rows if row.error), None)
    return {
        "days": days, "ran": ran, "missed": len(missed_days), "missed_days": missed_days,
        "max_delay_seconds": int(max(delays)) if delays else 0,
        "last_error": last_error, "runs": [_out(row) for row in rows],
    }
