from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from adscope_api.alert_models import AccountSettings, AlertSent, Digest, SavedSearch
from adscope_api.auth import hash_key, new_key
from adscope_api.auth_models import Account
from adscope_api.digest_send import send_for_account
from adscope_api.models import License, Listing, PricePoint
from adscope_api.taxonomy import derive
from scripts.send_digests import run

NOW = datetime(2026, 9, 18, 7, 0, tzinfo=timezone.utc)
CREATED = NOW - timedelta(days=10)


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
        created_at=kw.pop("created_at", CREATED), min_age_days=kw.pop("min_age_days", 0),
        min_drop_pct=kw.pop("min_drop_pct", 3), notify_new=kw.pop("notify_new", False),
        notify_drops=kw.pop("notify_drops", True), paused=kw.pop("paused", False),
    )
    session.add(row)
    session.commit()
    return row


def dropping_car(session, site_id, base=12000, department="75"):
    row = Listing(site="lbc", site_id=site_id, first_seen=NOW - timedelta(days=200),
                  last_seen=NOW, observations=1, brand="Renault", model="Clio",
                  department=department, published_at=NOW - timedelta(days=200))
    row.prices = [
        PricePoint(observed_at=NOW - timedelta(days=5), price=base, source="user",
                  confirmation=False),
        PricePoint(observed_at=NOW - timedelta(days=1), price=base - 1000, source="user",
                  confirmation=False),
    ]
    derive(row)
    session.add(row)
    session.commit()
    return row


# Fait rougir `if not lines: return None` dans `digest_build.build` (via
# `digest_send.send_for_account`) : rien à dire, pas d'email.
def test_nothing_to_say_means_no_digest(session):
    account, _ = account_and_license(session)
    assert send_for_account(session, account.id, NOW) is None
    assert session.scalar(select(Digest)) is None


# Fait rougir `ON CONFLICT (account_id, day) DO NOTHING` : relancé le même
# jour, aucune deuxième ligne.
def test_running_twice_the_same_day_posts_only_one_digest(session):
    account, key = account_and_license(session)
    saved(session, account.id)
    dropping_car(session, "1")
    assert send_for_account(session, account.id, NOW) is not None
    assert send_for_account(session, account.id, NOW) is None
    assert session.scalar(select(func.count()).select_from(Digest)) == 1


# Fait rougir le `session.rollback()` de l'étape « déjà servi » : le journal
# n'a pas bougé au second passage (pas de double marquage, mais surtout pas
# de perte de la première alerte).
def test_the_journal_does_not_move_on_the_second_run_of_the_day(session):
    account, key = account_and_license(session)
    saved(session, account.id)
    dropping_car(session, "1")
    send_for_account(session, account.id, NOW)
    count_after_first = session.scalar(
        select(func.count()).select_from(AlertSent)
    )
    send_for_account(session, account.id, NOW)
    count_after_second = session.scalar(
        select(func.count()).select_from(AlertSent)
    )
    assert count_after_first == count_after_second == 1


# Fait rougir `lines = candidates_for(...)[:MAX_LINES]`.
def test_at_most_fifteen_lines(session):
    account, key = account_and_license(session)
    saved(session, account.id)
    for i in range(20):
        dropping_car(session, str(i))
    result = send_for_account(session, account.id, NOW)
    assert result["lines"] == 15


# Fait rougir la clé de tri des baisses : la plus forte baisse cumulée
# d'abord.
def test_drops_are_sorted_by_the_biggest_cumulative_drop_first(session):
    account, key = account_and_license(session)
    saved(session, account.id, query="")
    small = dropping_car(session, "1")  # -1000
    small.brand, small.model = "Peugeot", "208"
    big = dropping_car(session, "2")
    big.brand, big.model = "Renault", "Clio"
    big.prices = [
        PricePoint(observed_at=NOW - timedelta(days=5), price=20000, source="user",
                  confirmation=False),
        PricePoint(observed_at=NOW - timedelta(days=1), price=15000, source="user",
                  confirmation=False),  # -5000
    ]
    derive(small)
    derive(big)
    session.commit()
    send_for_account(session, account.id, NOW)
    digest = session.scalar(select(Digest).where(Digest.account_id == account.id))
    assert digest.text.index("Renault Clio") < digest.text.index("Peugeot 208")


