"""`scheduler.run_due` : la règle pure du planificateur interne — éprouvée
sans horloge réelle, `now` est toujours injecté (`.superpowers/planificateur.md`).
`_tick`/`lifespan` sont la boucle qui l'entoure.
"""

import asyncio
from datetime import date, datetime, timezone

from adscope_api import digest_run, scheduler
from adscope_api.scheduler import lifespan, run_due, _tick

PARIS_NOON_UTC = datetime(2026, 9, 18, 10, 0, tzinfo=timezone.utc)  # 12:00 à Paris (CEST)


def paris_utc(hour, minute=0):
    # `hour`/`minute` sont l'heure locale visée ; -2 h pour l'UTC équivalent
    # (CEST, comme en septembre).
    return datetime(2026, 9, 18, hour - 2, minute, tzinfo=timezone.utc)


# Fait rougir `if not at: return False` : variable vide, jamais d'envoi
# spontané (poste local, tests).
def test_disabled_when_digest_at_is_empty(monkeypatch):
    monkeypatch.setenv("ADSCOPE_DIGEST_AT", "")
    assert run_due(paris_utc(9, 0), None) is False


# Fait rougir `(local.hour, local.minute) >= (hour, minute)` : avant la
# cible, ce n'est pas dû.
def test_false_before_the_target_hour_in_paris_time(monkeypatch):
    monkeypatch.setenv("ADSCOPE_DIGEST_AT", "07:00")
    assert run_due(paris_utc(6, 59), None) is False


def test_true_at_the_target_hour_in_paris_time(monkeypatch):
    monkeypatch.setenv("ADSCOPE_DIGEST_AT", "07:00")
    assert run_due(paris_utc(7, 0), None) is True


# Un service éteint à 7 h rattrape au réveil du même jour.
def test_true_well_after_the_target_hour_catches_up(monkeypatch):
    monkeypatch.setenv("ADSCOPE_DIGEST_AT", "07:00")
    assert run_due(paris_utc(9, 30), None) is True


# Fait rougir `if local.date() == last_run_day: return False` : un
# redémarrage à 7 h 01 n'envoie rien en double.
def test_false_once_last_run_day_is_today(monkeypatch):
    monkeypatch.setenv("ADSCOPE_DIGEST_AT", "07:00")
    today = paris_utc(9, 0).astimezone(scheduler.PARIS).date()
    assert run_due(paris_utc(9, 0), today) is False


def test_true_again_on_the_next_local_day(monkeypatch):
    monkeypatch.setenv("ADSCOPE_DIGEST_AT", "07:00")
    yesterday = date(2026, 9, 17)
    assert run_due(paris_utc(7, 0), yesterday) is True


# Fait rougir `now.astimezone(PARIS)` : sans elle, 22:30 UTC (00:30 le
# lendemain à Paris) se lirait comme 22:30 passé la cible, alors que l'heure
# locale n'a pas encore atteint 07:00 ce nouveau jour.
def test_uses_paris_time_not_utc(monkeypatch):
    monkeypatch.setenv("ADSCOPE_DIGEST_AT", "07:00")
    just_before_midnight_utc = datetime(2026, 9, 18, 22, 30, tzinfo=timezone.utc)
    assert run_due(just_before_midnight_utc, None) is False


# Fait rougir `if not run_due(now, last_run_day): return last_run_day` :
# rien n'est appelé quand ce n'est pas dû.
def test_tick_does_nothing_when_not_due(monkeypatch):
    monkeypatch.setenv("ADSCOPE_DIGEST_AT", "07:00")
    calls = []
    monkeypatch.setattr(digest_run, "record", lambda *a, **k: calls.append(1))
    assert _tick(None, paris_utc(6, 0), None) is None
    assert calls == []


# Fait rougir `result["day"] if result["final"] else last_run_day` (branche
# succès) : le jour mesuré devient le nouveau `last_run_day`.
def test_tick_advances_last_run_day_when_the_run_is_final(monkeypatch):
    monkeypatch.setenv("ADSCOPE_DIGEST_AT", "07:00")
    day = paris_utc(7, 0).astimezone(scheduler.PARIS).date()
    monkeypatch.setattr(digest_run, "record",
                        lambda *a, **k: {"day": day, "final": True})
    assert _tick(None, paris_utc(7, 0), None) == day


# Fait rougir la même ligne (branche échec) : un jour qui reste ouvert ne
# fait pas avancer `last_run_day`, pour que la prochaine minute réessaie.
def test_tick_keeps_the_old_last_run_day_when_the_run_is_not_final(monkeypatch):
    monkeypatch.setenv("ADSCOPE_DIGEST_AT", "07:00")
    monkeypatch.setattr(digest_run, "record",
                        lambda *a, **k: {"day": date(2026, 9, 18), "final": False})
    assert _tick(None, paris_utc(7, 0), None) is None


# Fait rougir `asyncio.create_task(_loop(SessionLocal)) if digest_at() else None` :
# variable vide, aucune tâche — la suite ne déclenche jamais rien.
def test_lifespan_creates_no_task_when_digest_at_is_empty(monkeypatch):
    monkeypatch.setenv("ADSCOPE_DIGEST_AT", "")

    async def scenario():
        before = asyncio.all_tasks()
        async with lifespan(None):
            during = asyncio.all_tasks()
        assert during == before

    asyncio.run(scenario())


# La même ligne, branche activée : une tâche naît à l'entrée et ne survit
# pas à la sortie (`task.cancel()` puis `await task`).
def test_lifespan_creates_and_cancels_a_task_when_enabled(monkeypatch):
    monkeypatch.setenv("ADSCOPE_DIGEST_AT", "07:00")

    async def scenario():
        before = asyncio.all_tasks()
        async with lifespan(None):
            during = asyncio.all_tasks()
            assert len(during) == len(before) + 1
        after = asyncio.all_tasks()
        assert after == before

    asyncio.run(scenario())
