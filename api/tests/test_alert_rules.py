from datetime import datetime, timedelta, timezone

from adscope_api.alert_follows import follows_for
from adscope_api.alert_models import SavedSearch
from adscope_api.alert_rules import drops_for, new_for
from adscope_api.auth import hash_key, new_key, resolve
from adscope_api.auth_models import Account
from adscope_api.follow_models import Follow
from adscope_api.models import License, Listing, PricePoint
from adscope_api.taxonomy import derive

NOW = datetime(2026, 9, 18, 9, 0, tzinfo=timezone.utc)
CREATED = NOW - timedelta(days=10)


def car(session, site_id, *, brand="Renault", model="Clio", year=2015, published=None,
        department="75", last_seen=NOW, absent_since=None, first_seen=NOW - timedelta(days=200),
        prices=()):
    row = Listing(site="lbc", site_id=site_id, first_seen=first_seen, last_seen=last_seen,
                  observations=1, brand=brand, model=model, year=year, department=department,
                  published_at=published, absent_since=absent_since)
    row.prices = [
        PricePoint(observed_at=at, price=price, source="user", confirmation=confirmation)
        for at, price, confirmation in prices
    ]
    derive(row)
    session.add(row)
    session.commit()
    return row


def account_and_license(session, email="pro@garage.fr"):
    account = Account(email=email)
    session.add(account)
    session.flush()
    key = new_key()
    session.add(License(key_hash=hash_key(key), label="garage", account_id=account.id))
    session.commit()
    return account, key


def saved(session, account_id, **kw):
    row = SavedSearch(
        account_id=account_id, name=kw.pop("name", "s"), query=kw.pop("query", "brand=Renault"),
        created_at=kw.pop("created_at", CREATED), min_age_days=kw.pop("min_age_days", 30),
        min_drop_pct=kw.pop("min_drop_pct", 3), notify_new=kw.pop("notify_new", False),
        notify_drops=True, paused=False,
    )
    session.add(row)
    session.commit()
    return row


def old_prices(base=12000, published_days=200):
    return dict(
        published=NOW - timedelta(days=published_days),
        prices=[
            (NOW - timedelta(days=5), base, False),
            (NOW - timedelta(days=1), base - 1000, False),
        ],
    )


# Fait rougir `windowed.c.observed_at > search.created_at` dans `drops_for` :
# une baisse antérieure à l'enregistrement de la recherche n'alerte pas.
def test_a_drop_before_the_search_was_created_does_not_alert(session):
    account, key = account_and_license(session)
    s = saved(session, account.id, created_at=NOW)  # créée après la seule baisse
    car(session, "1", published=NOW - timedelta(days=200), prices=[
        (NOW - timedelta(days=5), 12000, False), (NOW - timedelta(days=4), 11000, False),
    ])
    assert drops_for(session, s, resolve(session, key), NOW) == []


# Fait rougir `(prev - price) * 100 >= min_drop_pct * prev`.
def test_a_drop_below_the_threshold_does_not_alert(session):
    account, key = account_and_license(session)
    s = saved(session, account.id, min_drop_pct=10)
    car(session, "1", **old_prices(base=10000))  # 1000/10000 = 10 % pile
    car(session, "2", published=NOW - timedelta(days=200), prices=[
        (NOW - timedelta(days=5), 10000, False), (NOW - timedelta(days=1), 9950, False),
    ])
    results = drops_for(session, s, resolve(session, key), NOW)
    assert [r["listing_id"] for r in results] == [
        session.query(Listing).filter_by(site_id="1").one().id
    ]


# Fait rougir le `max(...)` du `min_age_days` : la recherche demande 90 jours,
# l'annonce n'en a que 60.
def test_a_listing_younger_than_the_rule_threshold_does_not_alert(session):
    account, key = account_and_license(session)
    s = saved(session, account.id, min_age_days=90)
    car(session, "1", **old_prices(published_days=60))
    assert drops_for(session, s, resolve(session, key), NOW) == []


# Le même `max(...)`, dans l'autre sens : le filtre du marché (`min_age_days`
# dans la `query`) l'emporte quand il est plus haut que celui de la règle.
def test_the_market_filters_min_age_days_wins_when_higher(session):
    account, key = account_and_license(session)
    s = saved(session, account.id, query="min_age_days=90", min_age_days=30)
    car(session, "1", **old_prices(published_days=60))
    assert drops_for(session, s, resolve(session, key), NOW) == []


