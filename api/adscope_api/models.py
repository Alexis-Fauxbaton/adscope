from datetime import date, datetime

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func, text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base
# Réexportées : `Base.metadata` doit les porter, et `from .models import ...`
# continue de les trouver là où on les a toujours prises.
from .auth_models import Account, LoginToken, SessionToken  # noqa: F401
from .license_models import License  # noqa: F401
from .follow_models import Follow, TrackedFamily  # noqa: F401
from .usage_models import UsageDay, UsageSummary  # noqa: F401
from .alert_models import AccountSettings, AlertSent, Digest, SavedSearch  # noqa: F401
from .corpus_models import Divergence, Recheck  # noqa: F401
from .absence_models import AbsenceReport  # noqa: F401


class Listing(Base):
    __tablename__ = "listings"
    # L'index qui sert l'agrégation par vendeur, nommé pour que la migration et
    # `create_all` produisent le même schéma.
    __table_args__ = (
        UniqueConstraint("site", "site_id", name="uq_listing_site_id"),
        Index("ix_listings_seller", "site", "seller_id"),
        # Ce que le garde-fou de flotte balaie : les fiches servies récemment.
        Index("ix_listings_revisit", "last_revisit_at"),
        # Le découpage par famille du site, sur la forme canonique.
        Index("ix_listings_canon", "canon_brand", "canon_model"),
        # La population du doute est minuscule et transitoire : c'est cet
        # index partiel qui rend `absence_scope.visible` gratuit.
        Index("ix_listings_probable", "probably_gone_at",
              postgresql_where=text("probably_gone_at IS NOT NULL")),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    site: Mapped[str] = mapped_column(String(8), index=True)
    site_id: Mapped[str] = mapped_column(String(32))
    fingerprint: Mapped[str | None] = mapped_column(String(12), index=True, default=None)

    brand: Mapped[str | None] = mapped_column(String(64), default=None)
    model: Mapped[str | None] = mapped_column(String(128), default=None)
    version: Mapped[str | None] = mapped_column(String(128), default=None)
    # La couche canonique, dérivée des trois colonnes ci-dessus par
    # `taxonomy.canonical` et `taxonomy.search_text`. Elles ne font jamais
    # autorité : l'empreinte véhicule et les comparables lisent les formes
    # observées. `scripts/recanonize.py` les recalcule à chaque évolution de
    # `shared/vehicle-aliases.json`.
    canon_brand: Mapped[str | None] = mapped_column(String(64), default=None)
    canon_model: Mapped[str | None] = mapped_column(String(128), default=None)
    # D'où vient `canon_model` : « site » (le site l'a classée, ou son alias de
    # marque l'a posé) ou « version » (déduit par `inference.infer_model`).
    # NULL = modèle non précisé — ni donné ni déduit.
    canon_model_source: Mapped[str | None] = mapped_column(String(8), default=None)
    search_text: Mapped[str | None] = mapped_column(Text, default=None)
    year: Mapped[int | None] = mapped_column(default=None)
    mileage: Mapped[int | None] = mapped_column(default=None)
    postal_code: Mapped[str | None] = mapped_column(String(8), default=None)
    # Des faits, hors empreinte véhicule (`shared/fingerprint.md`) : vocabulaire
    # fermé (`vocab.py`), département posé ou dérivé du CP (`department.py`).
    fuel: Mapped[str | None] = mapped_column(String(24), default=None)
    gearbox: Mapped[str | None] = mapped_column(String(16), default=None)
    department: Mapped[str | None] = mapped_column(String(3), default=None)

    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    observations: Mapped[int] = mapped_column(default=0)

    seller_type: Mapped[str | None] = mapped_column(String(8), index=True, default=None)
    # Le vendeur n'est nommé que s'il est professionnel : identifiant de
    # boutique et raison commerciale, donnée d'entreprise. Pour un particulier
    # la colonne reste vide — pas anonymisée, vide.
    seller_id: Mapped[str | None] = mapped_column(String(32), default=None)
    seller_name: Mapped[str | None] = mapped_column(String(128), default=None)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    bumped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    site_published_first: Mapped[date | None] = mapped_column(Date, default=None)
    site_published_last: Mapped[date | None] = mapped_column(Date, default=None)
    # Le fait : le site a dit lui-même que cette annonce n'est plus là, et l'a
    # dit deux fois. Coûteux à écrire — une fausse date ne se pose pas à la
    # légère — mais pas irréversible : `revival` la lève quand une observation
    # vivante la contredit. `revisit` et `disappearance` disent à quel prix.
    disappeared_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    # Le doute, à la différence du fait : une seule voix l'a constatée
    # (`absence_scope`, `.superpowers/disparition-plan.md` §2.1). Jamais
    # effacée par l'écriture de `disappeared_at` — elle dit quand le doute
    # est né, l'autre quand il a été tranché.
    probably_gone_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    # La machinerie qui y mène, et qui ne dit rien du marché : quand rouvrir la
    # fiche, quand la première constatation d'absence a eu lieu, et quand la file
    # a servi cette annonce. `revisit` et `disappearance` s'en servent ; une
    # observation qui montre l'annonce vivante efface l'absence en cours.
    next_detail_crawl: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), index=True, default=None
    )
    absent_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    last_revisit_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )

    prices: Mapped[list["PricePoint"]] = relationship(
        back_populates="listing",
        order_by="PricePoint.observed_at",
        cascade="all, delete-orphan",
    )


class PricePoint(Base):
    __tablename__ = "price_points"
    # L'index qui sert la mesure d'usage : par licence, dans l'ordre du temps.
    # Nommé ici pour que la migration et `create_all` produisent le même schéma.
    __table_args__ = (
        Index("ix_price_points_license", "license_key_hash", "observed_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), index=True
    )
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    price: Mapped[int]
    source: Mapped[str] = mapped_column(String(8))
    # Un point écrit parce que la semaine est passée, non parce que le prix a
    # bougé. Sans cette marque, `price_history` montrerait « 9 900 € → 9 900 € »
    # comme s'il s'était passé quelque chose. Faux pour tout ce qui a été
    # enregistré avant : c'étaient des changements.
    confirmation: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    # Qui a émis l'observation. Nul pour le crawler et pour tout ce qui a été
    # enregistré avant cette colonne. Une licence supprimée laisse ses points de
    # prix en place : c'est de l'historique de marché, pas de la donnée de compte.
    license_key_hash: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("licenses.key_hash", ondelete="SET NULL"), default=None
    )

    listing: Mapped[Listing] = relationship(back_populates="prices")
