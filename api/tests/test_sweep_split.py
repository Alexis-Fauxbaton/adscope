"""`sweep_split.cut` seul, sans passer par `/v1/sweep` : la coupe elle-même,
jusqu'à sa limite (test-quality-guardian, /audit-project,
`api/adscope_api/sweep_split.py:53`)."""

from datetime import datetime, timezone

from adscope_api import sweep_split
from adscope_api.auth import resolve
from adscope_api.market_params import MarketParams
from adscope_api.models import Listing, PricePoint
from adscope_api.taxonomy import derive

NOW = datetime(2026, 9, 18, 12, 0, tzinfo=timezone.utc)


def car(session, site_id, price=10):
    row = Listing(site="lbc", site_id=site_id, first_seen=NOW, last_seen=NOW,
                  observations=1, brand="Peugeot", model="208", seller_type="pro")
    row.prices = [PricePoint(observed_at=NOW, price=price, source="user", confirmation=False)]
    derive(row)
    session.add(row)
    return row


# Fait rougir `else: return None` de `cut` : au-delà de `PAGE_CAP` (20 pages,
# ~665 annonces), le découpage par `owner_type` puis deux tours de prix ne
# suffisent plus si tout le monde est du même côté à chaque tour — ici, un
# seul type de vendeur ("pro") et un même prix (10), sous chaque `mid`
# calculé. La recherche doit ressortir `None`, jamais une liste tronquée en
# silence.
def test_a_search_too_large_even_after_every_split_comes_back_none(session, key):
    for i in range(700):
        car(session, str(i))
    session.commit()
    license_ = resolve(session, key)
    params = MarketParams(brand="Peugeot", model="208")
    assert sweep_split.cut(session, license_, NOW, params) is None


# Contre-épreuve : sous le plafond, `cut` rend une seule entrée — jamais
# `None` — pour la même recherche, seulement moins d'annonces.
def test_a_search_that_fits_returns_one_entry_not_none(session, key):
    car(session, "1")
    session.commit()
    license_ = resolve(session, key)
    params = MarketParams(brand="Peugeot", model="208")
    result = sweep_split.cut(session, license_, NOW, params)
    assert result is not None
    assert len(result) == 1
    assert result[0][1] == 1  # expected_total
