# adscope — Fondations partagées et API — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire l'empreinte véhicule partagée et l'API qui reçoit les observations et sert les signaux, testable seule au curl, sans extension ni crawler.

**Architecture:** FastAPI devant Postgres via SQLAlchemy 2.0. Toute la logique métier — déduplication des prix, dates de publication, détection de republication — vit en Python dans des fonctions pures testables, jamais en SQL. L'authentification se fait par clé de licence portée en `Authorization: Bearer`, stockée hashée.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy 2.0, psycopg 3, Pydantic v2, pytest, Postgres 17.

**Spec:** `docs/superpowers/specs/2026-09-05-adscope-v1-design.md`

## Global Constraints

- **Empreinte identique en JS et en Python.** Toute modification de l'algorithme doit
  garder `shared/fingerprint-vectors.json` vert des deux côtés. C'est la contrainte la
  plus dure du projet : une divergence rend les jeux de données impossibles à joindre.
- **Seuls des constats dérivés sont conservés** : identifiant, empreinte, prix,
  horodatage, ancienneté. Ni descriptions, ni photos, ni reproduction des fiches.
- **Un point de prix n'est écrit que s'il diffère du dernier connu pour l'annonce.**
- **Seuil de détection de republication : 7 jours** (`REPUBLICATION_THRESHOLD_DAYS`).
- **Empreinte** : `sha256` de `brand|model|version|year|mileage` normalisés, 12 premiers
  caractères hexadécimaux. Le code postal en est exclu.
- Aucun fichier au-dessus de 150 lignes.
- Pas de validation défensive superflue, pas de commentaire qui redit le code.

## Environnement local (déjà en place)

Postgres 17 via Homebrew, service démarré, bases `adscope` et `adscope_test` créées.
`/opt/homebrew/opt/postgresql@17/bin` ajouté au `PATH` dans `~/.zshrc`.

```
DATABASE_URL       = postgresql+psycopg://localhost/adscope
ADSCOPE_TEST_DATABASE_URL = postgresql+psycopg://localhost/adscope_test
```

## Structure des fichiers

| fichier | responsabilité |
|---|---|
| `shared/fingerprint.md` | l'algorithme, écrit une fois, pour les deux langages |
| `shared/fingerprint-vectors.json` | vecteurs de test, assertés côté Python et côté JS |
| `api/pyproject.toml` | dépendances et configuration pytest |
| `api/adscope_api/fingerprint.py` | normalisation et hash |
| `api/adscope_api/config.py` | URL de base de données depuis l'environnement |
| `api/adscope_api/db.py` | moteur, session, création du schéma |
| `api/adscope_api/models.py` | `Listing`, `PricePoint`, `License` |
| `api/adscope_api/observations.py` | écriture d'une observation |
| `api/adscope_api/signals.py` | calcul des signaux servis au client |
| `api/adscope_api/auth.py` | génération, hachage et résolution des licences |
| `api/adscope_api/schemas.py` | contrats Pydantic entrée/sortie |
| `api/adscope_api/main.py` | application FastAPI et routes |
| `api/scripts/mint_license.py` | création d'une clé de licence |
| `api/tests/conftest.py` | base de test, session, client |

---

### Task 1: Empreinte partagée

**Files:**
- Create: `shared/fingerprint.md`
- Create: `shared/fingerprint-vectors.json`
- Create: `api/pyproject.toml`
- Create: `api/adscope_api/__init__.py`
- Create: `api/adscope_api/fingerprint.py`
- Test: `api/tests/test_fingerprint.py`

**Interfaces:**
- Consumes: rien
- Produces: `normalize(value) -> str`, `fingerprint_key(brand, model, version, year, mileage) -> str`, `fingerprint(brand, model, version, year, mileage) -> str`

- [ ] **Step 1: Créer les vecteurs de test**

`shared/fingerprint-vectors.json` — valeurs vérifiées le 2026-09-05, identiques en JS et Python :

```json
[
  {"brand": "PEUGEOT", "model": "308 II phase 2", "version": "1.2 PURETECH 110 STYLE",
   "year": 2018, "mileage": 62686,
   "key": "PEUGEOT|308 II PHASE 2|1 2 PURETECH 110 STYLE|2018|62686",
   "fingerprint": "54b22edbd39c"},
  {"brand": "PEUGEOT", "model": "308 II phase 2", "version": "1.5 BLUEHDI 130 STYLE",
   "year": 2019, "mileage": 87545,
   "key": "PEUGEOT|308 II PHASE 2|1 5 BLUEHDI 130 STYLE|2019|87545",
   "fingerprint": "b15b5ff0e88a"},
  {"brand": "Citroën", "model": "C4 Picasso", "version": "1.6 BlueHDi  120 Shine",
   "year": 2016, "mileage": 118400,
   "key": "CITROEN|C4 PICASSO|1 6 BLUEHDI 120 SHINE|2016|118400",
   "fingerprint": "13b6e4bc4bc1"},
  {"brand": "BMW", "model": "Série 3 (F30)", "version": "320d xDrive",
   "year": 2019, "mileage": 88123,
   "key": "BMW|SERIE 3 F30|320D XDRIVE|2019|88123",
   "fingerprint": "946e1f6a35ed"},
  {"brand": null, "model": null, "version": null, "year": null, "mileage": null,
   "key": "||||",
   "fingerprint": "45ca31c3315a"}
]
```

