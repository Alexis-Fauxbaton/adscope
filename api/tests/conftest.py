import os
import threading
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from argon2 import PasswordHasher
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from adscope_api import passwords, usage
from adscope_api.rate_limit import limiter
from adscope_api.auth import hash_key, new_key
from adscope_api.db import create_all, get_session
from adscope_api.main import app
from adscope_api.model_vocabulary import CACHE
from adscope_api.models import Base, License
from adscope_api.sessions import now_utc

TEST_URL = os.environ.get(
    "ADSCOPE_TEST_DATABASE_URL", "postgresql+psycopg://localhost/adscope_test"
)


@pytest.fixture(scope="session")
def engine():
    return create_engine(TEST_URL)


@pytest.fixture
def session(engine):
    Base.metadata.drop_all(engine)
    create_all(engine)
    # Le vocabulaire des modèles est tenu en mémoire pour tout le processus
    # (`model_vocabulary.CACHE`, dix minutes). Le processus de test, lui, refait
    # la base à chaque scénario : sans cet oubli, `observations.record`
    # déduirait avec le vocabulaire du test précédent.
    CACHE.forget()
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as s:
        yield s


# Le client HTTP et sa licence : trois fichiers de tests les demandent, ils se
# tiennent ici plutôt que recopiés.
@pytest.fixture
def key(session):
    raw = new_key()
    session.add(License(key_hash=hash_key(raw), label="test"))
    session.commit()
    return raw


@pytest.fixture
def client(session):
    app.dependency_overrides[get_session] = lambda: session
    yield TestClient(app)
    app.dependency_overrides.clear()


def auth(key):
    return {"Authorization": f"Bearer {key}"}


NOW = datetime(2026, 9, 18, 12, 0, tzinfo=timezone.utc)


# L'horloge des routes, posée à la main. Un jeton qui périme en un quart d'heure
# et une session qui dure quatre-vingt-dix jours ne s'éprouvent pas en attendant
# : l'instant s'injecte, et `clock.now = ...` avance le temps d'un test.
@pytest.fixture
def clock():
    box = SimpleNamespace(now=NOW)
    app.dependency_overrides[now_utc] = lambda: box.now
    yield box
    app.dependency_overrides.pop(now_utc, None)


# La fermeture des journées passées n'a lieu qu'une fois par jour et par
# processus : le marqueur ne doit pas traverser d'un test à l'autre.
@pytest.fixture(autouse=True)
def _day_not_closed_yet():
    usage._closed_on = None


# Argon2id en production coûte ~60 ms par hachage (voir `passwords.py`) : à ce
# prix, la suite entière deviendrait interminable. Les tests hachent avec des
# paramètres au rabais ; `test_passwords.py` garde, lui, les paramètres forts
# en vérifiant les constantes (`ARGON2_TIME_COST` etc.), jamais l'instance
# patchée ici.
@pytest.fixture(autouse=True)
def _cheap_hasher(monkeypatch):
    monkeypatch.setattr(passwords, "_hasher",
                        PasswordHasher(time_cost=1, memory_cost=8, parallelism=1))


# Le limiteur de débit est un état de module (`rate_limit._hits`) : il
# traverserait sinon d'un test à l'autre.
@pytest.fixture(autouse=True)
def _rate_limits_reset():
    limiter.reset()
    yield
    limiter.reset()


# Les tests de concurrence demandent de vraies connexions distinctes : deux
# fils qui partagent la session ci-dessus ne se heurtent jamais dans la base et
# ne prouvent rien. `sessions` en ouvre autant qu'on veut sur le même moteur.
@pytest.fixture
def sessions(engine, session):
    return sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
def concurrently(sessions):
    """Lance `work(index, session)` dans N fils lâchés sur une barrière.

    La connexion est prise avant la barrière : sans cela les fils se mettraient
    en file d'attente sur le pool au lieu d'entrer ensemble dans la base.
    Rend la liste des erreurs, vide si tout est passé.
    """

    def run(count, work):
        barrier = threading.Barrier(count)
        errors = []

        def one(index):
            with sessions() as s:
                s.execute(text("SELECT 1"))
                barrier.wait(timeout=20)
                try:
                    work(index, s)
                    s.commit()
                except Exception as error:  # noqa: BLE001 - le test les compte
                    s.rollback()
                    errors.append(error)

        threads = [threading.Thread(target=one, args=(i,)) for i in range(count)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        return errors

    return run
