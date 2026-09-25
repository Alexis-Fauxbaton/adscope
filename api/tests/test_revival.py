"""La levée d'une disparition (`revival.py`,
`.superpowers/disparition-plan.md` §1 et §5.5). Voisin de
`test_absence_accounts.py`, qui éprouve la constatation ; ici, la
contradiction.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from adscope_api.auth import hash_key, new_key
from adscope_api.auth_models import Account
from adscope_api.corpus_models import Divergence, Recheck
from adscope_api.intake import ObservationIn
from adscope_api.models import License, Listing
from adscope_api.observations import record
from adscope_api import absence_scope, revival

NOW = datetime(2026, 9, 25, 12, 0, tzinfo=timezone.utc)


def a_license(session, automated=False, account_id=None):
    raw = new_key()
    key_hash = hash_key(raw)
    session.add(License(key_hash=key_hash, label="crawler" if automated else "marchand",
                        automated=automated, account_id=account_id))
    session.commit()
    return session.get(License, key_hash)


def robot(session):
    return a_license(session, automated=True)


def merchant(session, account_id=None):
    return a_license(session, automated=False, account_id=account_id)


def listed(session, **kw):
    listing = Listing(site="lbc", site_id="3263259495", first_seen=NOW, last_seen=NOW,
                      observations=1, **kw)
    session.add(listing)
    session.commit()
    return listing


def declare(session, listing, license_, at=NOW):
    """Une constatation directe, sans passer par `disappearance.observe` —
    ce module n'éprouve que la levée."""
    absence_scope.report(session, listing, license_, "absent", at)
    session.commit()


def lines(session, listing_id):
    return session.query(Divergence).filter_by(listing_id=listing_id).all()


def reports(session, listing_id):
    return session.scalars(select(Recheck).where(Recheck.listing_id == listing_id)).all()


# Fait rougir `revival.apply`, la branche qui remet `probably_gone_at` à
# NULL : n'importe quelle voix lève un doute.
def test_any_key_lifts_a_probable(session):
    listing = listed(session, absent_since=NOW, probably_gone_at=NOW)
    declare(session, listing, merchant(session))
    revival.apply(session, listing, merchant(session), NOW + timedelta(hours=1))
    assert (listing.absent_since, listing.probably_gone_at) == (None, None)


# Fait rougir le test d'appartenance `actor_of(license_) in declarants` :
# le déclarant d'une ferme ne la lève pas lui-même, sa constatation reste.
def test_a_declarant_never_lifts_its_own_firm_disappearance(session):
    listing = listed(session, absent_since=NOW, disappeared_at=NOW)
    lic = merchant(session)
    declare(session, listing, lic)
    revival.apply(session, listing, lic, NOW + timedelta(hours=1))
    assert listing.disappeared_at == NOW


# Fait rougir la remise à NULL des trois colonnes : une voix distincte des
# déclarantes lève bien une ferme.
def test_a_distinct_account_lifts_a_firm_disappearance(session):
    listing = listed(session, absent_since=NOW, disappeared_at=NOW)
    declare(session, listing, merchant(session))
    revival.apply(session, listing, merchant(session), NOW + timedelta(hours=1))
    assert (listing.absent_since, listing.disappeared_at, listing.probably_gone_at) == (
        None, None, None,
    )


# Fait rougir `if listing.disappeared_at is not None and declarants:` : sans
# déclarant (les fermes écrites avant ce lot), n'importe quelle voix lève —
# exactement le comportement d'aujourd'hui.
def test_a_firm_disappearance_written_before_this_lot_is_lifted_by_anyone(session):
    listing = listed(session, absent_since=NOW, disappeared_at=NOW)
    revival.apply(session, listing, merchant(session), NOW + timedelta(hours=1))
    assert listing.disappeared_at is None
    assert lines(session, listing.id) == []  # aucun déclarant à journaliser


# Fait rougir l'ajout de `Divergence(field="absence", ...)` : chaque acteur
# déclarant (non automated) gagne sa ligne.
def test_the_lift_journals_one_divergence_per_declaring_actor(session):
    listing = listed(session, absent_since=NOW, disappeared_at=NOW)
    declare(session, listing, merchant(session))
    declare(session, listing, merchant(session))
    revival.apply(session, listing, merchant(session), NOW + timedelta(hours=1))
    rows = lines(session, listing.id)
    assert len(rows) == 2
    assert {row.field for row in rows} == {"absence"}


