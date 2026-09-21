from datetime import datetime, timezone

from adscope_api.alert_journal import mark, ref_at, unseen
from adscope_api.alert_models import AlertSent
from adscope_api.auth_models import Account
from adscope_api.models import Listing

NOW = datetime(2026, 9, 18, 9, 0, tzinfo=timezone.utc)


def account(session, email="pro@garage.fr"):
    row = Account(email=email)
    session.add(row)
    session.commit()
    return row


def listing(session, site_id="1"):
    row = Listing(site="lbc", site_id=site_id, first_seen=NOW, last_seen=NOW, observations=1)
    session.add(row)
    session.commit()
    return row


def candidate(listing_id, kind="drop", ref="2026-09-18T09:00:00+00:00"):
    return {"kind": kind, "listing_id": listing_id, "ref": ref}


# Fait rougir `moment.astimezone(timezone.utc).replace(microsecond=0).isoformat()`.
def test_ref_at_drops_the_microseconds():
    at = datetime(2026, 9, 18, 9, 0, 0, 500000, tzinfo=timezone.utc)
    assert ref_at(at) == "2026-09-18T09:00:00+00:00"


# Fait rougir la requête `IN` de `unseen` : la même baisse, deux jours de
# suite, n'est jamais rendue deux fois.
def test_the_same_drop_is_seen_only_once(session):
    a = account(session)
    l = listing(session)
    c = candidate(l.id)
    assert unseen(session, a.id, [c]) == [c]
    mark(session, a.id, [c], NOW)
    session.commit()
    assert unseen(session, a.id, [c]) == []


# Un autre horodatage (`ref` différent) est une ligne de plus.
def test_a_second_drop_with_a_different_ref_is_kept(session):
    a = account(session)
    l = listing(session)
    first = candidate(l.id, ref="2026-09-18T09:00:00+00:00")
    second = candidate(l.id, ref="2026-09-19T09:00:00+00:00")
    mark(session, a.id, [first], NOW)
    session.commit()
    assert unseen(session, a.id, [first, second]) == [second]


# Fait rougir `.on_conflict_do_nothing()` dans `mark` : deux marquages de la
# même ligne ne lèvent pas.
def test_marking_twice_does_not_raise(session):
    a = account(session)
    l = listing(session)
    c = candidate(l.id)
    mark(session, a.id, [c], NOW)
    mark(session, a.id, [c], NOW)
    session.commit()
    assert session.query(AlertSent).count() == 1


# Le journal est propre au compte : un candidat déjà dit pour un compte reste
# à dire pour un autre.
def test_the_journal_is_per_account(session):
    a = account(session, "un@garage.fr")
    b = account(session, "deux@garage.fr")
    l = listing(session)
    c = candidate(l.id)
    mark(session, a.id, [c], NOW)
    session.commit()
    assert unseen(session, b.id, [c]) == [c]
