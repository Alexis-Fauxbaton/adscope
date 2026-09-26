"""`GET /v1/digests/runs` : la mesure du planificateur pour l'opérateur —
la carte « L'email du matin » (`.superpowers/planificateur.md`). `clock`
(`conftest.py`) injecte l'instant de la route ; aucun test ici ne lit
l'horloge réelle.
"""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest

from adscope_api.alert_models import DigestRun
from adscope_api.auth import hash_key, new_key
from adscope_api.models import License

from conftest import NOW, auth

PARIS = ZoneInfo("Europe/Paris")
TODAY = NOW.astimezone(PARIS).date()  # 2026-09-18, la même horloge que `clock`


# `/v1/digests/runs` est derrière `require_operator`, comme `/v1/divergences` :
# une licence `automated` l'ouvre par Bearer.
@pytest.fixture
def key(session):
    raw = new_key()
    session.add(License(key_hash=hash_key(raw), label="crawler", automated=True))
    session.commit()
    return raw


def run_row(session, day, sent=1, error=None, attempts=1, due_hour=7, started_at=None,
           trigger="scheduler", accounts=3):
    due_at = datetime.combine(day, datetime.min.time(), tzinfo=PARIS).replace(hour=due_hour)
    row = DigestRun(
        day=day, due_at=due_at, started_at=started_at or due_at,
        finished_at=started_at or due_at, accounts=accounts, sent=sent, error=error,
        trigger=trigger, attempts=attempts,
    )
    session.add(row)
    session.commit()
    return row


# Fait rougir `Depends(require_operator)`.
def test_the_route_is_reserved_to_the_operator(client, session):
    assert client.get("/v1/digests/runs").status_code == 401


# Fait rougir `ran = sum(1 for row in rows if row.sent is not None)` et
# `missed = sum(1 for row in rows if row.sent is None)`.
def test_the_summary_counts_successes_and_failures(client, key, session, clock):
    run_row(session, TODAY, sent=5)
    run_row(session, TODAY - timedelta(days=1), sent=None, error="panne SMTP")
    res = client.get("/v1/digests/runs?days=14", headers=auth(key))
    body = res.json()
    assert (body["days"], body["ran"], body["missed"]) == (14, 1, 1)
    assert body["last_error"] == "panne SMTP"


# Fait rougir la lecture par défaut de `rows` : sans aucune ligne, l'état est
# honnête (ni « manqué », ni « réussi ») — jamais « 14 jours manqués » pour
# un service qui n'a encore jamais eu l'occasion de tourner.
def test_no_rows_at_all_means_neither_ran_nor_missed(client, key, session, clock):
    res = client.get("/v1/digests/runs?days=14", headers=auth(key))
    body = res.json()
    assert (body["ran"], body["missed"], body["runs"], body["last_error"]) == (0, 0, [], None)


# Fait rougir `if row.sent is not None` dans le calcul de `delays` : le
# retard maximal ne se lit que sur des jours réussis, jamais sur un jour en
# panne (`started_at - due_at` n'y voudrait rien dire de comparable).
def test_max_delay_only_looks_at_successful_runs(client, key, session, clock):
    on_time = datetime.combine(TODAY - timedelta(days=1), datetime.min.time(), tzinfo=PARIS)
    on_time = on_time.replace(hour=7, minute=2)
    run_row(session, TODAY - timedelta(days=1), sent=3, started_at=on_time)
    very_late_but_failed = datetime.combine(TODAY, datetime.min.time(), tzinfo=PARIS)
    very_late_but_failed = very_late_but_failed.replace(hour=9, minute=0)
    run_row(session, TODAY, sent=None, error="panne", started_at=very_late_but_failed)
    res = client.get("/v1/digests/runs?days=14", headers=auth(key))
    assert res.json()["max_delay_seconds"] == 120


# Fait rougir `DigestRun.day >= since` : une ligne plus vieille que la
# fenêtre demandée ne compte pas.
def test_a_row_older_than_the_window_is_excluded(client, key, session, clock):
    run_row(session, TODAY - timedelta(days=20), sent=1)
    res = client.get("/v1/digests/runs?days=14", headers=auth(key))
    assert (res.json()["ran"], res.json()["runs"]) == (0, [])


# Fait rougir `"delay_seconds": int((row.started_at - row.due_at)...)` et la
# conversion `.astimezone(PARIS)` : la carte lit l'heure locale telle
# qu'écrite, jamais recalculée côté client.
def test_a_row_carries_the_paris_clock_time_and_its_delay(client, key, session, clock):
    started = datetime.combine(TODAY, datetime.min.time(), tzinfo=PARIS).replace(hour=7, minute=2)
    run_row(session, TODAY, sent=2, started_at=started)
    res = client.get("/v1/digests/runs?days=14", headers=auth(key))
    row = res.json()["runs"][0]
    assert row["started_at"].startswith(f"{TODAY}T07:02:00")
    assert row["delay_seconds"] == 120
    assert (row["accounts"], row["sent"], row["trigger"], row["attempts"]) == (3, 2, "scheduler", 1)


# Fait rougir `if day not in ok_days: days.append(day)` dans `_missed_days` :
# un jour sans AUCUNE ligne (service éteint minuit à minuit) compte comme
# manqué, pas seulement les lignes en erreur — c'est l'angle mort que
# `missed = len(rows) - ran` laissait passer.
def test_a_day_with_no_row_at_all_in_the_middle_of_the_window_counts_as_missed(
    client, key, session, clock,
):
    run_row(session, TODAY - timedelta(days=2), sent=1)
    run_row(session, TODAY, sent=1)  # TODAY - 1 n'a aucune ligne
    res = client.get("/v1/digests/runs?days=14", headers=auth(key))
    body = res.json()
    assert (body["missed"], body["missed_days"]) == (1, [str(TODAY - timedelta(days=1))])


# Fait rougir `return today if now >= due_today else today - timedelta(days=1)`
# dans `_last_judged_day` (branche `else`) : le jour courant n'est pas jugé
# avant sa cible — un manqué ne se déclare pas par avance.
def test_today_before_the_target_hour_does_not_count_as_missed(client, key, session, clock):
    run_row(session, TODAY - timedelta(days=1), sent=1)
    clock.now = datetime.combine(TODAY, time(6, 59), tzinfo=PARIS)  # 07:00 est la cible par défaut
    res = client.get("/v1/digests/runs?days=14", headers=auth(key))
    body = res.json()
    assert (body["missed"], body["missed_days"]) == (0, [])


# Fait rougir la même ligne, branche `if` : passée la cible sans succès, le
# jour courant compte déjà — pas besoin d'attendre demain pour le savoir.
def test_today_after_the_target_hour_without_success_counts_as_missed(
    client, key, session, clock,
):
    run_row(session, TODAY - timedelta(days=1), sent=1)  # rien pour TODAY ; `clock` est déjà 14h à Paris
    res = client.get("/v1/digests/runs?days=14", headers=auth(key))
    body = res.json()
    assert (body["missed"], body["missed_days"]) == (1, [str(TODAY)])


# Fait rougir `first_day = min((row.day for row in rows), default=None)` et
# le `if first_day is None ...: return []` : sans aucune ligne, la liste
# nommée reste vide elle aussi — l'état vide honnête ne nomme aucun jour.
def test_no_rows_at_all_means_no_missed_days(client, key, session, clock):
    res = client.get("/v1/digests/runs?days=14", headers=auth(key))
    assert res.json()["missed_days"] == []
