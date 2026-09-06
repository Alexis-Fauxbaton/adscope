"""Les épreuves de concurrence rejouées contre plusieurs processus uvicorn.

Tout ce qui précède avait été mesuré sur un seul processus. Les verrous sont
pris dans la base, donc plusieurs processus *devraient* tenir — ceci le mesure
au lieu de le supposer. Les processus montent sur les ports 8801 et suivants,
jamais celui du service, contre `adscope_test`, jamais la base de développement,
qu'un garde-fou interdit de toucher.

    ./.venv/bin/python scripts/multiprocess_trial.py [--processes 3] [--rounds 3]

Rend 0 si tout tient, 1 au premier écart, et imprime ce qu'elle a mesuré.
"""
import os
import sys
from datetime import date, timedelta

from uvicorn_fleet import fire, kill, post, spawn

URL = os.environ.get(
    "ADSCOPE_TEST_DATABASE_URL", "postgresql+psycopg://localhost/adscope_test"
)
if not URL.endswith("/adscope_test"):
    sys.exit("épreuve refusée : elle ne tourne que sur adscope_test")
# Lu à l'import de `adscope_api.db` : posé avant, donc, et non dans un réglage.
os.environ["DATABASE_URL"] = URL

from sqlalchemy import delete, func, select, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from adscope_api.auth import hash_key, new_key  # noqa: E402
from adscope_api.db import create_all, engine  # noqa: E402
from adscope_api.models import License, Listing, PricePoint  # noqa: E402

WRITERS = 10
CROSSED = 20
TABLES = "listings, price_points, usage_days, usage_summaries"
Session = sessionmaker(engine, expire_on_commit=False)


def obs(**kw):
    return {"site": "lc", "site_id": "87103336930", "price": 9900, **kw}


def batch(*items):
    return {"items": list(items)}


def run(session, name, ports, key, payloads, seed=False):
    """Une épreuve : tables vidées, une observation d'amorce au besoin, le feu."""
    session.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))
    session.commit()
    if seed:
        post(ports[0], batch(obs()), key)
    codes = fire(ports, payloads, key)
    session.expire_all()
    first = session.scalars(select(Listing).order_by(Listing.id)).first()
    return {
        "épreuve": name, "codes": sorted(set(codes)),
        "annonces": session.scalar(select(func.count()).select_from(Listing)),
        "observations": first.observations if first else 0,
        "borne basse": first.site_published_first if first else None,
        "borne haute": first.site_published_last if first else None,
        "points de prix": session.scalar(select(func.count()).select_from(PricePoint)),
    }


def trials(session, ports, key):
    """Les quatre épreuves qui comptent, mesurées puis confrontées à l'attendu."""
    day = date.today()
    ages = [60] + [2] * (WRITERS - 1)
    ids = [str(n) for n in range(CROSSED)]
    forward = [obs(site_id=i) for i in ids]
    backward = [obs(site_id=i) for i in reversed(ids)]
    yield run(session, "compteur", ports, key, [batch(obs())] * WRITERS, seed=True), {
        "codes": [200], "annonces": 1, "observations": WRITERS + 1}
    yield run(session, "bornes", ports, key,
              [batch(obs(published_days_ago=age)) for age in ages], seed=True), {
        "codes": [200], "annonces": 1, "observations": WRITERS + 1,
        "borne basse": day - timedelta(days=60), "borne haute": day - timedelta(days=2)}
    yield run(session, "création", ports, key, [batch(obs())] * WRITERS), {
        "codes": [200], "annonces": 1, "observations": WRITERS, "points de prix": 1}
    yield run(session, "point de prix", ports, key,
              [batch(obs(price=8900))] * WRITERS, seed=True), {
        "codes": [200], "annonces": 1, "observations": WRITERS + 1,
        "points de prix": 2}
    yield run(session, "lots croisés", ports, key,
              [batch(*forward), batch(*backward)] * len(ports)), {
        "codes": [200], "annonces": CROSSED}


def main():
    options = dict(zip(sys.argv[1::2], sys.argv[2::2]))
    count, rounds = int(options.get("--processes", 3)), int(options.get("--rounds", 3))
    create_all()
    session, key = Session(), new_key()
    session.add(License(key_hash=hash_key(key), label="épreuve"))
    session.commit()
    processes, ports = spawn(count, URL)
    gaps = 0
    try:
        for round_ in range(1, rounds + 1):
            for measured, expected in trials(session, ports, key):
                gap = {k: (v, measured[k]) for k, v in expected.items() if measured[k] != v}
                gaps += bool(gap)
                print(f"tour {round_} | {measured} | "
                      + (f"ATTENDU/MESURÉ {gap}" if gap else "conforme"))
    finally:
        kill(processes)
        session.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))
        session.execute(delete(License).where(License.label == "épreuve"))
        session.commit()
        session.close()
    print(f"{count} processus, {rounds} tours, {gaps} écart(s)")
    return 1 if gaps else 0


if __name__ == "__main__":
    sys.exit(main())
