from datetime import date, datetime

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Index, String, UniqueConstraint, func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Listing(Base):
    __tablename__ = "listings"
    # L'index qui sert l'agrégation par vendeur, nommé pour que la migration et
    # `create_all` produisent le même schéma.
    __table_args__ = (
        UniqueConstraint("site", "site_id", name="uq_listing_site_id"),
        Index("ix_listings_seller", "site", "seller_id"),
    )

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
    # Qui a émis l'observation. Nul pour le crawler et pour tout ce qui a été
    # enregistré avant cette colonne. Une licence supprimée laisse ses points de
    # prix en place : c'est de l'historique de marché, pas de la donnée de compte.
    license_key_hash: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("licenses.key_hash", ondelete="SET NULL"), default=None
    )

    listing: Mapped[Listing] = relationship(back_populates="prices")


class License(Base):
    __tablename__ = "licenses"

    key_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    label: Mapped[str] = mapped_column(String(64))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Un émetteur automatique — le crawler local — poste avec une licence comme
    # l'extension. Sans cette marque ses observations passent pour l'usage d'un
    # humain, et la mesure n'est plus que du bruit.
    automated: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

