from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from adscope_api.auth import hash_key, new_key
from adscope_api.follow_models import Follow
from adscope_api.models import License, Listing

from conftest import auth

NOW = datetime(2026, 9, 12, 9, 0, tzinfo=timezone.utc)
ONE = "3263259495"
TWO = "3263259496"


def listed(session, site_id=ONE, site="lbc", **kw):
    listing = Listing(site=site, site_id=site_id, first_seen=NOW, last_seen=NOW,
                      observations=1, **kw)
    session.add(listing)
    session.commit()
    return listing


def other_license(session):
    raw = new_key()
    session.add(License(key_hash=hash_key(raw), label="autre"))
    session.commit()
    return raw


def follow(client, key, site_id=ONE, site="lbc"):
    return client.post("/v1/follows", json={"site": site, "site_id": site_id},
                       headers=auth(key))


# Fait rougir `if listing is None: raise HTTPException(404)` dans
# `follows.post_follow` : sans lui, suivre une annonce que la base ne connaît
# pas écrirait une ligne pointant sur rien — et l'annonce inconnue est
# précisément le cas que le panneau nomme « pas encore suivie ».
def test_following_an_unknown_listing_is_a_404(client, key):
    assert follow(client, key, "jamais-vue").status_code == 404


def test_following_answers_201_and_the_moment(client, key, session):
    listed(session)
    res = follow(client, key)
    assert res.status_code == 201
    body = res.json()
    assert (body["site"], body["site_id"]) == ("lbc", ONE)
    assert body["followed_at"]


# Fait rougir `.on_conflict_do_nothing()` et la branche `if followed_at is
# None` : sans elles, un second clic — deux onglets, un doigt qui glisse —
# rendrait 500 sur la clé primaire, ou écraserait la date à laquelle le
# marchand avait mis l'annonce de côté.
def test_following_twice_answers_200_and_keeps_the_first_moment(client, key, session):
    listed(session)
    first = follow(client, key)
    second = follow(client, key)
    assert (first.status_code, second.status_code) == (201, 200)
    assert second.json() == first.json()


# Fait rougir `if count >= MAX_FOLLOWS` dans `follows.post_follow` (A7, audit
# d'abus) : au-delà, une annonce de plus tombait toujours en rang 0 de la
# file de revisite commune, sans considération du nombre déjà suivi.
def test_following_past_the_cap_is_refused(client, key, session):
    from adscope_api.follows import MAX_FOLLOWS

    for i in range(MAX_FOLLOWS):
        listed(session, site_id=f"cap{i}")
        assert follow(client, key, site_id=f"cap{i}").status_code == 201
    listed(session, site_id="one-too-many")
    response = follow(client, key, site_id="one-too-many")
    assert response.status_code == 409

    # Le suivi déjà posé, lui, n'est pas gêné par le plafond atteint — un
    # second clic reste un 200, jamais un 409.
    assert follow(client, key, site_id="cap0").status_code == 200


# Fait rougir `.limit(MAX_FOLLOWS)` dans `follows.get_follows` : la lecture
# ne rend jamais plus que le plafond d'écriture, même pour un suivi posé
# directement en base (migration, script) plutôt que par la route.
def test_get_follows_never_renders_more_than_the_cap(client, key, session):
    from adscope_api.follow_models import Follow
    from adscope_api.follows import MAX_FOLLOWS

    for i in range(MAX_FOLLOWS + 5):
        listing = listed(session, site_id=f"over{i}")
        session.add(Follow(license_key_hash=hash_key(key), listing_id=listing.id,
                           followed_at=NOW + timedelta(seconds=i)))
    session.commit()
    body = client.get("/v1/follows", headers=auth(key)).json()
    assert len(body) == MAX_FOLLOWS


# Fait rougir `listing.next_detail_crawl = now` : c'est tout ce que suivre
# change au crawl. Sans cette ligne l'annonce garderait l'espacement posé par
# la dernière revisite — une semaine — et le geste du marchand n'aurait aucun
# effet sur ce que la base saura demain.
def test_following_puts_the_listing_at_the_head_of_the_queue(client, key, session):
    listing = listed(session, next_detail_crawl=NOW + timedelta(days=30))
    follow(client, key)
    assert listing.next_detail_crawl <= datetime.now(timezone.utc)