# Fait rougir `observed_at=report.first_at` : le délai part de la première
# constatation, pas de l'instant de la levée.
def test_the_delay_counts_from_the_first_sighting(session):
    listing = listed(session, absent_since=NOW, disappeared_at=NOW)
    lic = merchant(session)
    declare(session, listing, lic, at=NOW)
    revival.apply(session, listing, merchant(session), NOW + timedelta(hours=5))
    row = lines(session, listing.id)[0]
    assert row.observed_at == NOW
    assert row.delay_seconds == 5 * 3600


# Fait rougir `if report.automated: continue` : le robot n'est jamais jugé.
def test_the_robot_is_never_journalled(session):
    listing = listed(session, absent_since=NOW, disappeared_at=NOW)
    declare(session, listing, robot(session))
    revival.apply(session, listing, merchant(session), NOW + timedelta(hours=1))
    assert lines(session, listing.id) == []


# Fait rougir `robot_value = "présente" if ... else "revue en ligne"` : la
# levée d'un humain se distingue de celle du robot, pour que la page
# opérateur ne les confonde pas.
def test_a_human_lift_says_so_in_the_journal(session):
    listing = listed(session, absent_since=NOW, disappeared_at=NOW)
    declare(session, listing, merchant(session))
    revival.apply(session, listing, merchant(session), NOW + timedelta(hours=1))
    assert lines(session, listing.id)[0].robot_value == "revue en ligne"


def test_a_robot_lift_says_so_in_the_journal(session):
    listing = listed(session, absent_since=NOW, disappeared_at=NOW)
    declare(session, listing, merchant(session))
    revival.apply(session, listing, robot(session), NOW + timedelta(hours=1))
    assert lines(session, listing.id)[0].robot_value == "présente"


# Fait rougir toute écriture de `price_points`/`first_seen` ajoutée par erreur
# dans `revival.apply` : l'historique d'une annonce revenue est le même
# historique.
def test_the_history_survives_a_revival(session):
    listing = listed(session, absent_since=NOW, disappeared_at=NOW)
    first_seen = listing.first_seen
    declare(session, listing, merchant(session))
    revival.apply(session, listing, merchant(session), NOW + timedelta(hours=1))
    assert listing.first_seen == first_seen
    assert listing.prices == []


# Fait rougir la sortie immédiate en tête d'`apply` : une annonce jamais
# absente ne coûte aucune requête.
def test_a_listing_never_absent_costs_no_query(session):
    listing = listed(session)

    def boom(*_a, **_kw):
        raise AssertionError("revival.apply a interrogé la base pour rien")

    original = absence_scope.reports_of
    absence_scope.reports_of = boom
    try:
        revival.apply(session, listing, merchant(session), NOW)
    finally:
        absence_scope.reports_of = original


# Fait rougir `recheck.mark_revival` : un marchand qui ressuscite une ferme
# est marqué, pour que le robot juge au prochain passage plutôt que de
# refuser la levée (ce qui rendrait `disappeared_at` de nouveau irréversible).
def test_a_merchant_reviving_a_firm_disappearance_is_marked(session):
    listing = listed(session, absent_since=NOW, disappeared_at=NOW)
    declare(session, listing, merchant(session))
    revival.apply(session, listing, merchant(session), NOW + timedelta(hours=1))
    assert {r.field for r in reports(session, listing.id)} == {"revived"}


def test_a_robot_revival_marks_nothing(session):
    listing = listed(session, absent_since=NOW, disappeared_at=NOW)
    declare(session, listing, merchant(session))
    revival.apply(session, listing, robot(session), NOW + timedelta(hours=1))
    assert reports(session, listing.id) == []


# Bout en bout, via `observations.record` : la ligne 141 appelle bien
# `revival.apply` plutôt que de remettre les colonnes à NULL sans journaliser.
def test_recording_a_live_observation_lifts_and_journals(session):
    listing = listed(session, absent_since=NOW, disappeared_at=NOW)
    declarant = merchant(session)
    declare(session, listing, declarant)
    record(session, ObservationIn(site="lbc", site_id="3263259495", price=9900),
          source="user", license_=merchant(session), now=NOW + timedelta(hours=1))
    assert listing.disappeared_at is None
    assert len(lines(session, listing.id)) == 1