# Fait rougir `Listing.last_seen >= now - SEEN_WINDOW`.
def test_a_listing_not_seen_within_48h_does_not_alert(session):
    account, key = account_and_license(session)
    s = saved(session, account.id)
    car(session, "1", last_seen=NOW - timedelta(hours=49), **old_prices())
    assert drops_for(session, s, resolve(session, key), NOW) == []


# Fait rougir `Listing.absent_since.is_(None)`.
def test_a_listing_pending_absence_does_not_alert(session):
    account, key = account_and_license(session)
    s = saved(session, account.id)
    car(session, "1", absent_since=NOW - timedelta(hours=1), **old_prices())
    assert drops_for(session, s, resolve(session, key), NOW) == []


# Fait rougir `PricePoint.confirmation.is_(False)` dans la fenêtre : une
# confirmation (même prix) ne compte pas comme une baisse.
def test_a_confirmation_is_not_a_drop(session):
    account, key = account_and_license(session)
    s = saved(session, account.id)
    car(session, "1", published=NOW - timedelta(days=200), prices=[
        (NOW - timedelta(days=5), 10000, False),
        (NOW - timedelta(days=3), 10000, True),
        (NOW - timedelta(days=1), 10000, True),
    ])
    assert drops_for(session, s, resolve(session, key), NOW) == []


# Fait rougir `lag(observed_at)` : la fenêtre honnête va du relevé précédent
# au relevé de la baisse.
def test_the_honest_window_spans_the_previous_reading_to_the_drop(session):
    account, key = account_and_license(session)
    s = saved(session, account.id)
    prev_at = NOW - timedelta(days=5)
    drop_at = NOW - timedelta(days=1)
    car(session, "1", published=NOW - timedelta(days=200), prices=[
        (prev_at, 12000, False), (drop_at, 10000, False),
    ])
    [candidate] = drops_for(session, s, resolve(session, key), NOW)
    assert (candidate["window_from"], candidate["window_to"]) == (prev_at, drop_at)


# Fait rougir `row.price_delta_since_first` (`market_query.core`) : la baisse
# cumulée part du premier prix, pas du précédent.
def test_the_cumulative_drop_is_since_the_first_price(session):
    account, key = account_and_license(session)
    s = saved(session, account.id)
    car(session, "1", published=NOW - timedelta(days=200), prices=[
        (NOW - timedelta(days=20), 15000, False),
        (NOW - timedelta(days=1), 11000, False),
    ])
    [candidate] = drops_for(session, s, resolve(session, key), NOW)
    assert candidate["price_delta_since_first"] == -4000


# Fait rougir `.distinct(windowed.c.listing_id)` : cinq relevés en baisse sur
# la même annonce ne rendent qu'une ligne, la plus récente — pas une par
# relevé (sinon le quota de 15 lignes se mange en 3-4 voitures).
def test_several_drops_on_the_same_listing_produce_one_line(session):
    account, key = account_and_license(session)
    s = saved(session, account.id)
    car(session, "1", published=NOW - timedelta(days=200), prices=[
        (NOW - timedelta(days=9), 20000, False), (NOW - timedelta(days=7), 19000, False),
        (NOW - timedelta(days=5), 18000, False), (NOW - timedelta(days=3), 17000, False),
        (NOW - timedelta(days=1), 16000, False),
    ])
    results = drops_for(session, s, resolve(session, key), NOW)
    assert len(results) == 1
    assert (results[0]["price_before"], results[0]["price_after"]) == (17000, 16000)


# Fait rougir `price_delta_since_first=row.price - row.first_price` : le
# cumul est daté au relevé de la ligne, pas à la valeur du jour — une hausse
# survenue après la baisse alertée ne doit pas en maquiller le cumul en signe
# positif.
def test_the_cumulative_is_dated_to_the_drop_not_to_todays_price(session):
    account, key = account_and_license(session)
    s = saved(session, account.id)
    car(session, "1", published=NOW - timedelta(days=200), prices=[
        (NOW - timedelta(days=20), 10000, False), (NOW - timedelta(days=9), 12000, False),
        (NOW - timedelta(days=5), 9000, False), (NOW - timedelta(days=1), 11000, False),
    ])
    [candidate] = drops_for(session, s, resolve(session, key), NOW)
    assert (candidate["price_before"], candidate["price_after"]) == (12000, 9000)
    assert candidate["price_delta_since_first"] == -1000


