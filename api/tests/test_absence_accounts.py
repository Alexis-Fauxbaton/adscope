"""Deux comptes distincts pour une disparition ferme, un seul pour un doute
(`.superpowers/disparition-plan.md` §1-§3). Voisin de `test_disappearance.py`
— les vingt tests de flotte y restent inchangés, ce fichier n'éprouve que la
règle des voix.
"""

from datetime import datetime, timedelta, timezone

from adscope_api.auth import hash_key, new_key
from adscope_api.auth_models import Account
from adscope_api.disappearance import AUTOMATED_CONFIRMS_ALONE, observe
from adscope_api.fleet_guard import GUARD_MIN
from adscope_api.models import License, Listing
from adscope_api.revisit import CONFIRM_DELAY, due

NOW = datetime(2026, 9, 25, 12, 0, tzinfo=timezone.utc)
LATER = NOW + CONFIRM_DELAY


def listed(session, site="lbc", site_id="3263259495", last_seen=NOW, **kw):
    listing = Listing(site=site, site_id=site_id, first_seen=NOW, last_seen=last_seen,
                      observations=1, seller_type="pro", **kw)
    session.add(listing)
    session.commit()
    return listing


def an_account(session):
    account = Account(email=f"{new_key()}@garage.fr")
    session.add(account)
    session.commit()
    return account.id


def licensed(session, *, automated=False, account_id=None):
    raw = new_key()
    session.add(License(key_hash=hash_key(raw), label="test",
                        automated=automated, account_id=account_id))
    session.commit()
    return session.get(License, hash_key(raw))


def merchant(session, account_id=None):
    return licensed(session, account_id=account_id)


def robot(session, account_id=None):
    return licensed(session, automated=True, account_id=account_id)


def gone(session, listing, at, license_=None):
    return observe(session, listing.site, listing.site_id, "absent", at, license_=license_)


def served(session, at, limit=500):
    return [item["site_id"] for item in due(session, "lbc", limit, at)]


# Fait rougir `disappearance`, la branche `probable` (`listing.probably_gone_at
# = listing.absent_since`) : deux constatations d'un même marchand ne font
# qu'un doute, jamais un fait.
def test_two_sightings_from_one_merchant_only_make_it_probable(session):
    listing = listed(session)
    lic = merchant(session)
    assert gone(session, listing, NOW, lic) == "first"
    assert gone(session, listing, LATER, lic) == "probable"
    assert listing.disappeared_at is None
    assert listing.probably_gone_at == NOW


# Fait rougir la condition `actors < 2` (deux voix suffisent) dans
# `disappearance.observe`.
def test_two_merchants_six_hours_apart_confirm_the_disappearance(session):
    listing = listed(session)
    assert gone(session, listing, NOW, merchant(session)) == "first"
    assert gone(session, listing, LATER, merchant(session)) == "recorded"
    assert listing.disappeared_at == NOW


# Fait rougir `absence_scope.actor_of`, `return f"acct:{license_.account_id}"` :
# deux clés d'un même compte s'écrasent, elles ne comptent qu'une fois.
def test_two_keys_of_one_account_never_confirm_alone(session):
    listing = listed(session)
    account_id = an_account(session)
    assert gone(session, listing, NOW, merchant(session, account_id=account_id)) == "first"
    assert gone(session, listing, LATER, merchant(session, account_id=account_id)) == "probable"
    assert listing.disappeared_at is None


# Fait rougir l'ordre du `if` dans `actor_of` : `automated` avant le compte.
# Si le crawler rattaché au compte d'Alexis fusionnait avec sa clé
# d'extension, ce test resterait vert par accident — c'est lui qui protège
# contre le piège coûteux du lot (§10.1 du plan).
def test_the_crawler_and_its_owners_extension_are_two_voices(session):
    listing = listed(session)
    account_id = an_account(session)
    assert gone(session, listing, NOW, robot(session, account_id=account_id)) == "first"
    verdict = gone(session, listing, LATER, merchant(session, account_id=account_id))
    assert verdict == "recorded"
    assert listing.disappeared_at == NOW


