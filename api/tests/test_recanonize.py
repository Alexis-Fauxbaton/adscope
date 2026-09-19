"""Le rattrapage de la couche canonique sur l'existant.

La migration 010 ouvre trois colonnes vides sur 52 925 annonces ; c'est ce
script qui les remplit, et qui les refait à chaque évolution de
`shared/vehicle-aliases.json`. Il doit se rejouer sans rien casser et sans
sauter de ligne.

Pas d'horloge réelle : les annonces sont posées à `NOW`, injecté.
"""

import importlib.util
import pathlib

from sqlalchemy import select

from adscope_api.models import Listing

from conftest import NOW


# Le script n'est pas un module importable du paquet : il se charge par chemin.
def _load():
    path = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "recanonize.py"
    spec = importlib.util.spec_from_file_location("recanonize", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


script = _load()


def bare(session, count, brand="RENAULT", model="CLIO"):
    """Des annonces comme la migration 010 les laisse : couche canonique vide."""
    session.add_all([
        Listing(site="lbc", site_id=str(n), first_seen=NOW, last_seen=NOW,
                observations=1, brand=brand, model=model, version="Clio IV 1.5 dCi")
        for n in range(count)
    ])
    session.commit()


def rows(session):
    return session.scalars(select(Listing).order_by(Listing.id)).all()


# Fait rougir `changed += derive(listing)` : sans lui le script tournerait à
# vide sur les 52 925 annonces ouvertes par la migration.
def test_it_fills_what_the_migration_left_empty(session):
    bare(session, 3)
    assert script.recanonize(session, batch=2) == 3
    for listing in rows(session):
        assert (listing.canon_brand, listing.canon_model) == ("renault", "clio")
        assert listing.search_text == "renault clio iv 1.5 dci"


# Fait rougir la boucle `while True` et `Listing.id > last_id` : le curseur
# avance, donc le dernier lot est servi — un `break` après le premier lot
# laisserait 50 925 annonces sur les 52 925.
def test_every_batch_is_served_not_only_the_first(session):
    bare(session, 7)
    assert script.recanonize(session, batch=2) == 7
    assert all(r.search_text for r in rows(session))


def stale(session):
    """Deux annonces remplies avant que l'alias « Corvette » n'existe."""
    bare(session, 2, brand="Corvette", model="Autres")
    for listing in rows(session):
        listing.canon_brand, listing.canon_model = "Corvette", "Autres"
        listing.search_text = "corvette autres"
    session.commit()


# Fait rougir `if only_missing: query.where(search_text.is_(None))` : le
# rattrapage ordinaire ne relit pas les 52 925 lignes déjà faites — une ligne
# remplie reste où elle est, fût-elle devenue fausse.
def test_by_default_it_leaves_alone_what_is_already_filled(session):
    stale(session)
    assert script.recanonize(session) == 0
    assert {r.canon_brand for r in rows(session)} == {"Corvette"}


# Fait rougir `only_missing=False` : après une évolution de la table d'alias,
# des lignes déjà remplies changent de résultat et doivent être reprises.
def test_all_takes_the_lines_an_alias_change_would_move(session):
    stale(session)
    assert script.recanonize(session, only_missing=False) == 2
    assert {r.canon_brand for r in rows(session)} == {"chevrolet"}


# Fait rougir `return before != (brand, model, text)` dans `taxonomy.derive` :
# rejoué sur une base déjà à jour, `--all` ne compte rien.
def test_replaying_all_on_an_up_to_date_base_changes_nothing(session):
    bare(session, 3)
    script.recanonize(session, only_missing=False)
    assert script.recanonize(session, only_missing=False) == 0


# Fait rougir `session.commit()` en fin de lot : une interruption au troisième
# lot laisse les deux premiers écrits, et la reprise part de là.
def test_an_interrupted_run_leaves_the_batches_already_done(session):
    bare(session, 6)
    script.recanonize(session, batch=4)
    session.rollback()
    assert sum(1 for r in rows(session) if r.search_text) == 6