- [ ] **Step 2: Écrire `shared/fingerprint.md`**

```markdown
# Empreinte véhicule adscope

Calculée à l'identique par l'extension (JS) et par le backend (Python). Une divergence
rend les deux jeux de données impossibles à joindre, et les empreintes du passé ne se
recalculent pas.

## Normalisation d'une chaîne

1. Normalisation Unicode NFD
2. Suppression des caractères de catégorie `Mn` (diacritiques)
3. Passage en majuscules
4. Remplacement de toute suite hors `[A-Z0-9]` par une espace
5. `trim`

## Clé

`[brand, model, version, year, mileage]` jointe par `|`. Les trois premiers sont
normalisés ; `year` et `mileage` sont convertis en chaîne sans arrondi. Un champ absent
(`None` / `null` / `undefined`) devient une chaîne vide ; la position est conservée.

## Empreinte

`sha256(clé, utf-8)`, hexadécimal, 12 premiers caractères.

## Le code postal est exclu

La fiche expose un code postal complet (`75015`), les cartes de résultats affichent
tantôt un département (`93`), tantôt un nom de ville (`PARIS`). L'inclure produirait deux
empreintes différentes pour le même véhicule selon la page d'observation.

## Vecteurs

`fingerprint-vectors.json`, asserté par `api/tests/test_fingerprint.py` et par les tests
de l'extension.
```

- [ ] **Step 3: Créer `api/pyproject.toml`**

```toml
[project]
name = "adscope-api"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "sqlalchemy>=2.0.36",
    "psycopg[binary]>=3.2",
    "pydantic>=2.9",
]

[project.optional-dependencies]
dev = ["pytest>=8.3", "httpx>=0.28"]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"
```

- [ ] **Step 4: Écrire le test qui échoue**

`api/tests/test_fingerprint.py` :

```python
import json
from pathlib import Path

import pytest

from adscope_api.fingerprint import fingerprint, fingerprint_key, normalize

VECTORS = json.loads(
    (Path(__file__).parents[2] / "shared" / "fingerprint-vectors.json").read_text()
)


@pytest.mark.parametrize("v", VECTORS, ids=lambda v: v["fingerprint"])
def test_matches_shared_vectors(v):
    args = (v["brand"], v["model"], v["version"], v["year"], v["mileage"])
    assert fingerprint_key(*args) == v["key"]
    assert fingerprint(*args) == v["fingerprint"]


def test_normalize_strips_accents_and_punctuation():
    assert normalize("Citroën C4  (Picasso)") == "CITROEN C4 PICASSO"


def test_normalize_handles_none():
    assert normalize(None) == ""


def test_fingerprint_is_twelve_hex_chars():
    fp = fingerprint("PEUGEOT", "308", "1.2", 2018, 62686)
    assert len(fp) == 12
    assert all(c in "0123456789abcdef" for c in fp)
```

- [ ] **Step 5: Lancer le test, vérifier qu'il échoue**

```bash
cd api && python3 -m venv .venv && ./.venv/bin/pip install -q -e ".[dev]"
./.venv/bin/pytest tests/test_fingerprint.py -q
```

Attendu : `ModuleNotFoundError: No module named 'adscope_api.fingerprint'`

- [ ] **Step 6: Implémenter**

`api/adscope_api/__init__.py` : fichier vide.

`api/adscope_api/fingerprint.py` :

```python
import hashlib
import re
import unicodedata

_NON_ALNUM = re.compile(r"[^A-Z0-9]+")


def normalize(value) -> str:
    text = "" if value is None else str(value)
    decomposed = unicodedata.normalize("NFD", text)
    without_marks = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return _NON_ALNUM.sub(" ", without_marks.upper()).strip()


def fingerprint_key(brand, model, version, year, mileage) -> str:
    return "|".join([
        normalize(brand),
        normalize(model),
        normalize(version),
        "" if year is None else str(year),
        "" if mileage is None else str(mileage),
    ])


def fingerprint(brand, model, version, year, mileage) -> str:
    key = fingerprint_key(brand, model, version, year, mileage)
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:12]
```

- [ ] **Step 7: Lancer le test, vérifier qu'il passe**