# Fait rougir `Listing.disappeared_at.is_(None)` (`market_query.core`),
# gardé ici pour que le lot réponde de son propre comportement si la ligne
# bougeait ailleurs : une annonce disparue n'alerte pas.
def test_a_disappeared_listing_does_not_alert(session):
    account, key = account_and_license(session)
    s = saved(session, account.id)
    car(session, "1", **old_prices())
    session.query(Listing).filter_by(site_id="1").one().disappeared_at = NOW - timedelta(hours=1)
    session.commit()
    assert drops_for(session, s, resolve(session, key), NOW) == []


# Fait rougir `kwargs["min_age_days"] = threshold or None` : un seuil nul
# n'exclut plus les annonces d'âge inconnu (`age` NULL).
def test_min_age_days_zero_does_not_exclude_unknown_age(session):
    account, key = account_and_license(session)
    s = saved(session, account.id, notify_new=True, min_age_days=0,
             created_at=NOW - timedelta(days=1))
    car(session, "1", first_seen=NOW - timedelta(hours=1), last_seen=NOW, published=None)
    [candidate] = new_for(session, s, resolve(session, key), NOW)
    assert candidate["age_days"] is None


# Fait rougir `where(paused.is_(False))` — en fait, le filtre est côté
# appelant (`digest_build`) : une recherche en pause reste testée ici via
# `drops_for` directement, en pause elle n'est simplement jamais interrogée.
def test_a_paused_search_is_skipped_by_the_caller_not_by_drops_for(session):
    account, key = account_and_license(session)
    s = saved(session, account.id)
    s.paused = True
    car(session, "1", **old_prices())
    # `drops_for` ne connaît pas la pause : c'est `digest_build` qui filtre
    # les recherches en amont (voir `test_digest.py`).
    assert len(drops_for(session, s, resolve(session, key), NOW)) == 1


# Fait rougir `if not search.notify_new: return []`.
def test_notify_new_false_means_no_new_listing_alert(session):
    account, key = account_and_license(session)
    s = saved(session, account.id, notify_new=False, min_age_days=0)
    car(session, "1", first_seen=NOW - timedelta(hours=1), last_seen=NOW,
        published=NOW - timedelta(hours=1))
    assert new_for(session, s, resolve(session, key), NOW) == []


# Fait rougir `Listing.first_seen > search.created_at`.
def test_a_new_listing_seen_before_the_search_was_created_does_not_alert(session):
    account, key = account_and_license(session)
    s = saved(session, account.id, notify_new=True, created_at=NOW)
    car(session, "1", first_seen=NOW - timedelta(days=1), last_seen=NOW)
    assert new_for(session, s, resolve(session, key), NOW) == []


def test_a_new_listing_after_the_search_was_created_alerts(session):
    account, key = account_and_license(session)
    s = saved(session, account.id, notify_new=True, created_at=NOW - timedelta(days=1),
              min_age_days=0)
    car(session, "1", first_seen=NOW - timedelta(hours=1), last_seen=NOW,
        published=NOW - timedelta(hours=1))
    [candidate] = new_for(session, s, resolve(session, key), NOW)
    assert candidate["kind"] == "new"


# Fait rougir `of_account` dans `alert_follows.follows_for` : un compte sans
# licence valable rend une liste vide, sans lever.
def test_an_account_without_a_valid_license_returns_an_empty_list(session):
    account = Account(email="sans-licence@garage.fr")
    session.add(account)
    session.commit()
    assert follows_for(session, account.id, NOW) == []


# Fait rougir l'appel à `feed_query.feed_for` dans `follows_for` : les
# candidats sortent bien du feed, rien d'autre.
def test_follows_only_carries_what_the_feed_carries(session):
    account, key = account_and_license(session)
    listing = car(session, "1", published=NOW - timedelta(days=200), prices=[
        (NOW - timedelta(days=5), 12000, False), (NOW - timedelta(days=1), 11000, False),
    ])
    session.add(Follow(license_key_hash=hash_key(key), listing_id=listing.id,
                       followed_at=NOW - timedelta(days=30)))
    session.commit()
    candidates = follows_for(session, account.id, NOW)
    assert [c["kind"] for c in candidates] == ["drop"]
    assert candidates[0]["listing_id"] == listing.id