# Fait rougir le `else:` qui tient cette même ligne : un second clic sur une
# annonce déjà suivie n'est pas un second geste, et ne doit pas rappeler la
# file.
def test_a_second_click_does_not_reopen_the_queue(client, key, session):
    listing = listed(session)
    follow(client, key)
    later = NOW + timedelta(days=30)
    listing.next_detail_crawl = later
    session.commit()
    follow(client, key)
    assert listing.next_detail_crawl == later


def test_unfollowing_answers_204_and_drops_it(client, key, session):
    listed(session)
    follow(client, key)
    assert client.delete(f"/v1/follows/lbc/{ONE}", headers=auth(key)).status_code == 204
    assert client.get("/v1/follows", headers=auth(key)).json() == []


def test_unfollowing_what_was_never_followed_is_still_204(client, key, session):
    listed(session)
    assert client.delete(f"/v1/follows/lbc/{ONE}", headers=auth(key)).status_code == 204


# Fait rougir `Follow.license_key_hash == license_.key_hash` dans
# `follows.delete_follow` : sans ce filtre, un marchand qui cesse de suivre une
# annonce l'arracherait de la liste de tous les autres.
def test_unfollowing_touches_only_the_caller(client, key, session):
    listed(session)
    other = other_license(session)
    follow(client, key)
    follow(client, other)
    client.delete(f"/v1/follows/lbc/{ONE}", headers=auth(key))
    assert [f["site_id"] for f in client.get("/v1/follows", headers=auth(other)).json()] \
        == [ONE]


# Fait rougir le même filtre dans `follows.get_follows` : la liste est celle du
# marchand qui la demande, jamais celle de la base.
def test_the_list_is_the_caller_s_own(client, key, session):
    listed(session, ONE)
    listed(session, TWO)
    other = other_license(session)
    follow(client, key, ONE)
    follow(client, other, TWO)
    assert [f["site_id"] for f in client.get("/v1/follows", headers=auth(key)).json()] \
        == [ONE]


def test_the_follow_routes_need_a_license(client, session):
    assert client.post("/v1/follows", json={"site": "lbc", "site_id": ONE}) \
        .status_code == 401
    assert client.get("/v1/follows").status_code == 401
    assert client.delete(f"/v1/follows/lbc/{ONE}").status_code == 401


# Fait rougir `followed=...` dans `main.get_listing` et le filtre par licence
# de `follows.followed_ids` : le panneau affiche « suivie » ou « pas encore
# suivie », et le suivi d'un autre marchand n'est pas le sien.
def test_the_listing_says_followed_for_the_calling_license_only(client, key, session):
    listed(session)
    other = other_license(session)
    follow(client, key)
    mine = client.get(f"/v1/listings/lbc/{ONE}", headers=auth(key)).json()
    theirs = client.get(f"/v1/listings/lbc/{ONE}", headers=auth(other)).json()
    assert (mine["followed"], theirs["followed"]) == (True, False)


# Fait rougir `followed=listing.id in kept` dans `main.post_batch` : sans lui
# la page de résultats ne saurait pas lesquelles de ses trente cartes sont
# déjà suivies.
def test_the_batch_says_which_are_followed(client, key, session):
    listed(session, ONE)
    listed(session, TWO)
    follow(client, key, ONE)
    body = client.post("/v1/listings/batch", json={"site": "lbc", "ids": [ONE, TWO]},
                       headers=auth(key)).json()
    assert {item["site_id"]: item["followed"] for item in body} == {ONE: True, TWO: False}


# Fait rougir `ondelete="CASCADE"` sur `Follow.license_key_hash` : un suivi n'a
# de sens que pour celui qui l'a posé, et resterait sinon à pointer une licence
# qui n'existe plus.
def test_a_deleted_license_takes_its_follows_with_it(client, key, session):
    listed(session)
    follow(client, key)
    session.execute(delete(License).where(License.key_hash == hash_key(key)))
    session.commit()
    assert session.scalars(select(Follow)).all() == []