```bash
cd api && ./.venv/bin/pytest tests/test_fingerprint.py -q
```

Attendu : 8 passed.

- [ ] **Step 8: Commit**

```bash
git add shared api/pyproject.toml api/adscope_api api/tests
git commit -m "Empreinte véhicule partagée, assertée sur vecteurs communs"
```

---

### Task 2: Modèles et connexion

**Files:**
- Create: `api/adscope_api/config.py`
- Create: `api/adscope_api/db.py`
- Create: `api/adscope_api/models.py`
- Create: `api/tests/conftest.py`
- Test: `api/tests/test_models.py`

**Interfaces:**
- Consumes: rien
- Produces: `Base`, `Listing`, `PricePoint`, `License`, `settings.database_url`, `session_scope()`, `create_all(engine)`, fixture pytest `session`

- [ ] **Step 1: Écrire le test qui échoue**

`api/tests/test_models.py` :

```python
from datetime import datetime, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from adscope_api.models import Listing, PricePoint

NOW = datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)


def test_listing_roundtrip(session):
    session.add(Listing(site="lc", site_id="87103336930", first_seen=NOW, last_seen=NOW))
    session.commit()
    stored = session.query(Listing).one()
    assert stored.site_id == "87103336930"
    assert stored.observations == 0
    assert stored.disappeared_at is None


def test_site_and_site_id_are_unique_together(session):
    session.add(Listing(site="lc", site_id="1", first_seen=NOW, last_seen=NOW))
    session.commit()
    session.add(Listing(site="lc", site_id="1", first_seen=NOW, last_seen=NOW))
    with pytest.raises(IntegrityError):
        session.commit()


def test_same_site_id_on_another_site_is_allowed(session):
    session.add(Listing(site="lc", site_id="1", first_seen=NOW, last_seen=NOW))
    session.add(Listing(site="lbc", site_id="1", first_seen=NOW, last_seen=NOW))
    session.commit()
    assert session.query(Listing).count() == 2


def test_price_points_are_ordered_by_observation(session):
    listing = Listing(site="lc", site_id="1", first_seen=NOW, last_seen=NOW)
    session.add(listing)
    session.flush()
    session.add_all([
        PricePoint(listing_id=listing.id, observed_at=NOW, price=9900, source="user"),
        PricePoint(listing_id=listing.id, observed_at=NOW.replace(day=1), price=10900,
                   source="crawler"),
    ])
    session.commit()
    session.refresh(listing)
    assert [p.price for p in listing.prices] == [10900, 9900]
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
cd api && ./.venv/bin/pytest tests/test_models.py -q
```

Attendu : `ModuleNotFoundError: No module named 'adscope_api.models'`

- [ ] **Step 3: Implémenter la configuration**

`api/adscope_api/config.py` :

```python
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str = os.environ.get(
        "DATABASE_URL", "postgresql+psycopg://localhost/adscope"
    )


settings = Settings()
```

- [ ] **Step 4: Implémenter les modèles**

`api/adscope_api/models.py` :

```python
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Listing(Base):
    __tablename__ = "listings"
    __table_args__ = (UniqueConstraint("site", "site_id", name="uq_listing_site_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    site: Mapped[str] = mapped_column(String(8), index=True)
    site_id: Mapped[str] = mapped_column(String(32))
    fingerprint: Mapped[str | None] = mapped_column(String(12), index=True, default=None)

    brand: Mapped[str | None] = mapped_column(String(64), default=None)
    model: Mapped[str | None] = mapped_column(String(128), default=None)
    version: Mapped[str | None] = mapped_column(String(128), default=None)
    year: Mapped[int | None] = mapped_column(default=None)
    mileage: Mapped[int | None] = mapped_column(default=None)
    postal_code: Mapped[str | None] = mapped_column(String(8), default=None)

    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    observations: Mapped[int] = mapped_column(default=0)

    site_published_first: Mapped[date | None] = mapped_column(Date, default=None)
    site_published_last: Mapped[date | None] = mapped_column(Date, default=None)
    disappeared_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    next_detail_crawl: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), index=True, default=None
    )

    prices: Mapped[list["PricePoint"]] = relationship(
        back_populates="listing",
        order_by="PricePoint.observed_at",
        cascade="all, delete-orphan",
    )


class PricePoint(Base):
    __tablename__ = "price_points"

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), index=True
    )
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    price: Mapped[int]
    source: Mapped[str] = mapped_column(String(8))

    listing: Mapped[Listing] = relationship(back_populates="prices")


class License(Base):
    __tablename__ = "licenses"

    key_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    label: Mapped[str] = mapped_column(String(64))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
```

- [ ] **Step 5: Implémenter la connexion**

`api/adscope_api/db.py` :

