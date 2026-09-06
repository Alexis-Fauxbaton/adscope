import os
import threading

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from adscope_api import usage
from adscope_api.auth import hash_key, new_key
from adscope_api.db import create_all, get_session
from adscope_api.main import app
from adscope_api.models import Base, License

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


# La fermeture des journées passées n'a lieu qu'une fois par jour et par
# processus : le marqueur ne doit pas traverser d'un test à l'autre.
@pytest.fixture(autouse=True)
def _day_not_closed_yet():
    usage._closed_on = None


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
