from datetime import date, datetime, timedelta, timezone

from sqlalchemy import update

from adscope_api import usage
from adscope_api.models import License, UsageDay, UsageSummary
from adscope_api.usage import (
    RETENTION_DAYS, by_day, by_license, compact, compact_daily,
)
from conftest import auth
from adscope_api.observations import record
from adscope_api.intake import ObservationIn

NOW = datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)

def license_(session, label, key_hash, automated=False):
    lic = License(key_hash=key_hash, label=label, automated=automated)
    session.add(lic)
    session.flush()
    return lic


def obs(site_id, price):
    return ObservationIn(site="lc", site_id=site_id, price=price)


def test_a_price_point_carries_the_license_that_sent_it(session):
    lic = license_(session, "marchand", "a" * 64)
    listing = record(session, obs("1", 9900), source="user", license_=lic, now=NOW)
    session.commit()
    assert listing.prices[0].license_key_hash == "a" * 64


def test_a_crawler_observation_carries_no_license(session):
    listing = record(session, obs("1", 9900), source="crawler", now=NOW)
    session.commit()
    assert listing.prices[0].license_key_hash is None


def test_each_point_keeps_the_license_of_its_own_observation(session):
    first = license_(session, "premier", "a" * 64)
    second = license_(session, "second", "b" * 64)
    record(session, obs("1", 9900), source="user", license_=first, now=NOW)
    listing = record(session, obs("1", 9500), source="user", license_=second,
                     now=NOW + timedelta(days=1))
    session.commit()
    assert [p.license_key_hash for p in listing.prices] == ["a" * 64, "b" * 64]


# Le défaut que ce compteur corrige : un point de prix n'est écrit que si le
# prix a changé. Un marchand qui reparcourt chaque jour des annonces stables ne
# produisait aucune ligne et paraissait inactif.
def test_an_unchanged_price_still_counts_as_a_page_seen(session):
    lic = license_(session, "marchand", "a" * 64)
    for _ in range(3):
        record(session, obs("1", 9900), source="user", license_=lic, now=NOW)
    session.commit()
    assert [(r["listings"], r["observations"]) for r in by_day(session)] == [(1, 3)]


def test_distinct_listings_and_page_views_are_both_readable(session):
    lic = license_(session, "marchand", "a" * 64)
    for site_id in ("1", "2", "1"):
        record(session, obs(site_id, 9900), source="user", license_=lic, now=NOW)
    session.commit()
    row = by_day(session)[0]
    assert (row["listings"], row["observations"]) == (2, 3)


def test_each_day_is_counted_apart(session):
    lic = license_(session, "marchand", "a" * 64)
    record(session, obs("1", 9900), source="user", license_=lic, now=NOW)
    record(session, obs("1", 9900), source="user", license_=lic, now=NOW + timedelta(days=1))
    session.commit()
    assert [r["day"] for r in by_day(session)] == [NOW.date(), (NOW + timedelta(days=1)).date()]


def test_each_license_is_counted_apart(session):
    first = license_(session, "premier", "a" * 64)
    second = license_(session, "second", "b" * 64)
    record(session, obs("1", 9900), source="user", license_=first, now=NOW)
    record(session, obs("2", 8000), source="user", license_=second, now=NOW)
    record(session, obs("3", 7000), source="user", license_=second, now=NOW)
    session.commit()
    assert [(r["label"], r["listings"]) for r in by_day(session)] == [
        ("premier", 1), ("second", 2),
    ]


def test_an_observation_without_license_counts_for_nobody(session):
    record(session, obs("1", 9900), source="crawler", now=NOW)
    session.commit()
    assert by_day(session) == []