```python
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from .config import settings
from .models import Base

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def create_all(target=engine) -> None:
    Base.metadata.create_all(target)


@contextmanager
def session_scope():
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
```

- [ ] **Step 6: Écrire les fixtures de test**

`api/tests/conftest.py` :

```python
import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

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
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as s:
        yield s
```

- [ ] **Step 7: Lancer les tests, vérifier qu'ils passent**

```bash
cd api && ./.venv/bin/pytest tests/ -q
```

Attendu : 12 passed.

- [ ] **Step 8: Commit**

```bash
git add api/adscope_api api/tests
git commit -m "Modèles Listing, PricePoint et License, connexion Postgres"
```

---

### Task 3: Enregistrement des observations

C'est le cœur métier. La règle de déduplication des prix protège la base contre trente
utilisateurs consultant la même annonce le même jour.

**Files:**
- Create: `api/adscope_api/schemas.py`
- Create: `api/adscope_api/observations.py`
- Test: `api/tests/test_observations.py`

**Interfaces:**
- Consumes: `Listing`, `PricePoint`, `fingerprint()`
- Produces: `ObservationIn` (Pydantic), `record(session, observation, source, now=None) -> Listing`

- [ ] **Step 1: Écrire le test qui échoue**

`api/tests/test_observations.py` :

```python
from datetime import datetime, timedelta, timezone

from adscope_api.models import Listing
from adscope_api.observations import record
from adscope_api.schemas import ObservationIn

NOW = datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)


def obs(**kw):
    base = dict(site="lc", site_id="87103336930", price=9900, brand="PEUGEOT",
                model="308 II phase 2", version="1.2 PURETECH 110 STYLE",
                year=2018, mileage=62686, postal_code="75015")
    base.update(kw)
    return ObservationIn(**base)


def test_first_observation_creates_listing_and_one_price_point(session):
    listing = record(session, obs(), source="user", now=NOW)
    session.commit()
    assert listing.observations == 1
    assert listing.fingerprint == "54b22edbd39c"
    assert [p.price for p in listing.prices] == [9900]


def test_same_price_twice_does_not_add_a_point(session):
    record(session, obs(), source="user", now=NOW)
    listing = record(session, obs(), source="user", now=NOW + timedelta(days=1))
    session.commit()
    assert listing.observations == 2
    assert [p.price for p in listing.prices] == [9900]


def test_changed_price_adds_a_point(session):
    record(session, obs(price=10900), source="user", now=NOW)
    listing = record(session, obs(price=9900), source="user", now=NOW + timedelta(days=12))
    session.commit()
    assert [p.price for p in listing.prices] == [10900, 9900]


def test_published_days_ago_sets_both_bounds(session):
    listing = record(session, obs(published_days_ago=60), source="user", now=NOW)
    session.commit()
    assert listing.site_published_first == (NOW - timedelta(days=60)).date()
    assert listing.site_published_last == listing.site_published_first


def test_published_first_never_moves_forward(session):
    record(session, obs(published_days_ago=60), source="user", now=NOW)
    listing = record(session, obs(published_days_ago=2), source="user",
                     now=NOW + timedelta(days=1))
    session.commit()
    assert listing.site_published_first == (NOW - timedelta(days=60)).date()
    assert listing.site_published_last == (NOW + timedelta(days=1) - timedelta(days=2)).date()


def test_missing_fields_do_not_erase_known_values(session):
    record(session, obs(), source="user", now=NOW)
    listing = record(session, ObservationIn(site="lc", site_id="87103336930", price=9900),
                     source="crawler", now=NOW + timedelta(days=1))
    session.commit()
    assert listing.brand == "PEUGEOT"
    assert listing.mileage == 62686


def test_observation_clears_disappearance(session):
    listing = record(session, obs(), source="crawler", now=NOW)
    listing.disappeared_at = NOW
    session.commit()
    record(session, obs(), source="user", now=NOW + timedelta(days=1))
    session.commit()
    assert session.query(Listing).one().disappeared_at is None
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
cd api && ./.venv/bin/pytest tests/test_observations.py -q
```

Attendu : `ModuleNotFoundError: No module named 'adscope_api.observations'`

- [ ] **Step 3: Implémenter les schémas**

`api/adscope_api/schemas.py` :

```python
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

Source = Literal["user", "crawler"]


class ObservationIn(BaseModel):
    site: str = Field(max_length=8)
    site_id: str = Field(max_length=32)
    price: int | None = None
    brand: str | None = None
    model: str | None = None
    version: str | None = None
    year: int | None = None
    mileage: int | None = None
    postal_code: str | None = None
    published_days_ago: int | None = None


class ObservationsIn(BaseModel):
    source: Source = "user"
    items: list[ObservationIn] = Field(min_length=1, max_length=100)


class BatchIn(BaseModel):
    site: str = Field(max_length=8)
    ids: list[str] = Field(min_length=1, max_length=30)


class PricePointOut(BaseModel):
    at: datetime
    price: int


class SignalsOut(BaseModel):
    site: str
    site_id: str
    fingerprint: str | None
    first_seen: datetime
    last_seen: datetime
    observations: int
    tracked_days: int
    site_published_first: date | None
    real_age_days: int | None
    republished: bool
    republished_at: date | None
    price: int | None
    price_history: list[PricePointOut]
    price_delta: int | None
    price_delta_days: int | None
    stable_days: int | None
```

