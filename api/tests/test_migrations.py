from sqlalchemy import text

from adscope_api.migrations import MIGRATIONS, apply_migrations

# La base de développement porte des milliers d'annonces réelles et n'a jamais
# connu de migration : la seule manœuvre acceptable ajoute la colonne sans
# toucher aux lignes. Ces tests jouent cette base-là, ramenée à son ancienne
# forme.


def to_old_shape(session):
    session.execute(text("DROP INDEX IF EXISTS ix_listings_seller"))
    session.execute(text("ALTER TABLE listings DROP COLUMN IF EXISTS seller_id"))
    session.execute(text("ALTER TABLE listings DROP COLUMN IF EXISTS seller_name"))
    session.execute(text("DROP INDEX IF EXISTS ix_price_points_license"))
    session.execute(
        text("ALTER TABLE price_points DROP COLUMN IF EXISTS license_key_hash")
    )
    session.execute(text("DROP TABLE IF EXISTS schema_migrations"))


def with_history(session):
    session.execute(text(
        "INSERT INTO listings (site, site_id, first_seen, last_seen, observations)"
        " VALUES ('lc', '87103336930', now(), now(), 3)"
    ))
    session.execute(text(
        "INSERT INTO price_points (listing_id, observed_at, price, source)"
        " SELECT id, now(), 9900, 'crawler' FROM listings"
    ))


def columns(session, table):
    rows = session.execute(text(
        "SELECT column_name FROM information_schema.columns WHERE table_name = :t"
    ), {"t": table})
    return {row[0] for row in rows}


def test_migration_adds_the_column_to_an_existing_schema(session):
    to_old_shape(session)
    assert "license_key_hash" not in columns(session, "price_points")
    apply_migrations(session.connection())
    assert "license_key_hash" in columns(session, "price_points")


def test_existing_price_points_survive_and_carry_no_license(session):
    to_old_shape(session)
    with_history(session)
    apply_migrations(session.connection())
    rows = session.execute(
        text("SELECT price, source, license_key_hash FROM price_points")
    ).all()
    assert rows == [(9900, "crawler", None)]


def test_migration_is_replayable(session):
    to_old_shape(session)
    assert apply_migrations(session.connection()) == [name for name, _ in MIGRATIONS]
    assert apply_migrations(session.connection()) == []


def test_migration_on_a_fresh_schema_applies_nothing_it_would_break(session):
    session.execute(text("DROP TABLE IF EXISTS schema_migrations"))
    apply_migrations(session.connection())
    assert "license_key_hash" in columns(session, "price_points")


def test_the_index_serving_the_usage_query_exists(session):
    to_old_shape(session)
    apply_migrations(session.connection())
    indexes = session.execute(text(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'price_points'"
    ))
    assert "ix_price_points_license" in {row[0] for row in indexes}


# Les colonnes de vendeur arrivent sur une base qui porte déjà 9 662 annonces :
# elles s'ajoutent vides, et rien de ce qui est enregistré ne bouge.
def test_migration_adds_the_seller_columns(session):
    to_old_shape(session)
    apply_migrations(session.connection())
    assert {"seller_id", "seller_name"} <= columns(session, "listings")


def test_existing_listings_survive_with_an_empty_seller(session):
    to_old_shape(session)
    with_history(session)
    apply_migrations(session.connection())
    rows = session.execute(
        text("SELECT site_id, seller_id, seller_name FROM listings")
    ).all()
    assert rows == [("87103336930", None, None)]


def test_the_index_serving_the_seller_aggregate_exists(session):
    to_old_shape(session)
    apply_migrations(session.connection())
    indexes = session.execute(text(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'listings'"
    ))
    assert "ix_listings_seller" in {row[0] for row in indexes}