# Fait rougir `escape(...)` dans `digest_html._card` : un libellé forgé avec
# `<` n'ouvre pas de balise.
def test_a_label_with_a_lt_sign_is_escaped_in_html(session, monkeypatch):
    account, key = account_and_license(session)
    saved(session, account.id)
    listing = dropping_car(session, "1")
    listing.model = "<script>x</script>"
    listing.canon_model = "<script>x</script>"
    derive(listing)
    session.commit()
    send_for_account(session, account.id, NOW)
    digest = session.scalar(select(Digest).where(Digest.account_id == account.id))
    assert "<script>" not in digest.html
    assert "&lt;script&gt;" in digest.html


# Aucun des deux corps ne porte de nom de vendeur, le mot « vendue », ni
# `<img` — la liste des champs d'une ligne ne les porte simplement pas.
def test_the_email_never_carries_a_seller_name_sold_or_an_image(session):
    account, key = account_and_license(session)
    saved(session, account.id)
    listing = dropping_car(session, "1")
    listing.seller_type = "pro"
    listing.seller_name = "Garage Dupont Occasion"
    session.commit()
    send_for_account(session, account.id, NOW)
    digest = session.scalar(select(Digest).where(Digest.account_id == account.id))
    for body in (digest.text, digest.html):
        assert "Dupont" not in body
        assert "vendue" not in body.lower()
        assert "<img" not in body.lower()


# Fait rougir `f"{base}/app/?d={token}#/..."` : `?d=` est dans la requête,
# `#/route` dans le fragment.
def test_links_carry_d_before_the_hash(session):
    account, key = account_and_license(session)
    saved(session, account.id)
    dropping_car(session, "1")
    send_for_account(session, account.id, NOW)
    digest = session.scalar(select(Digest).where(Digest.account_id == account.id))
    assert f"?d={digest.token}#" in digest.text


# Le pied porte le jeton de désabonnement, présent dans `account_settings`.
def test_the_footer_carries_the_unsubscribe_token(session):
    account, key = account_and_license(session)
    saved(session, account.id)
    dropping_car(session, "1")
    send_for_account(session, account.id, NOW)
    settings = session.get(AccountSettings, account.id)
    digest = session.scalar(select(Digest).where(Digest.account_id == account.id))
    assert f"desabonnement.html?t={settings.unsubscribe_token_hash}" in digest.text


# `--dry-run` (`run(..., dry_run=True)`) ne commite rien : aucune ligne en
# base après coup.
def test_dry_run_writes_nothing(sessions):
    with sessions() as session:
        account, key = account_and_license(session)
        saved(session, account.id)
        dropping_car(session, "1")
    result = run(sessions, NOW, dry_run=True)
    assert len(result) == 1
    with sessions() as session:
        assert session.scalar(select(Digest)) is None


# `--now` rejoue une date donnée : la ligne posée porte le jour de `now`,
# jamais celui de l'horloge réelle.
def test_now_controls_which_day_is_posted(sessions):
    tomorrow = NOW + timedelta(days=1)
    with sessions() as session:
        account, key = account_and_license(session)
        saved(session, account.id)
        dropping_car(session, "1")
    run(sessions, tomorrow, dry_run=False)
    with sessions() as session:
        digest = session.scalar(select(Digest))
    assert digest.day == tomorrow.date()


# Fait rougir `where(SavedSearch.paused.is_(False))` dans
# `digest_build._searches_of` : une recherche en pause ne rend rien.
def test_a_paused_search_contributes_nothing(session):
    account, key = account_and_license(session)
    saved(session, account.id, paused=True)
    dropping_car(session, "1")
    assert send_for_account(session, account.id, NOW) is None