- [ ] **Step 4: Implémenter l'enregistrement**

`api/adscope_api/observations.py` :

```python
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from .fingerprint import fingerprint
from .models import Listing, PricePoint
from .schemas import ObservationIn

VEHICLE_FIELDS = ("brand", "model", "version", "year", "mileage", "postal_code")


def record(session, observation: ObservationIn, source: str, now=None) -> Listing:
    now = now or datetime.now(timezone.utc)

    listing = session.scalar(
        select(Listing).where(
            Listing.site == observation.site, Listing.site_id == observation.site_id
        )
    )
    if listing is None:
        listing = Listing(
            site=observation.site, site_id=observation.site_id,
            first_seen=now, last_seen=now, observations=0,
        )
        session.add(listing)

    for field in VEHICLE_FIELDS:
        value = getattr(observation, field)
        if value is not None:
            setattr(listing, field, value)

    listing.fingerprint = fingerprint(
        listing.brand, listing.model, listing.version, listing.year, listing.mileage
    )
    listing.last_seen = max(listing.last_seen, now)
    listing.observations += 1
    listing.disappeared_at = None

    if observation.published_days_ago is not None:
        published = (now - timedelta(days=observation.published_days_ago)).date()
        first = listing.site_published_first
        last = listing.site_published_last
        listing.site_published_first = published if first is None else min(first, published)
        listing.site_published_last = published if last is None else max(last, published)

    if observation.price is not None:
        session.flush()
        latest = session.scalar(
            select(PricePoint)
            .where(PricePoint.listing_id == listing.id)
            .order_by(PricePoint.observed_at.desc())
            .limit(1)
        )
        if latest is None or latest.price != observation.price:
            session.add(PricePoint(
                listing_id=listing.id, observed_at=now,
                price=observation.price, source=source,
            ))

    return listing
```

- [ ] **Step 5: Lancer les tests, vérifier qu'ils passent**

```bash
cd api && ./.venv/bin/pytest tests/ -q
```

Attendu : 19 passed.

- [ ] **Step 6: Commit**

```bash
git add api/adscope_api api/tests
git commit -m "Enregistrement des observations, un point de prix par changement réel"
```

---

### Task 4: Calcul des signaux

**Files:**
- Create: `api/adscope_api/signals.py`
- Test: `api/tests/test_signals.py`

**Interfaces:**
- Consumes: `Listing`, `record()`
- Produces: `REPUBLICATION_THRESHOLD_DAYS`, `signals_for(session, listing, now=None) -> dict`

- [ ] **Step 1: Écrire le test qui échoue**

`api/tests/test_signals.py` :

```python
from datetime import datetime, timedelta, timezone

from adscope_api.observations import record
from adscope_api.schemas import ObservationIn
from adscope_api.signals import signals_for

NOW = datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)


def obs(**kw):
    base = dict(site="lc", site_id="1", price=9900, brand="PEUGEOT", model="308",
                version="1.2", year=2018, mileage=62686)
    base.update(kw)
    return ObservationIn(**base)


def test_age_comes_from_the_site_on_first_sight(session):
    listing = record(session, obs(published_days_ago=60), source="user", now=NOW)
    session.commit()
    out = signals_for(session, listing, now=NOW)
    assert out["real_age_days"] == 60
    assert out["republished"] is False
    assert out["tracked_days"] == 0


def test_stable_price_reports_days_since_last_change(session):
    listing = record(session, obs(), source="user", now=NOW)
    record(session, obs(), source="user", now=NOW + timedelta(days=12))
    session.commit()
    out = signals_for(session, listing, now=NOW + timedelta(days=12))
    assert out["price"] == 9900
    assert out["stable_days"] == 12
    assert out["price_delta"] is None


def test_price_drop_is_reported_with_its_window(session):
    listing = record(session, obs(price=10900), source="user", now=NOW)
    record(session, obs(price=9900), source="user", now=NOW + timedelta(days=12))
    session.commit()
    out = signals_for(session, listing, now=NOW + timedelta(days=12))
    assert out["price"] == 9900
    assert out["price_delta"] == -1000
    assert out["price_delta_days"] == 12
    assert [p["price"] for p in out["price_history"]] == [10900, 9900]


def test_republication_detected_beyond_the_threshold(session):
    listing = record(session, obs(published_days_ago=60), source="crawler", now=NOW)
    later = NOW + timedelta(days=14)
    record(session, obs(published_days_ago=2), source="crawler", now=later)
    session.commit()
    out = signals_for(session, listing, now=later)
    assert out["republished"] is True
    assert out["republished_at"] == (later - timedelta(days=2)).date()
    assert out["real_age_days"] == 74


def test_rounding_drift_of_one_day_is_not_a_republication(session):
    listing = record(session, obs(published_days_ago=60), source="crawler", now=NOW)
    later = NOW + timedelta(days=2)
    record(session, obs(published_days_ago=61), source="crawler", now=later)
    session.commit()
    out = signals_for(session, listing, now=later)
    assert out["republished"] is False


def test_listing_without_price_or_age_yields_empty_signals(session):
    listing = record(session, ObservationIn(site="lc", site_id="2"), source="user", now=NOW)
    session.commit()
    out = signals_for(session, listing, now=NOW)
    assert out["price"] is None
    assert out["real_age_days"] is None
    assert out["price_history"] == []
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
cd api && ./.venv/bin/pytest tests/test_signals.py -q
```