# Le crawler local poste avec une licence comme l'extension : 1 267 lignes
# attribuées à un humain qui n'a rien fait. La mesure d'usage ne peut pas
# compter un émetteur automatique.
def test_an_automated_license_is_left_out_of_the_usage(session):
    human = license_(session, "alexis", "a" * 64)
    robot = license_(session, "crawler", "b" * 64, automated=True)
    record(session, obs("1", 9900), source="user", license_=human, now=NOW)
    record(session, obs("2", 8000), source="user", license_=robot, now=NOW)
    session.commit()
    assert [r["label"] for r in by_day(session)] == ["alexis"]
    # La ligne existe pourtant : ce qui est écarté l'est à la lecture, et le
    # volume du robot reste consultable.
    assert session.query(UsageDay).count() == 2


def test_a_license_is_human_unless_it_says_otherwise(session):
    assert license_(session, "alexis", "a" * 64).automated is False


# La mesure n'avait aucun lecteur : ni route, ni script, ni commande. Ce
# regroupement est ce qu'une commande a besoin de dire — qui a utilisé le
# produit, quels jours, et s'il a décroché.
def test_the_usage_is_readable_license_by_license(session):
    lic = license_(session, "alexis", "a" * 64)
    record(session, obs("1", 9900), source="user", license_=lic, now=NOW)
    record(session, obs("2", 8000), source="user", license_=lic, now=NOW)
    record(session, obs("1", 9900), source="user", license_=lic, now=NOW + timedelta(days=3))
    session.commit()
    one = by_license(by_day(session))
    assert len(one) == 1
    assert one[0]["label"] == "alexis"
    assert [(r["day"], r["listings"]) for r in one[0]["days"]] == [
        (NOW.date(), 2), ((NOW + timedelta(days=3)).date(), 1),
    ]


# « A-t-il décroché au bout de trois jours » : deux jours actifs sur quatre
# écoulés se lit d'un coup d'œil, trois jours d'absence à la fin aussi.
def test_the_reading_says_whether_a_license_dropped_off(session):
    lic = license_(session, "alexis", "a" * 64)
    record(session, obs("1", 9900), source="user", license_=lic, now=NOW)
    record(session, obs("2", 8000), source="user", license_=lic, now=NOW + timedelta(days=3))
    session.commit()
    one = by_license(by_day(session))[0]
    assert (one["active_days"], one["span_days"]) == (2, 4)
    assert (one["first"], one["last"]) == (NOW.date(), (NOW + timedelta(days=3)).date())


def test_two_licenses_are_read_apart(session):
    first = license_(session, "premier", "a" * 64)
    second = license_(session, "second", "b" * 64)
    record(session, obs("1", 9900), source="user", license_=first, now=NOW)
    record(session, obs("2", 8000), source="user", license_=second, now=NOW)
    session.commit()
    assert [lic["label"] for lic in by_license(by_day(session))] == ["premier", "second"]


# Deux licences peuvent porter le même libellé — la base en a deux. Elles ne
# doivent pas fondre en une seule ligne de lecture.
def test_two_licenses_sharing_a_label_stay_apart(session):
    first = license_(session, "alexis", "a" * 64)
    second = license_(session, "alexis", "b" * 64)
    record(session, obs("1", 9900), source="user", license_=first, now=NOW)
    record(session, obs("2", 8000), source="user", license_=second, now=NOW)
    session.commit()
    assert len(by_license(by_day(session))) == 2


# Mesuré sur la base de développement : 5 615 lignes et 3,2 Mo pour une seule
# journée, contre 3,7 Mo pour `price_points` qui porte tout l'historique de
# prix. Le grain (licence, jour, annonce) ne sert qu'à dédoublonner les annonces
# pendant la journée ; une fois close, son compte suffit et se garde.
def rows(session, model):
    return session.query(model).count()


def test_a_closed_day_is_rolled_up_and_its_fine_rows_are_dropped(session):
    lic = license_(session, "alexis", "a" * 64)
    for site_id in ("1", "2", "1"):
        record(session, obs(site_id, 9900), source="user", license_=lic, now=NOW)
    session.commit()
    compact(session, now=NOW + timedelta(days=RETENTION_DAYS))
    session.commit()
    assert rows(session, UsageDay) == 0
    summary = session.query(UsageSummary).one()
    assert (summary.listings, summary.observations) == (2, 3)


