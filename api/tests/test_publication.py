from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from adscope_api.publication import apply

NOW = datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)


def listing(**kw):
    base = dict(published_at=None, bumped_at=None, site_published_first=None,
                site_published_last=None)
    base.update(kw)
    return SimpleNamespace(**base)


def observation(**kw):
    base = dict(published_at=None, bumped_at=None, published_days_ago=None,
                published_precision="day")
    base.update(kw)
    return SimpleNamespace(**base)


# Fait rougir `min(listing.published_at, observation.published_at)` :
# `published_at` ne recule jamais.
def test_published_at_never_moves_backward():
    row = listing(published_at=NOW)
    apply(row, observation(published_at=NOW + timedelta(days=5)), NOW)
    assert row.published_at == NOW


# Fait rougir `max(listing.bumped_at, observation.bumped_at)` : `bumped_at`
# n'avance jamais à rebours.
def test_bumped_at_never_moves_forward_to_an_earlier_moment():
    row = listing(bumped_at=NOW)
    apply(row, observation(bumped_at=NOW - timedelta(days=5)), NOW)
    assert row.bumped_at == NOW


# Fait rougir `listing.site_published_last = published if last is None else
# max(...)`, la branche gardée par `published_precision == "day"` : une
# précision moins fine que le jour ne fait pas avancer la borne haute.
def test_a_coarser_precision_does_not_advance_the_last_bound():
    row = listing(site_published_last=(NOW - timedelta(days=10)).date())
    apply(row, observation(published_days_ago=1, published_precision="month"), NOW)
    assert row.site_published_last == (NOW - timedelta(days=10)).date()