Attendu : `ModuleNotFoundError: No module named 'adscope_api.signals'`

- [ ] **Step 3: Implémenter**

`api/adscope_api/signals.py` :

```python
from datetime import datetime, timezone

from .models import Listing

REPUBLICATION_THRESHOLD_DAYS = 7


def signals_for(session, listing: Listing, now=None) -> dict:
    now = now or datetime.now(timezone.utc)
    points = sorted(listing.prices, key=lambda p: p.observed_at)

    out = {
        "site": listing.site,
        "site_id": listing.site_id,
        "fingerprint": listing.fingerprint,
        "first_seen": listing.first_seen,
        "last_seen": listing.last_seen,
        "observations": listing.observations,
        "tracked_days": (now - listing.first_seen).days,
        "site_published_first": listing.site_published_first,
        "real_age_days": None,
        "republished": False,
        "republished_at": None,
        "price": None,
        "price_history": [],
        "price_delta": None,
        "price_delta_days": None,
        "stable_days": None,
    }

    first, last = listing.site_published_first, listing.site_published_last
    if first is not None:
        out["real_age_days"] = (now.date() - first).days
        if last is not None and (last - first).days > REPUBLICATION_THRESHOLD_DAYS:
            out["republished"] = True
            out["republished_at"] = last

    if points:
        out["price"] = points[-1].price
        out["price_history"] = [{"at": p.observed_at, "price": p.price} for p in points]
        out["stable_days"] = (now - points[-1].observed_at).days
        if len(points) > 1:
            out["price_delta"] = points[-1].price - points[0].price
            out["price_delta_days"] = (now - points[0].observed_at).days

    return out
```

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

```bash
cd api && ./.venv/bin/pytest tests/ -q
```

Attendu : 25 passed.

- [ ] **Step 5: Commit**

```bash
git add api/adscope_api api/tests
git commit -m "Calcul des signaux : ancienneté, historique de prix, republication"
```

---

### Task 5: Licences

**Files:**
- Create: `api/adscope_api/auth.py`
- Create: `api/scripts/mint_license.py`
- Test: `api/tests/test_auth.py`

**Interfaces:**
- Consumes: `License`
- Produces: `new_key() -> str`, `hash_key(key) -> str`, `resolve(session, key, now=None) -> License | None`

- [ ] **Step 1: Écrire le test qui échoue**

`api/tests/test_auth.py` :

```python
from datetime import datetime, timedelta, timezone

from adscope_api.auth import hash_key, new_key, resolve
from adscope_api.models import License

NOW = datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)


def add_license(session, key, **kw):
    session.add(License(key_hash=hash_key(key), label=kw.pop("label", "test"), **kw))
    session.commit()


def test_new_key_is_prefixed_and_unique():
    a, b = new_key(), new_key()
    assert a.startswith("adsc_") and len(a) == 37
    assert a != b


def test_valid_key_resolves(session):
    key = new_key()
    add_license(session, key)
    assert resolve(session, key, now=NOW) is not None


def test_unknown_key_is_rejected(session):
    assert resolve(session, new_key(), now=NOW) is None


def test_inactive_key_is_rejected(session):
    key = new_key()
    add_license(session, key, active=False)
    assert resolve(session, key, now=NOW) is None


def test_expired_key_is_rejected(session):
    key = new_key()
    add_license(session, key, expires_at=NOW - timedelta(days=1))
    assert resolve(session, key, now=NOW) is None


def test_key_expiring_later_is_accepted(session):
    key = new_key()
    add_license(session, key, expires_at=NOW + timedelta(days=30))
    assert resolve(session, key, now=NOW) is not None


def test_raw_key_is_never_stored(session):
    key = new_key()
    add_license(session, key)
    assert session.query(License).one().key_hash != key
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
cd api && ./.venv/bin/pytest tests/test_auth.py -q
```

