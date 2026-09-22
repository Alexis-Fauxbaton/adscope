from datetime import datetime, timedelta, timezone

from adscope_api.alert_models import SavedSearch
from adscope_api.auth import hash_key, new_key
from adscope_api.auth_models import Account
from adscope_api.market_params import MarketParams
from adscope_api.models import License, Listing
from adscope_api.taxonomy import derive

from conftest import auth

NOW = datetime(2026, 9, 18, 12, 0, tzinfo=timezone.utc)


def enrolled(session, email):
    account = Account(email=email)
    session.add(account)
    session.flush()
    raw = new_key()
    session.add(License(key_hash=hash_key(raw), label="marchand", account_id=account.id))
    session.commit()
    return account.id


def saved(session, account_id, query, *, paused=False, name="s"):
    row = SavedSearch(account_id=account_id, name=name,
                      query=MarketParams.from_query(query).to_query(),
                      paused=paused, created_at=NOW)
    session.add(row)
    session.commit()
    return row


def car(session, site_id, *, brand, model, seller_type=None, last_seen=NOW, prices=()):
    from adscope_api.models import PricePoint
    row = Listing(site="lbc", site_id=site_id, first_seen=last_seen, last_seen=last_seen,
                  observations=1, brand=brand, model=model, seller_type=seller_type)
    row.prices = [PricePoint(observed_at=at, price=price, source="user", confirmation=False)
                  for at, price in prices]
    derive(row)
    session.add(row)
    return row


def sweep(client, key, **params):
    return client.get("/v1/sweep", params=params, headers=auth(key))


# Fait rougir la clé de dédoublonnage (`SavedSearch.query`, `.distinct()`) :
# deux comptes qui enregistrent la même recherche ne rendent qu'une entrée.
def test_two_accounts_same_search_is_one_entry(client, key, session):
    a = enrolled(session, "a@garage.fr")
    b = enrolled(session, "b@garage.fr")
    car(session, "1", brand="Peugeot", model="208")
    session.commit()
    saved(session, a, "brand=Peugeot&model=208")
    saved(session, b, "brand=Peugeot&model=208")
    body = sweep(client, key).json()
    assert len(body["items"]) == 1


# Fait rougir tout ajout futur d'une clé de compte à une entrée : les clés
# rendues sont exactement celles du contrat, jamais un `id`, un `account_id`
# ou un nom.
def test_an_entry_has_exactly_these_keys(client, key, session):
    a = enrolled(session, "a@garage.fr")
    car(session, "1", brand="Peugeot", model="208")
    session.commit()
    saved(session, a, "brand=Peugeot&model=208")
    item = sweep(client, key).json()["items"][0]
    assert set(item) == {"url", "pages", "expected_total", "coverage_24h", "unmapped"}


# Fait rougir l'`order_by` par couverture croissante.
def test_lower_coverage_is_served_before_higher(client, key, session, clock):
    a = enrolled(session, "a@garage.fr")
    for i in range(10):
        car(session, f"p{i}", brand="Peugeot", model="208",
            last_seen=NOW - (timedelta(hours=1) if i < 2 else timedelta(days=5)))
    for i in range(10):
        car(session, f"c{i}", brand="Citroen", model="C3",
            last_seen=NOW - (timedelta(hours=1) if i < 9 else timedelta(days=5)))
    session.commit()
    saved(session, a, "brand=Peugeot&model=208", name="peu")
    saved(session, a, "brand=Citroen&model=C3", name="cit")
    items = sweep(client, key).json()["items"]
    assert [round(i["coverage_24h"], 1) for i in items] == [0.2, 0.9]


# Fait rougir le `nulls_first` : un périmètre vide (recherche dont aucune
# annonce du filtre n'a de prix, donc aucune ne satisfait `price_min`) passe
# devant une couverture chiffrée.
def test_null_coverage_comes_first(client, key, session, clock):
    a = enrolled(session, "a@garage.fr")
    car(session, "1", brand="Peugeot", model="208")  # sans prix
    for i in range(5):
        car(session, f"c{i}", brand="Citroen", model="C3", last_seen=NOW - timedelta(hours=1))
    session.commit()
    saved(session, a, "brand=Peugeot&model=208&price_min=1", name="vide")
    saved(session, a, "brand=Citroen&model=C3", name="pleine")
    items = sweep(client, key).json()["items"]
    assert items[0]["coverage_24h"] is None


