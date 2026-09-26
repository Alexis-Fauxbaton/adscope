from datetime import datetime, timezone

from adscope_api.digest_text import body_of, money

NOW = datetime(2026, 9, 18, 9, 0, tzinfo=timezone.utc)


def drop(delta, age_days=30):
    return {
        "kind": "drop", "age_days": age_days, "price_before": 12000, "price_after": 11000,
        "window_from": NOW, "window_to": NOW, "price_delta_since_first": delta,
    }


# Fait rougir `sign = "+" if delta is not None and delta > 0 else ""` : un
# cumul positif (prix remonté avant la baisse alertée) doit porter un signe
# explicite, sinon la ligne se lit comme une baisse de ce montant.
def test_a_positive_cumulative_carries_an_explicit_plus_sign():
    assert f"+{money(1200)} depuis le premier prix" in body_of(drop(1200))


def test_a_negative_cumulative_already_carries_its_own_minus_sign():
    assert f"{money(-4000)} depuis le premier prix" in body_of(drop(-4000))


# Fait rougir le `short_date(seen_from) != short_date(seen_to)` de `body_of` :
# deux relevés le même jour donnaient « constatée entre le 24 sept. et le
# 24 sept. » (vu sur le premier email réel d'Alexis, le 2026-09-26).
def test_a_window_within_one_day_says_the_day_once():
    assert "constatée le 18 sept." in body_of(drop(-1000))
    assert "entre le" not in body_of(drop(-1000))


def test_a_window_over_two_days_still_says_both():
    earlier = drop(-1000)
    earlier["window_from"] = datetime(2026, 9, 15, 9, 0, tzinfo=timezone.utc)
    assert "constatée entre le 15 sept. et le 18 sept." in body_of(earlier)

