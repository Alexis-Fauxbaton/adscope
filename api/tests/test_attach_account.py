"""Le rattachement à la main : une licence, un compte, et la fusion de l'autre.

La base réelle porte deux licences « alexis ». L'une a produit 50 611 points de
prix, l'autre huit : le compte doit tomber sur la bonne, et ce que la seconde
avait mis de côté ne doit pas se perdre.
"""

import importlib.util
import pathlib

import pytest
from sqlalchemy import select

from adscope_api.auth import hash_key, new_key
from adscope_api.auth_models import Account
from adscope_api.follow_models import Follow, TrackedFamily
from adscope_api.models import License, Listing

from conftest import NOW

EMAIL = "marchand@garage.fr"


# Le script n'est pas un module importable du paquet : il se charge par chemin.
def _load():
    path = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "attach_account.py"
    spec = importlib.util.spec_from_file_location("attach_account", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


attach = _load()


@pytest.fixture
def two_licenses(session):
    kept, other = License(key_hash=hash_key(new_key()), label="alexis"), \
        License(key_hash=hash_key(new_key()), label="alexis")
    session.add_all([kept, other])
    listing = Listing(site="lbc", site_id="3263259495", first_seen=NOW,
                      last_seen=NOW, observations=1)
    session.add(listing)
    session.commit()
    session.add_all([
        Follow(license_key_hash=other.key_hash, listing_id=listing.id, followed_at=NOW),
        TrackedFamily(license_key_hash=other.key_hash, brand="RENAULT", model="CLIO"),
        TrackedFamily(license_key_hash=kept.key_hash, brand="RENAULT", model="CLIO"),
    ])
    session.commit()
    return kept, other


# Fait rougir `if len(found) != 1` dans `by_prefix` : deux licences portent le
# libellé « alexis », et un préfixe trop court en désignerait deux aussi. Se
# tromper de licence, c'est rattacher le compte à celle qui n'a rien vu.
def test_an_ambiguous_prefix_stops_the_command(session, two_licenses):
    with pytest.raises(SystemExit):
        attach.by_prefix(session, "")


def test_a_prefix_designates_its_license(session, two_licenses):
    kept, _ = two_licenses
    assert attach.by_prefix(session, kept.key_hash[:8]) is kept


# Fait rougir `if account is None:` dans `account_for` : rejouée, la commande
# ne doit pas buter sur l'unicité de l'adresse.
def test_the_account_is_created_once(session, two_licenses):
    first = attach.account_for(session, EMAIL)
    session.commit()
    assert attach.account_for(session, EMAIL).id == first.id
    assert len(session.scalars(select(Account)).all()) == 1


# Fait rougir `email = email.strip().lower()` dans `account_for` : le lien
# magique ne connaît le marchand que par sa forme abaissée
# (`auth_email.post_login`), une majuscule collée à la main ne doit pas poser
# un second compte pour la même adresse.
def test_an_uppercase_address_is_the_same_account(session, two_licenses):
    first = attach.account_for(session, "Alexis@Garage.fr")
    session.commit()
    assert attach.account_for(session, "alexis@garage.fr").id == first.id
    assert len(session.scalars(select(Account)).all()) == 1


# Fait rougir l'insertion de `merge` : les suivis de la licence fusionnée sont
# ce que le marchand a mis de côté, ils ne se perdent pas en route.
def test_the_merge_carries_the_follows_over(session, two_licenses):
    kept, other = two_licenses
    assert attach.merge(session, other, kept) == (1, 1)
    session.commit()
    carried = session.scalars(
        select(Follow.listing_id).where(Follow.license_key_hash == kept.key_hash)
    ).all()
    assert len(carried) == 1


# Fait rougir `.on_conflict_do_nothing()` : les deux licences suivent la même
# famille, et sans lui la fusion violerait la clé primaire.
def test_a_family_held_by_both_does_not_break_the_merge(session, two_licenses):
    kept, other = two_licenses
    attach.merge(session, other, kept)
    session.commit()
    held = session.scalars(
        select(TrackedFamily.model).where(TrackedFamily.license_key_hash == kept.key_hash)
    ).all()
    assert held == ["CLIO"]


# Fait rougir `source.account_id = None` : la licence fusionnée ne doit plus
# être une porte d'entrée pour le compte, sinon `of_account` peut la rendre à
# la place de celle qui porte l'usage.
def test_the_merged_license_is_detached(session, two_licenses):
    kept, other = two_licenses
    other.account_id = attach.account_for(session, EMAIL).id
    attach.merge(session, other, kept)
    session.commit()
    assert other.account_id is None


# Fait rougir la commande entière : rejouée, elle ne pose rien de neuf.
def test_the_command_is_idempotent(session, two_licenses, monkeypatch):
    kept, other = two_licenses
    monkeypatch.setattr(attach, "session_scope", _scope_over(session))
    argv = ["--email", EMAIL, "--license", kept.key_hash[:8],
            "--merge", other.key_hash[:8]]
    attach.main(argv)
    attach.main(argv)
    assert len(session.scalars(select(Account)).all()) == 1
    assert len(session.scalars(
        select(Follow).where(Follow.license_key_hash == kept.key_hash)
    ).all()) == 1
    assert kept.account_id is not None


def _scope_over(session):
    """`session_scope` du script, rendu sur la session de test."""
    from contextlib import contextmanager

    @contextmanager
    def scope():
        yield session
        session.commit()

    return scope