def test_a_rolled_up_day_still_answers_both_questions(session):
    lic = license_(session, "alexis", "a" * 64)
    for site_id in ("1", "2"):
        record(session, obs(site_id, 9900), source="user", license_=lic, now=NOW)
    session.commit()
    compact(session, now=NOW + timedelta(days=RETENTION_DAYS))
    session.commit()
    assert [(r["label"], r["day"], r["listings"], r["observations"]) for r in by_day(session)] == [
        ("alexis", NOW.date(), 2, 2),
    ]


# La fenêtre récente garde son grain : c'est elle qui dédoublonne les annonces
# du jour, et elle absorbe un décalage d'horloge ou une observation en retard.
def test_the_days_within_the_window_keep_their_fine_grain(session):
    lic = license_(session, "alexis", "a" * 64)
    record(session, obs("1", 9900), source="user", license_=lic, now=NOW)
    session.commit()
    compact(session, now=NOW + timedelta(days=RETENTION_DAYS - 1))
    session.commit()
    assert (rows(session, UsageDay), rows(session, UsageSummary)) == (1, 0)


def test_compacting_twice_changes_nothing(session):
    lic = license_(session, "alexis", "a" * 64)
    record(session, obs("1", 9900), source="user", license_=lic, now=NOW)
    session.commit()
    for _ in range(2):
        compact(session, now=NOW + timedelta(days=RETENTION_DAYS))
        session.commit()
    assert [(r["listings"], r["observations"]) for r in by_day(session)] == [(1, 1)]


# Une observation datée d'un jour déjà résumé : son compte s'ajoute au résumé,
# il ne le remplace pas et ne fait pas doubler la ligne à la lecture.
def test_a_late_observation_joins_the_summary_of_its_day(session):
    lic = license_(session, "alexis", "a" * 64)
    record(session, obs("1", 9900), source="user", license_=lic, now=NOW)
    session.commit()
    compact(session, now=NOW + timedelta(days=RETENTION_DAYS))
    session.commit()
    record(session, obs("2", 8000), source="user", license_=lic, now=NOW)
    session.commit()
    assert [(r["listings"], r["observations"]) for r in by_day(session)] == [(2, 2)]
    compact(session, now=NOW + timedelta(days=RETENTION_DAYS))
    session.commit()
    assert [(r["listings"], r["observations"]) for r in by_day(session)] == [(2, 2)]


# Rien à lancer à la main : le premier lot du jour ferme les journées passées,
# comme le cache de l'extension se purge au premier passage.
def test_the_first_batch_of_the_day_closes_the_days_that_passed(session):
    lic = license_(session, "alexis", "a" * 64)
    record(session, obs("1", 9900), source="user", license_=lic, now=NOW)
    session.commit()
    later = NOW + timedelta(days=RETENTION_DAYS)
    assert compact_daily(session, now=later) == 1
    # Les lots suivants du même jour ne rejouent pas la fermeture.
    assert compact_daily(session, now=later) == 0
    session.commit()
    assert rows(session, UsageSummary) == 1


# Le câblage : c'est la route qui ferme, personne n'a de commande à lancer.
def test_the_observations_route_closes_the_days_that_passed(client, key, session):
    item = {"site": "lc", "site_id": "1", "price": 9900}
    client.post("/v1/observations", json={"items": [item]}, headers=auth(key))
    session.execute(update(UsageDay).values(day=date.today() - timedelta(days=RETENTION_DAYS)))
    session.commit()
    usage._closed_on = None
    client.post("/v1/observations", json={"items": [item]}, headers=auth(key))
    assert (rows(session, UsageSummary), rows(session, UsageDay)) == (1, 1)
