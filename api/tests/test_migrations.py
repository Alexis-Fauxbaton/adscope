from sqlalchemy import text

from adscope_api.migrations import MIGRATIONS, apply_migrations

# La base de développement porte des milliers d'annonces réelles et n'a jamais
# connu de migration : la seule manœuvre acceptable ajoute la colonne sans
# toucher aux lignes. Ces tests jouent cette base-là, ramenée à son ancienne
# forme.


def to_old_shape(session):
    session.execute(text("DROP TABLE IF EXISTS divergences"))
    session.execute(text("DROP TABLE IF EXISTS rechecks"))
    session.execute(text("DROP TABLE IF EXISTS mails"))
    session.execute(text("ALTER TABLE login_tokens DROP COLUMN IF EXISTS purpose"))
    session.execute(text("ALTER TABLE accounts DROP COLUMN IF EXISTS password_hash"))
    session.execute(
        text("ALTER TABLE accounts DROP COLUMN IF EXISTS pending_password_hash")
    )
    session.execute(
        text("ALTER TABLE accounts DROP COLUMN IF EXISTS email_verified_at")
    )
    session.execute(text("DROP TABLE IF EXISTS digests"))
    session.execute(text("DROP TABLE IF EXISTS alerts_sent"))
    session.execute(text("DROP TABLE IF EXISTS account_settings"))
    session.execute(text("DROP TABLE IF EXISTS saved_searches"))
    session.execute(text("DROP INDEX IF EXISTS ix_listings_canon"))
    session.execute(text("ALTER TABLE listings DROP COLUMN IF EXISTS canon_brand"))
    session.execute(text("ALTER TABLE listings DROP COLUMN IF EXISTS canon_model"))
    session.execute(text("ALTER TABLE listings DROP COLUMN IF EXISTS search_text"))
    session.execute(text("DROP TABLE IF EXISTS login_tokens"))
    session.execute(text("DROP TABLE IF EXISTS sessions"))
    session.execute(text("ALTER TABLE licenses DROP COLUMN IF EXISTS account_id"))
    session.execute(text("DROP TABLE IF EXISTS accounts"))
    session.execute(text("DROP TABLE IF EXISTS follows"))
    session.execute(text("DROP TABLE IF EXISTS tracked_families"))
    session.execute(text("DROP INDEX IF EXISTS ix_listings_brand_model_year"))
    session.execute(text("DROP INDEX IF EXISTS ix_listings_revisit"))
    session.execute(text("ALTER TABLE listings DROP COLUMN IF EXISTS absent_since"))
    session.execute(text("ALTER TABLE listings DROP COLUMN IF EXISTS last_revisit_at"))
    session.execute(text("ALTER TABLE price_points DROP COLUMN IF EXISTS confirmation"))
    session.execute(text("ALTER TABLE licenses DROP COLUMN IF EXISTS automated"))
    session.execute(text("DROP INDEX IF EXISTS ix_listings_seller"))
    session.execute(text("ALTER TABLE listings DROP COLUMN IF EXISTS seller_id"))
    session.execute(text("ALTER TABLE listings DROP COLUMN IF EXISTS seller_name"))
    session.execute(text("DROP INDEX IF EXISTS ix_price_points_license"))
    session.execute(
        text("ALTER TABLE price_points DROP COLUMN IF EXISTS license_key_hash")
    )
    session.execute(text("ALTER TABLE listings DROP COLUMN IF EXISTS fuel"))
    session.execute(text("ALTER TABLE listings DROP COLUMN IF EXISTS gearbox"))
    session.execute(text("ALTER TABLE listings DROP COLUMN IF EXISTS department"))
    session.execute(
        text("ALTER TABLE listings DROP COLUMN IF EXISTS canon_model_source")
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


def with_licenses(session):
    session.execute(text(
        "INSERT INTO licenses (key_hash, label, active) VALUES"
        " ('a', 'alexis', true), ('b', 'crawler', true)"
    ))


def test_migration_adds_the_automated_flag(session):
    to_old_shape(session)
    assert "automated" not in columns(session, "licenses")
    apply_migrations(session.connection())
    assert "automated" in columns(session, "licenses")


# Le libellé n'est pas une identité : la base porte deux licences homonymes, et
# l'émetteur qui produit 7 081 lignes par jour s'appelle « alexis ». Marquer sur
# `label = 'crawler'` marquait au hasard. La migration pose la colonne et ne
# devine rien ; `mark_automated` la met sur une licence désignée.
def test_the_migration_marks_no_license_on_a_guess(session):
    to_old_shape(session)
    with_licenses(session)
    apply_migrations(session.connection())
    rows = session.execute(
        text("SELECT label, automated FROM licenses ORDER BY label")
    ).all()
    assert rows == [("alexis", False), ("crawler", False)]


# L'échantillonnage arrive sur une base qui porte 12 918 points de prix, tous
# écrits sur un changement : ils sont des changements, la colonne les laisse
# tels quels.
def test_migration_adds_the_confirmation_flag(session):
    to_old_shape(session)
    assert "confirmation" not in columns(session, "price_points")
    apply_migrations(session.connection())
    assert "confirmation" in columns(session, "price_points")


def test_the_points_already_recorded_stay_changes(session):
    to_old_shape(session)
    with_history(session)
    apply_migrations(session.connection())
    rows = session.execute(text("SELECT price, confirmation FROM price_points")).all()
    assert rows == [(9900, False)]


# La revisite par fiche arrive sur une base qui porte 43 457 annonces, dont pas
# une ne connaît sa date de disparition : les colonnes s'ajoutent vides.
def test_migration_adds_the_revisit_columns(session):
    to_old_shape(session)
    assert not {"absent_since", "last_revisit_at"} & columns(session, "listings")
    apply_migrations(session.connection())
    assert {"absent_since", "last_revisit_at"} <= columns(session, "listings")


# Sans cet index, le garde-fou de flotte balaierait la table entière à chaque
# écriture de disparition.
def test_the_index_serving_the_fleet_guard_exists(session):
    to_old_shape(session)
    apply_migrations(session.connection())
    indexes = session.execute(text(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'listings'"
    ))
    assert "ix_listings_revisit" in {row[0] for row in indexes}


def test_the_listings_already_recorded_keep_an_empty_revisit(session):
    to_old_shape(session)
    with_history(session)
    apply_migrations(session.connection())
    rows = session.execute(text(
        "SELECT site_id, absent_since, last_revisit_at, disappeared_at FROM listings"
    )).all()
    assert rows == [("87103336930", None, None, None)]


# Sans cet index, la route des comparables balaie `listings` en entier à
# chaque fiche ouverte : 14,9 ms mesurés à 46 000 annonces, 0,8 ms avec lui.
def test_the_index_serving_the_comparables_query_exists(session):
    to_old_shape(session)
    apply_migrations(session.connection())
    indexes = session.execute(text(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'listings'"
    ))
    assert "ix_listings_brand_model_year" in {row[0] for row in indexes}


def tables(session):
    rows = session.execute(text(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    ))
    return {row[0] for row in rows}


# Les deux tables du marchand arrivent sur une base qui porte 46 857 annonces
# et quatre licences : elles sont neuves et vides, rien de ce qui est
# enregistré n'est touché.
def test_migration_adds_the_follow_tables(session):
    to_old_shape(session)
    assert not {"follows", "tracked_families"} & tables(session)
    apply_migrations(session.connection())
    assert {"follows", "tracked_families"} <= tables(session)


def test_the_listings_already_recorded_survive_the_new_tables(session):
    to_old_shape(session)
    with_history(session)
    apply_migrations(session.connection())
    rows = session.execute(text("SELECT site_id FROM listings")).all()
    assert rows == [("87103336930",)]
    assert session.execute(text("SELECT count(*) FROM follows")).scalar() == 0


# La clé primaire commence par la licence : la colonne qui référence l'annonce
# n'est indexée par personne, et sans cet index toute suppression d'annonce
# balaie `follows` en entier pour honorer la cascade.
def test_the_index_on_the_referencing_column_exists(session):
    to_old_shape(session)
    apply_migrations(session.connection())
    indexes = session.execute(text(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'follows'"
    ))
    assert "ix_follows_listing" in {row[0] for row in indexes}


# La migration et `create_all` doivent produire le même schéma : la base de
# développement passe par l'une, la base de test par l'autre, et un écart entre
# les deux ne se verrait qu'en production.
def test_the_migration_produces_the_columns_that_create_all_produces(session):
    from adscope_api.auth_models import Account, LoginToken, SessionToken
    from adscope_api.follow_models import Follow, TrackedFamily
    from adscope_api.models import License

    to_old_shape(session)
    apply_migrations(session.connection())
    for model in (Follow, TrackedFamily, Account, LoginToken, SessionToken, License):
        assert columns(session, model.__tablename__) == set(model.__table__.c.keys())


# Les trois tables du compte arrivent sur une base qui porte 51 712 annonces et
# quatre licences : elles sont neuves et vides, et les licences gardent leur
# colonne de compte vide — la migration ne rattache rien.
def test_migration_adds_the_account_tables(session):
    to_old_shape(session)
    assert not {"accounts", "login_tokens", "sessions"} & tables(session)
    apply_migrations(session.connection())
    assert {"accounts", "login_tokens", "sessions"} <= tables(session)


def test_the_licenses_already_recorded_carry_no_account(session):
    to_old_shape(session)
    with_licenses(session)
    apply_migrations(session.connection())
    rows = session.execute(
        text("SELECT label, account_id FROM licenses ORDER BY label")
    ).all()
    assert rows == [("alexis", None), ("crawler", None)]


# Sans cet index, le plafond des cinq liens par quart d'heure balaie tous les
# jetons frappés pour honorer le compte d'une seule adresse.
def test_the_index_serving_the_login_cap_exists(session):
    to_old_shape(session)
    apply_migrations(session.connection())
    indexes = session.execute(text(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'login_tokens'"
    ))
    assert "ix_login_tokens_account" in {row[0] for row in indexes}


def test_the_index_on_the_sessions_account_exists(session):
    to_old_shape(session)
    apply_migrations(session.connection())
    indexes = session.execute(text(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'sessions'"
    ))
    assert "ix_sessions_account" in {row[0] for row in indexes}


# La couche canonique arrive sur une base qui porte 52 925 annonces. Elle
# s'ajoute vide : la migration ne remplit rien, `scripts/recanonize.py` le fait.
def test_migration_adds_the_canonical_columns(session):
    to_old_shape(session)
    assert not {"canon_brand", "canon_model", "search_text"} & columns(session, "listings")
    apply_migrations(session.connection())
    assert {"canon_brand", "canon_model", "search_text"} <= columns(session, "listings")


def test_the_listings_already_recorded_keep_an_empty_canonical_layer(session):
    to_old_shape(session)
    with_history(session)
    apply_migrations(session.connection())
    rows = session.execute(text(
        "SELECT site_id, canon_brand, canon_model, search_text FROM listings"
    )).all()
    assert rows == [("87103336930", None, None, None)]


# Sans cet index, le découpage par famille du site balaie les 52 925 annonces.
def test_the_index_serving_the_canonical_family_filter_exists(session):
    to_old_shape(session)
    apply_migrations(session.connection())
    indexes = session.execute(text(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'listings'"
    ))
    assert "ix_listings_canon" in {row[0] for row in indexes}


# `create_all` et le registre doivent produire le même `listings` : la base de
# développement passe par l'un, celle de test par l'autre.
def test_the_migration_produces_the_listing_columns_that_create_all_produces(session):
    from adscope_api.models import Listing

    to_old_shape(session)
    apply_migrations(session.connection())
    assert columns(session, "listings") == set(Listing.__table__.c.keys())


# Carburant, boîte et département arrivent sur une base qui porte 52 965
# annonces : les colonnes s'ajoutent vides, `fuel`/`gearbox` ne se devinent
# pas après coup.
def test_migration_adds_the_fuel_gearbox_department_columns(session):
    to_old_shape(session)
    assert not {"fuel", "gearbox", "department"} & columns(session, "listings")
    apply_migrations(session.connection())
    assert {"fuel", "gearbox", "department"} <= columns(session, "listings")


def test_the_listings_already_recorded_keep_an_empty_fuel_gearbox_department(session):
    to_old_shape(session)
    with_history(session)
    apply_migrations(session.connection())
    rows = session.execute(text(
        "SELECT site_id, fuel, gearbox, department FROM listings"
    )).all()
    assert rows == [("87103336930", None, None, None)]


# La provenance du modèle canonique arrive sur une base qui porte 53 142
# annonces : la colonne s'ajoute vide. La migration ne déduit rien — c'est
# `scripts/recanonize.py --all` qui la remplit, par lots.
def test_migration_adds_the_canon_model_source_column(session):
    to_old_shape(session)
    assert "canon_model_source" not in columns(session, "listings")
    apply_migrations(session.connection())
    assert "canon_model_source" in columns(session, "listings")


def test_the_listings_already_recorded_keep_an_empty_canon_model_source(session):
    to_old_shape(session)
    with_history(session)
    apply_migrations(session.connection())
    rows = session.execute(
        text("SELECT site_id, canon_model_source FROM listings")
    ).all()
    assert rows == [("87103336930", None)]


# Les alertes (lot F1) arrivent sur une base vide : quatre tables neuves.
def test_the_013_migration_applies_on_an_empty_schema(session):
    to_old_shape(session)
    assert not {"saved_searches", "account_settings", "alerts_sent", "digests"} & tables(session)
    apply_migrations(session.connection())
    assert {"saved_searches", "account_settings", "alerts_sent", "digests"} <= tables(session)


# Rejouée, la 013 ne lève pas — même garantie que le reste du registre.
def test_the_013_migration_is_replayable(session):
    to_old_shape(session)
    apply_migrations(session.connection())
    assert apply_migrations(session.connection()) == []


# La migration et `create_all` doivent produire le même schéma pour les
# quatre tables des alertes aussi.
def test_the_013_migration_produces_the_columns_that_create_all_produces(session):
    from adscope_api.alert_models import AccountSettings, AlertSent, Digest, SavedSearch

    to_old_shape(session)
    apply_migrations(session.connection())
    for model in (SavedSearch, AccountSettings, AlertSent, Digest):
        assert columns(session, model.__tablename__) == set(model.__table__.c.keys())


# Sans cet index, supprimer une annonce balaierait `alerts_sent` en entier
# pour honorer la cascade — la colonne qui référence, que Postgres n'indexe
# pas seule.
def test_the_index_on_alerts_sent_listing_id_exists(session):
    to_old_shape(session)
    apply_migrations(session.connection())
    indexes = session.execute(text(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'alerts_sent'"
    ))
    assert "ix_alerts_sent_listing" in {row[0] for row in indexes}


# Le compte avec mot de passe (ce lot) arrive sur une base qui porte des
# comptes et des jetons existants : les trois colonnes s'ajoutent vides.
def test_migration_adds_the_password_columns(session):
    to_old_shape(session)
    assert not {"password_hash", "pending_password_hash", "email_verified_at"} & columns(
        session, "accounts"
    )
    apply_migrations(session.connection())
    assert {"password_hash", "pending_password_hash", "email_verified_at"} <= columns(
        session, "accounts"
    )


# `purpose` a un défaut : un jeton frappé avant la migration (encore en vol)
# reste valide, et se comporte comme un jeton de vérification.
def test_migration_adds_purpose_with_a_verify_default(session):
    to_old_shape(session)
    apply_migrations(session.connection())
    session.execute(text(
        "INSERT INTO accounts (email) VALUES ('avant@garage.fr')"
    ))
    session.execute(text(
        "INSERT INTO login_tokens (token_hash, account_id, expires_at)"
        " SELECT 'h', id, now() FROM accounts WHERE email = 'avant@garage.fr'"
    ))
    assert session.execute(
        text("SELECT purpose FROM login_tokens WHERE token_hash = 'h'")
    ).scalar() == "verify"


def test_migration_adds_the_mails_table_and_its_index(session):
    to_old_shape(session)
    assert "mails" not in tables(session)
    apply_migrations(session.connection())
    assert "mails" in tables(session)
    indexes = session.execute(text(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'mails'"
    ))
    assert "ix_mails_account" in {row[0] for row in indexes}


# Rien n'est rétro-marqué vérifié : la migration ne contient aucun UPDATE, un
# compte d'avant ce lot (dont celui d'Alexis) garde sa session et sa licence.
# Seules les additions de la 014 sont défaites ici — le compte, lui, existait
# déjà avant ce lot (migration 009), inutile de rejouer toute l'histoire.
def test_an_existing_account_keeps_its_session_and_license_untouched(session):
    session.execute(text("INSERT INTO accounts (email) VALUES ('alexis@garage.fr')"))
    session.execute(text("DROP TABLE IF EXISTS mails"))
    session.execute(text("ALTER TABLE login_tokens DROP COLUMN IF EXISTS purpose"))
    session.execute(text("ALTER TABLE accounts DROP COLUMN IF EXISTS password_hash"))
    session.execute(
        text("ALTER TABLE accounts DROP COLUMN IF EXISTS pending_password_hash")
    )
    session.execute(
        text("ALTER TABLE accounts DROP COLUMN IF EXISTS email_verified_at")
    )
    account_id = session.execute(
        text("SELECT id FROM accounts WHERE email = 'alexis@garage.fr'")
    ).scalar()
    session.execute(text(
        "INSERT INTO licenses (key_hash, label, account_id, active)"
        " VALUES ('lic', 'alexis', :account_id, true)"
    ), {"account_id": account_id})
    session.execute(text(
        "INSERT INTO sessions (token_hash, account_id, created_at, last_seen_at,"
        " expires_at) VALUES ('sess', :account_id, now(), now(), now() + interval '90 days')"
    ), {"account_id": account_id})
    apply_migrations(session.connection())
    assert session.execute(
        text("SELECT password_hash, email_verified_at FROM accounts WHERE id = :i"),
        {"i": account_id},
    ).one() == (None, None)
    assert session.execute(
        text("SELECT count(*) FROM sessions WHERE account_id = :i"), {"i": account_id}
    ).scalar() == 1
    assert session.execute(
        text("SELECT active FROM licenses WHERE account_id = :i"), {"i": account_id}
    ).scalar() is True


def test_the_014_migration_produces_the_columns_that_create_all_produces(session):
    from adscope_api.auth_models import Account, LoginToken, Mail

    to_old_shape(session)
    apply_migrations(session.connection())
    assert columns(session, "accounts") == set(Account.__table__.c.keys())
    assert columns(session, "login_tokens") == set(LoginToken.__table__.c.keys())
    assert columns(session, "mails") == set(Mail.__table__.c.keys())


def test_the_014_migration_is_replayable(session):
    to_old_shape(session)
    apply_migrations(session.connection())
    assert apply_migrations(session.connection()) == []


# Le lot Corpus arrive sur une base qui porte des annonces et des licences
# existantes : deux tables neuves, aucune colonne touchée sur `listings`.
def test_the_016_migration_adds_the_corpus_tables(session):
    to_old_shape(session)
    assert not {"rechecks", "divergences"} & tables(session)
    apply_migrations(session.connection())
    assert {"rechecks", "divergences"} <= tables(session)


def test_the_016_migration_is_replayable(session):
    to_old_shape(session)
    apply_migrations(session.connection())
    assert apply_migrations(session.connection()) == []


def test_the_016_migration_produces_the_columns_that_create_all_produces(session):
    from adscope_api.corpus_models import Divergence, Recheck

    to_old_shape(session)
    apply_migrations(session.connection())
    for model in (Recheck, Divergence):
        assert columns(session, model.__tablename__) == set(model.__table__.c.keys())


def test_the_index_on_divergences_license_exists(session):
    to_old_shape(session)
    apply_migrations(session.connection())
    indexes = session.execute(text(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'divergences'"
    ))
    assert {"ix_divergences_license", "ix_divergences_listing"} <= {
        row[0] for row in indexes
    }
