import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
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
