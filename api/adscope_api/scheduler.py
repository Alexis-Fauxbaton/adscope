"""Le planificateur interne : réveille toutes les 60 s pour poser l'email du
matin sans cron externe facturé à l'usage — décision d'Alexis (2026-09-26,
`.superpowers/planificateur.md`). `run_due` est la règle pure, éprouvée sans
horloge réelle ; `lifespan` l'entoure pour vivre dans le cycle de
l'application (jamais à l'import : les tests qui importent `main` sans
entrer dans son `lifespan` — la fixture `client` de `conftest.py` — ne
voient jamais tourner cette boucle), et reste éteint quand
`ADSCOPE_DIGEST_AT` est vide : le poste local et les tests n'ont pas
d'envoi spontané.
"""

import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from . import digest_run
from .config import digest_at
from .db import SessionLocal

TICK_SECONDS = 60
PARIS = ZoneInfo("Europe/Paris")
LOG = logging.getLogger("adscope.scheduler")


def run_due(now: datetime, last_run_day: date | None) -> bool:
    """Vrai si l'heure locale (Europe/Paris) a atteint `ADSCOPE_DIGEST_AT`
    et qu'aucune exécution n'a eu lieu ce jour local. `now` est conscient du
    fuseau ; jamais l'horloge réelle — injectée par l'appelant."""
    at = digest_at()
    if not at:
        return False
    local = now.astimezone(PARIS)
    if local.date() == last_run_day:
        return False
    hour, minute = (int(part) for part in at.split(":"))
    return (local.hour, local.minute) >= (hour, minute)


def _tick(session_factory, now: datetime, last_run_day: date | None) -> date | None:
    """Une itération : rend le `last_run_day` à retenir pour la suivante —
    inchangé si ce n'est pas dû, ou si le jour reste ouvert (erreur,
    tentatives non épuisées)."""
    if not run_due(now, last_run_day):
        return last_run_day
    result = digest_run.record(session_factory, now, trigger="scheduler")
    return result["day"] if result["final"] else last_run_day


async def _loop(session_factory) -> None:
    last_run_day = None
    loop = asyncio.get_running_loop()
    while True:
        await asyncio.sleep(TICK_SECONDS)
        now = datetime.now(timezone.utc)
        last_run_day = await loop.run_in_executor(
            None, _tick, session_factory, now, last_run_day
        )


@asynccontextmanager
async def lifespan(app):
    """Passée à `FastAPI(lifespan=...)` dans `main.py`. Aucune tâche quand
    `ADSCOPE_DIGEST_AT` est vide — voir le docstring du module."""
    task = asyncio.create_task(_loop(SessionLocal)) if digest_at() else None
    yield
    if task is not None:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