# Fait rougir `absence_scope.actor_of`, `return f"key:{...}"` : une clé sans
# compte compte pour elle-même — deux clés distinctes sans compte sont deux
# voix, pas une.
def test_a_key_without_account_counts_for_itself(session):
    listing = listed(session)
    assert gone(session, listing, NOW, merchant(session)) == "first"
    assert gone(session, listing, LATER, merchant(session)) == "recorded"
    assert listing.disappeared_at == NOW


# Fait rougir `disappearance.AUTOMATED_CONFIRMS_ALONE` : la constante est
# vraie, et la seconde constatation du robot suffit — comme avant ce lot.
def test_the_robot_confirms_alone(session):
    assert AUTOMATED_CONFIRMS_ALONE is True
    listing = listed(session)
    bot = robot(session)
    assert gone(session, listing, NOW, bot) == "first"
    assert gone(session, listing, LATER, bot) == "recorded"
    assert listing.disappeared_at == NOW


# Fait rougir `absence_scope.report`, le `on_conflict_do_update` qui ne
# touche pas `first_at` : la date écrite reste celle de la toute première
# constatation, pas de la dernière.
def test_the_second_sighting_keeps_the_first_instant(session):
    listing = listed(session)
    lic = merchant(session)
    gone(session, listing, NOW, lic)
    gone(session, listing, NOW + timedelta(hours=1), lic)  # trop tôt, rafraîchit `last_at`
    gone(session, listing, LATER, merchant(session))
    assert listing.disappeared_at == NOW


# Fait rougir `if now - listing.absent_since < CONFIRM_DELAY` : deux comptes
# complices qui se dépêchent ne suffisent pas avant le délai. Non-régression
# obligatoire — c'est la seule garde qui retient deux comptes concordants.
def test_a_second_voice_too_soon_writes_nothing(session):
    listing = listed(session)
    gone(session, listing, NOW, merchant(session))
    verdict = gone(session, listing, NOW + timedelta(minutes=20), merchant(session))
    assert verdict == "too_soon"
    assert listing.disappeared_at is None


# Fait rougir l'appel au garde-fou *avant* la branche `probable` : la porte se
# franchit avant toute écriture, quelle qu'elle soit — même quand une seule
# voix (un seul marchand, sur toute la flotte) n'aurait produit qu'un doute.
def test_the_fleet_guard_holds_a_probable_too(session):
    for index in range(GUARD_MIN):
        listed(session, site_id=f"99{index:04d}", last_seen=NOW - timedelta(days=10))
    lic = merchant(session)
    first = served(session, NOW)
    assert len(first) == GUARD_MIN
    for site_id in first:
        listing = session.query(Listing).filter_by(site_id=site_id).one()
        assert gone(session, listing, NOW, lic) == "first"
    session.commit()

    again = served(session, LATER)
    assert len(again) == GUARD_MIN
    for site_id in again:
        listing = session.query(Listing).filter_by(site_id=site_id).one()
        assert gone(session, listing, LATER, lic) == "held"
        assert listing.probably_gone_at is None


# Fait rougir `revisit.due`, `Listing.disappeared_at.is_(None)` : une probable
# n'a pas de `disappeared_at`, la file la garde donc — et `recheck.mark_absence`
# (appelé quel que soit le verdict) l'a déjà mise au rang 0, sans que
# `revisit.py` ait eu à changer.
def test_a_probable_stays_in_the_revisit_queue_at_rank_zero(session):
    listing = listed(session, last_seen=NOW - timedelta(days=10))
    lic = merchant(session)
    gone(session, listing, NOW, lic)
    gone(session, listing, LATER, lic)
    session.commit()
    assert listing.probably_gone_at is not None
    rows = due(session, "lbc", 10, LATER + timedelta(hours=1))
    assert [item["site_id"] for item in rows] == [listing.site_id]
