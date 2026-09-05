import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from adscope_api.db import create_all
from adscope_api.models import Base

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