Attendu : `ModuleNotFoundError: No module named 'adscope_api.auth'`

- [ ] **Step 3: Implémenter**

`api/adscope_api/auth.py` :

```python
import hashlib
import secrets
from datetime import datetime, timezone

from .models import License

KEY_PREFIX = "adsc_"


def new_key() -> str:
    return KEY_PREFIX + secrets.token_hex(16)


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def resolve(session, key: str, now=None) -> License | None:
    now = now or datetime.now(timezone.utc)
    license_ = session.get(License, hash_key(key))
    if license_ is None or not license_.active:
        return None
    if license_.expires_at is not None and license_.expires_at <= now:
        return None
    return license_
```

- [ ] **Step 4: Écrire le script de création**

`api/scripts/mint_license.py` :

```python
"""Crée une clé de licence. La clé en clair n'est affichée qu'une fois."""
import sys

from adscope_api.auth import hash_key, new_key
from adscope_api.db import create_all, session_scope
from adscope_api.models import License

label = sys.argv[1] if len(sys.argv) > 1 else "sans-nom"
create_all()
key = new_key()
with session_scope() as session:
    session.add(License(key_hash=hash_key(key), label=label))
print(key)
```

- [ ] **Step 5: Lancer les tests, vérifier qu'ils passent**

```bash
cd api && ./.venv/bin/pytest tests/ -q
```

Attendu : 32 passed.

- [ ] **Step 6: Vérifier le script de bout en bout**

```bash
cd api && ./.venv/bin/python scripts/mint_license.py "poste-alexis"
```

Attendu : une clé `adsc_…` de 37 caractères sur la sortie standard.

- [ ] **Step 7: Commit**

```bash
git add api/adscope_api api/scripts api/tests
git commit -m "Licences : génération, hachage et résolution"
```

---

### Task 6: Routes FastAPI

**Files:**
- Create: `api/adscope_api/main.py`
- Test: `api/tests/test_routes.py`

**Interfaces:**
- Consumes: `record()`, `signals_for()`, `resolve()`, `ObservationsIn`, `BatchIn`, `SignalsOut`
- Produces: application FastAPI `app`, dépendance `require_license`

- [ ] **Step 1: Écrire le test qui échoue**

`api/tests/test_routes.py` :

```python
import pytest
from fastapi.testclient import TestClient

from adscope_api.auth import hash_key, new_key
from adscope_api.db import get_session
from adscope_api.main import app
from adscope_api.models import License


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


def observation(**kw):
    base = dict(site="lc", site_id="1", price=9900, brand="PEUGEOT", model="308",
                version="1.2", year=2018, mileage=62686, published_days_ago=60)
    base.update(kw)
    return base


def test_observations_requires_a_license(client):
    r = client.post("/v1/observations", json={"items": [observation()]})
    assert r.status_code == 401


def test_observations_are_recorded(client, key):
    r = client.post("/v1/observations",
                    json={"source": "user", "items": [observation()]}, headers=auth(key))
    assert r.status_code == 200
    assert r.json() == {"accepted": 1}


def test_single_listing_returns_signals(client, key):
    client.post("/v1/observations", json={"items": [observation()]}, headers=auth(key))
    r = client.get("/v1/listings/lc/1", headers=auth(key))
    assert r.status_code == 200
    body = r.json()
    assert body["price"] == 9900
    assert body["real_age_days"] == 60
    assert body["fingerprint"] is not None


def test_unknown_listing_returns_404(client, key):
    assert client.get("/v1/listings/lc/inconnue", headers=auth(key)).status_code == 404


def test_batch_returns_only_known_listings(client, key):
    client.post("/v1/observations", json={"items": [observation()]}, headers=auth(key))
    r = client.post("/v1/listings/batch",
                    json={"site": "lc", "ids": ["1", "absente"]}, headers=auth(key))
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["site_id"] == "1"


def test_batch_rejects_more_than_thirty_ids(client, key):
    r = client.post("/v1/listings/batch",
                    json={"site": "lc", "ids": [str(i) for i in range(31)]},
                    headers=auth(key))
    assert r.status_code == 422


def test_me_reports_the_license(client, key):
    r = client.get("/v1/me", headers=auth(key))
    assert r.status_code == 200
    assert r.json()["label"] == "test"
```

- [ ] **Step 2: Ajouter `get_session` à `db.py`**

Ajouter à la fin de `api/adscope_api/db.py` :

```python
def get_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
```

- [ ] **Step 3: Lancer le test, vérifier qu'il échoue**

```bash
cd api && ./.venv/bin/pytest tests/test_routes.py -q
```