def licensed(session, automated=False, label="x"):
    key_hash = hash_key(new_key())
    session.add(License(key_hash=key_hash, label=label, automated=automated))
    session.commit()
    return key_hash


# Fait rougir la condition `confirmed`, posée seulement si le drapeau est vrai.
def test_a_drop_last_seen_by_a_merchant_waits_for_the_robot(session, monkeypatch):
    monkeypatch.setenv("ADSCOPE_ALERTS_CONFIRMED_ONLY", "1")
    account, key = account_and_license(session)
    s = saved(session, account.id, created_at=CREATED)
    merchant_key = licensed(session)
    listing = car(session, "1", published=NOW - timedelta(days=200))
    session.add(PricePoint(listing_id=listing.id, observed_at=NOW - timedelta(days=5),
                           price=12000, source="user", confirmation=False))
    session.add(PricePoint(listing_id=listing.id, observed_at=NOW - timedelta(days=1),
                           price=11000, source="user", confirmation=False,
                           license_key_hash=merchant_key))
    session.commit()
    assert drops_for(session, s, resolve(session, key), NOW) == []


# Fait rougir la même condition, sens inverse : un relevé automated postérieur
# à la baisse la confirme.
def test_the_same_drop_passes_once_the_robot_has_followed(session, monkeypatch):
    monkeypatch.setenv("ADSCOPE_ALERTS_CONFIRMED_ONLY", "1")
    account, key = account_and_license(session)
    s = saved(session, account.id, created_at=CREATED)
    merchant_key = licensed(session)
    robot_key = licensed(session, automated=True)
    listing = car(session, "1", published=NOW - timedelta(days=200))
    session.add(PricePoint(listing_id=listing.id, observed_at=NOW - timedelta(days=5),
                           price=12000, source="user", confirmation=False))
    session.add(PricePoint(listing_id=listing.id, observed_at=NOW - timedelta(days=1),
                           price=11000, source="user", confirmation=False,
                           license_key_hash=merchant_key))
    session.add(PricePoint(listing_id=listing.id, observed_at=NOW - timedelta(hours=1),
                           price=11000, source="crawler", confirmation=True,
                           license_key_hash=robot_key))
    session.commit()
    results = drops_for(session, s, resolve(session, key), NOW)
    assert [r["listing_id"] for r in results] == [listing.id]


# Fait rougir `observed_at >= windowed.c.observed_at` (et non `>`) : la
# baisse vue par le robot lui-même n'attend pas un second passage.
def test_a_drop_the_robot_itself_saw_needs_no_confirmation(session, monkeypatch):
    monkeypatch.setenv("ADSCOPE_ALERTS_CONFIRMED_ONLY", "1")
    account, key = account_and_license(session)
    s = saved(session, account.id, created_at=CREATED)
    robot_key = licensed(session, automated=True)
    listing = car(session, "1", published=NOW - timedelta(days=200))
    session.add(PricePoint(listing_id=listing.id, observed_at=NOW - timedelta(days=5),
                           price=12000, source="crawler", confirmation=False))
    session.add(PricePoint(listing_id=listing.id, observed_at=NOW - timedelta(days=1),
                           price=11000, source="crawler", confirmation=False,
                           license_key_hash=robot_key))
    session.commit()
    results = drops_for(session, s, resolve(session, key), NOW)
    assert [r["listing_id"] for r in results] == [listing.id]


# Fait rougir `if alerts_confirmed_only(): ...` (la condition n'est ajoutée
# que si le drapeau est vrai) : par défaut, il est faux.
def test_the_flag_is_off_by_default(session):
    account, key = account_and_license(session)
    s = saved(session, account.id, created_at=CREATED)
    merchant_key = licensed(session)
    listing = car(session, "1", published=NOW - timedelta(days=200))
    session.add(PricePoint(listing_id=listing.id, observed_at=NOW - timedelta(days=5),
                           price=12000, source="user", confirmation=False))
    session.add(PricePoint(listing_id=listing.id, observed_at=NOW - timedelta(days=1),
                           price=11000, source="user", confirmation=False,
                           license_key_hash=merchant_key))
    session.commit()
    results = drops_for(session, s, resolve(session, key), NOW)
    assert [r["listing_id"] for r in results] == [listing.id]