# Fait rougir le `ceil(total/35)`.
def test_36_listings_need_two_pages(client, key, session):
    a = enrolled(session, "a@garage.fr")
    for i in range(36):
        car(session, str(i), brand="Peugeot", model="208")
    session.commit()
    saved(session, a, "brand=Peugeot&model=208")
    item = sweep(client, key).json()["items"][0]
    assert (item["expected_total"], item["pages"]) == (36, 2)


# Fait rougir le `max(1, ...)` : un périmètre vide ouvre quand même sa page 1.
def test_an_empty_perimeter_still_opens_page_one(client, key, session):
    a = enrolled(session, "a@garage.fr")
    car(session, "1", brand="Peugeot", model="208")  # seed l'écriture, sans prix
    session.commit()
    saved(session, a, "brand=Peugeot&model=208&price_min=1")
    item = sweep(client, key).json()["items"][0]
    assert (item["expected_total"], item["pages"]) == (0, 1)


# Fait rougir le plafond `PAGE_CAP = 20` et le découpage `owner_type`.
def test_900_listings_split_by_owner_type(client, key, session):
    a = enrolled(session, "a@garage.fr")
    for i in range(450):
        car(session, f"pr{i}", brand="Peugeot", model="208", seller_type="private")
    for i in range(450):
        car(session, f"po{i}", brand="Peugeot", model="208", seller_type="pro")
    session.commit()
    saved(session, a, "brand=Peugeot&model=208")
    items = sweep(client, key).json()["items"]
    assert sorted("owner_type=private" in i["url"] or "owner_type=pro" in i["url"] for i in items) == [
        True, True,
    ]
    assert len(items) == 2


# Fait rougir le `break` du budget (et pas un `continue`, qui affamerait
# indéfiniment les grosses recherches) : trois entrées triées Citroën (6
# pages), Peugeot (6 pages), Renault (3 pages) ; budget 10. Citroën tient,
# Peugeot ne tient pas et arrête tout — Renault ne doit jamais être servie,
# alors qu'elle tiendrait seule dans les 4 pages restantes.
def test_the_budget_stops_at_the_first_entry_that_does_not_fit(client, key, session):
    a = enrolled(session, "a@garage.fr")
    for i in range(200):
        car(session, f"c{i}", brand="Citroen", model="C3")
    for i in range(200):
        car(session, f"p{i}", brand="Peugeot", model="208")
    for i in range(90):
        car(session, f"r{i}", brand="Renault", model="Clio")
    session.commit()
    saved(session, a, "brand=Citroen&model=C3", name="cit")
    saved(session, a, "brand=Peugeot&model=208", name="peu")
    saved(session, a, "brand=Renault&model=Clio", name="ren")
    body = sweep(client, key, pages=10).json()
    assert [i["pages"] for i in body["items"]] == [6]
    assert body["pages"] == 6


# Fait rougir `where(SavedSearch.paused.is_(False))`.
def test_a_paused_search_is_absent_from_the_queue(client, key, session):
    a = enrolled(session, "a@garage.fr")
    car(session, "1", brand="Peugeot", model="208")
    session.commit()
    saved(session, a, "brand=Peugeot&model=208", paused=True)
    body = sweep(client, key).json()
    assert body["items"] == [] and body["skipped"] == []


# Fait rougir `require_license` (et non `require_account`) : une clé de
# machine sans compte entre dans la file.
def test_a_license_without_an_account_gets_200(client, session):
    raw = new_key()
    session.add(License(key_hash=hash_key(raw), label="crawler"))
    session.commit()
    assert sweep(client, raw).status_code == 200


def test_the_route_needs_a_license(client, session):
    assert client.get("/v1/sweep").status_code == 401
