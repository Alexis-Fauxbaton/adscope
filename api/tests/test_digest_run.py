"""`digest_run.record` : la mesure d'un jour d'email du matin — appelée par
le planificateur et par le script, jamais l'envoi dupliqué entre les deux
(`.superpowers/planificateur.md`).
"""

from datetime import datetime, timedelta, timezone

from adscope_api import digest_send
from adscope_api.alert_models import DigestRun, SavedSearch
from adscope_api.auth import hash_key, new_key
from adscope_api.auth_models import Account
from adscope_api.digest_run import MAX_ATTEMPTS, record
from adscope_api.models import License, Listing, PricePoint
from adscope_api.taxonomy import derive

# 07:00 à Paris (CEST, +2 en septembre) — le jour local et le jour UTC
# coïncident, ce qui garde les assertions simples.
NOW = datetime(2026, 9, 18, 5, 0, tzinfo=timezone.utc)
CREATED = NOW - timedelta(days=10)


def account_and_license(session, email="pro@garage.fr"):
    account = Account(email=email)
    session.add(account)
    session.flush()
    key = new_key()
    session.add(License(key_hash=hash_key(key), label="garage", account_id=account.id))
    session.commit()
    return account, key


def dropping_car(session, site_id):
    row = Listing(site="lbc", site_id=site_id, first_seen=NOW - timedelta(days=200),
                  last_seen=NOW, observations=1, brand="Renault", model="Clio",
                  department="75", published_at=NOW - timedelta(days=200))
    row.prices = [
        PricePoint(observed_at=NOW - timedelta(days=5), price=12000, source="user",
                  confirmation=False),
        PricePoint(observed_at=NOW - timedelta(days=1), price=11000, source="user",
                  confirmation=False),
    ]
    derive(row)
    session.add(row)
    session.commit()
    return row


def with_something_to_send(session):
    account, _ = account_and_license(session)
    session.add(SavedSearch(account_id=account.id, name="s", query="brand=Renault",
                            created_at=CREATED, min_age_days=0, min_drop_pct=3))
    session.commit()
    dropping_car(session, "1")
    return account


# Fait rougir `sent = len(sent_list)` : un envoi qui aboutit se compte, jamais
# nul, et le jour se ferme (`final`).
def test_a_successful_run_is_final_with_the_count_sent(sessions):
    with sessions() as session:
        with_something_to_send(session)
    result = record(sessions, NOW, trigger="scheduler")
    assert result == {
        "day": NOW.date(), "already_done": False, "final": True, "sent": 1,
        "sent_list": result["sent_list"], "error": None, "attempts": 1, "accounts": 1,
    }
    with sessions() as session:
        row = session.get(DigestRun, NOW.date())
        assert (row.sent, row.error, row.attempts, row.trigger) == (1, None, 1, "scheduler")


# Fait rougir `sent is not None` dans `final` : un jour sans rien à dire est
# un succès (zéro n'est pas une erreur), pas un jour qui reste ouvert.
def test_a_day_with_nothing_to_send_is_still_final(sessions):
    with sessions() as session:
        account_and_license(session)  # un compte, aucune recherche, rien à dire
    result = record(sessions, NOW, trigger="scheduler")
    assert (result["final"], result["sent"], result["accounts"]) == (True, 0, 1)


# Fait rougir `if existing is not None and (existing.sent is not None or ...)` :
# un jour déjà réussi ne renvoie pas une seconde fois.
def test_a_second_call_the_same_day_does_not_send_again(sessions, monkeypatch):
    with sessions() as session:
        with_something_to_send(session)
    record(sessions, NOW, trigger="scheduler")
    calls = []
    monkeypatch.setattr(digest_send, "run", lambda *a, **k: calls.append(1) or [])
    result = record(sessions, NOW + timedelta(hours=1), trigger="scheduler")
    assert calls == []
    assert result == {
        "day": NOW.date(), "already_done": True, "final": True, "sent": 1,
        "sent_list": [], "error": None, "attempts": 1, "accounts": 1,
    }


# Fait rougir `except Exception as exc: error = str(exc)` : une panne d'envoi
# se journalise, `sent` reste nul, et le jour reste ouvert pour réessayer.
def test_a_failing_send_is_recorded_and_stays_retryable(sessions, monkeypatch):
    monkeypatch.setattr(digest_send, "run", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("panne")))
    result = record(sessions, NOW, trigger="scheduler")
    assert (result["final"], result["sent"], result["error"], result["attempts"]) == (
        False, None, "panne", 1,
    )


# Fait rougir `attempts >= MAX_ATTEMPTS` dans `final` : le troisième échec
# referme le jour — au-delà, plus aucune tentative.
def test_after_max_attempts_a_failing_day_stops_retrying(sessions, monkeypatch):
    monkeypatch.setattr(digest_send, "run", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("panne")))
    for _ in range(MAX_ATTEMPTS):
        result = record(sessions, NOW, trigger="scheduler")
    assert (result["final"], result["attempts"]) == (True, MAX_ATTEMPTS)

    calls = []
    monkeypatch.setattr(digest_send, "run", lambda *a, **k: calls.append(1) or [])
    again = record(sessions, NOW + timedelta(hours=1), trigger="scheduler")
    assert calls == [] and again["already_done"] is True and again["attempts"] == MAX_ATTEMPTS


# Fait rougir `datetime.combine(day, time(hour, minute), tzinfo=PARIS)` dans
# `_due_at` : la cible reste 07:00 heure de Paris, jamais 07:00 UTC.
def test_due_at_is_seven_am_paris_on_that_local_day(sessions):
    result = record(sessions, NOW, trigger="scheduler")
    with sessions() as session:
        row = session.get(DigestRun, result["day"])
    assert row.due_at.astimezone(timezone.utc) == datetime(2026, 9, 18, 5, 0, tzinfo=timezone.utc)


# Fait rougir `select(func.count()).select_from(Account)` : les comptes
# examinés sont tous les comptes, pas seulement ceux qui reçoivent un email.
def test_accounts_counts_every_account_examined(sessions):
    with sessions() as session:
        account_and_license(session, "a@garage.fr")
        account_and_license(session, "b@garage.fr")
        with_something_to_send(session)
    result = record(sessions, NOW, trigger="scheduler")
    assert result["accounts"] == 3


# Fait rougir `"trigger": trigger` : le script et le planificateur laissent
# chacun leur trace, sans quoi la carte opérateur ne saurait dire lequel a
# posé la ligne.
def test_the_trigger_column_records_who_ran_it(sessions):
    record(sessions, NOW, trigger="script")
    with sessions() as session:
        row = session.get(DigestRun, NOW.date())
    assert row.trigger == "script"
