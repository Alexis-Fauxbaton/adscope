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

`missed` ne compte que les jours qui portent une ligne : un jour jamais
atteint (avant le premier déploiement, ou pas encore dû aujourd'hui) n'a pas
de ligne du tout, et ne compte donc ni pour ni contre — c'est l'état vide
honnête de la carte, pas « tout est manqué ».
"""

from datetime import timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from .alert_models import DigestRun
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


@router.get("/v1/digests/runs")
def get_digest_runs(days: int = Query(default=14, ge=1, le=365), session=Depends(get_session),
                    _=Depends(require_operator), now=Depends(now_utc)):
    since = now.astimezone(PARIS).date() - timedelta(days=days - 1)
    rows = session.scalars(
        select(DigestRun).where(DigestRun.day >= since).order_by(DigestRun.day.desc())
    ).all()
    ran = sum(1 for row in rows if row.sent is not None)
    missed = len(rows) - ran
    delays = [(row.started_at - row.due_at).total_seconds() for row in rows if row.sent is not None]
    last_error = next((row.error for row in rows if row.error), None)
    return {
        "days": days, "ran": ran, "missed": missed,
        "max_delay_seconds": int(max(delays)) if delays else 0,
        "last_error": last_error, "runs": [_out(row) for row in rows],
    }