Attendu : `ModuleNotFoundError: No module named 'adscope_api.main'`

- [ ] **Step 4: Implémenter**

`api/adscope_api/main.py` :

```python
from fastapi import Depends, FastAPI, Header, HTTPException
from sqlalchemy import select

from .auth import resolve
from .db import get_session
from .models import Listing
from .observations import record
from .schemas import BatchIn, ObservationsIn, SignalsOut
from .signals import signals_for

app = FastAPI(title="adscope", version="0.1.0")


def require_license(authorization: str = Header(default=""), session=Depends(get_session)):
    scheme, _, key = authorization.partition(" ")
    license_ = resolve(session, key) if scheme.lower() == "bearer" and key else None
    if license_ is None:
        raise HTTPException(status_code=401, detail="licence invalide")
    return license_


@app.post("/v1/observations")
def post_observations(payload: ObservationsIn, session=Depends(get_session),
                      _=Depends(require_license)):
    for item in payload.items:
        record(session, item, source=payload.source)
    session.commit()
    return {"accepted": len(payload.items)}


@app.post("/v1/listings/batch", response_model=list[SignalsOut])
def post_batch(payload: BatchIn, session=Depends(get_session), _=Depends(require_license)):
    listings = session.scalars(
        select(Listing).where(Listing.site == payload.site, Listing.site_id.in_(payload.ids))
    ).all()
    return [signals_for(session, listing) for listing in listings]


@app.get("/v1/listings/{site}/{site_id}", response_model=SignalsOut)
def get_listing(site: str, site_id: str, session=Depends(get_session),
                _=Depends(require_license)):
    listing = session.scalar(
        select(Listing).where(Listing.site == site, Listing.site_id == site_id)
    )
    if listing is None:
        raise HTTPException(status_code=404, detail="annonce inconnue")
    return signals_for(session, listing)


@app.get("/v1/me")
def get_me(license_=Depends(require_license)):
    return {"label": license_.label, "expires_at": license_.expires_at}
```

- [ ] **Step 5: Lancer toute la suite, vérifier qu'elle passe**

```bash
cd api && ./.venv/bin/pytest tests/ -q
```

Attendu : 39 passed.

- [ ] **Step 6: Vérifier l'API de bout en bout**

```bash
cd api
DATABASE_URL=postgresql+psycopg://localhost/adscope ./.venv/bin/python -c \
  "from adscope_api.db import create_all; create_all()"
KEY=$(./.venv/bin/python scripts/mint_license.py poste-alexis)
./.venv/bin/uvicorn adscope_api.main:app --port 8000 &
sleep 2
curl -s -X POST localhost:8000/v1/observations -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"site":"lc","site_id":"87103336930","price":9900,"brand":"PEUGEOT",
       "model":"308 II phase 2","version":"1.2 PURETECH 110 STYLE","year":2018,
       "mileage":62686,"published_days_ago":60}]}'
curl -s localhost:8000/v1/listings/lc/87103336930 -H "Authorization: Bearer $KEY"
kill %1
```

Attendu : `{"accepted":1}` puis un objet de signaux avec `"real_age_days":60`,
`"price":9900` et `"fingerprint":"54b22edbd39c"`.

- [ ] **Step 7: Commit**

```bash
git add api/adscope_api api/tests
git commit -m "Routes FastAPI : observations, batch, fiche, licence"
```

---

## Corrections apportées au plan après exécution

- **`observations=0` explicite à la création d'un `Listing`** (tâche 3). `mapped_column(default=0)`
  est un défaut appliqué à l'`INSERT` : l'attribut vaut `None` en Python avant le flush, donc
  `listing.observations += 1` lève un `TypeError`. Le code initialement écrit ici ne tournait pas
  — les 7 tests de la tâche 3 échouaient. Corrigé ci-dessus pour que le crawler, qui réutilisera
  `record()`, n'hérite pas du piège.

- **`published_precision` ajouté à `ObservationIn`** (tâches 3 et 6). Voir spec §5 et §9 : une
  observation d'unité grossière ne doit jamais relever `site_published_last`.

- **Bornes d'entrée** sur `published_days_ago` (0 à 3650) et `price` (≥ 0). Les bornes de
  publication étant monotones, une valeur aberrante est irréversible.

## Ce que ce plan ne couvre pas

- **L'extension** — plan séparé, elle consomme cette API.
- **Le crawler** — plan séparé, il écrit directement en base.
- **Les migrations.** `create_all()` suffit tant que le schéma n'est pas déployé. Alembic
  devient nécessaire au premier déploiement sur Render avec des données à conserver.
- **La limitation de débit par licence.** Prévue par la spec, sans objet tant qu'il n'y a
  qu'un utilisateur. À ajouter avant la mise en ligne.
