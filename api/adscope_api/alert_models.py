"""Les quatre tables des alertes (lot F1) : ce qu'un marchand a enregistré
comme recherche, son réglage d'email du matin, le journal de ce qui a déjà
été dit, et la boîte d'envoi.

À part de `models.py`, à sa limite de longueur — même raison qui en a déjà
sorti `follow_models` et `usage_models`. Les quatre tables partagent une
dépendance commune : elles n'existent que par un **compte** (`accounts`),
jamais par une licence — une recherche enregistrée, comme le réglage email,
se lit au marchand, pas à la machine qui interroge l'API en son nom.
"""

from datetime import date, datetime

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class SavedSearch(Base):
    """Un jeu de filtres du marché (`market_params.MarketParams`), nommé,
    rattaché à un compte. `created_at` est le point de départ des alertes :
    rien d'antérieur n'est jamais dit — voir `alert_rules.py`."""

    __tablename__ = "saved_searches"
    __table_args__ = (Index("ix_saved_searches_account", "account_id", "id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(80))
    query: Mapped[str] = mapped_column(Text)
    notify_drops: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # Faux par défaut : les sites sources alertent déjà sur le neuf, en temps
    # réel. On arrive après eux.
    notify_new: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    min_age_days: Mapped[int] = mapped_column(Integer, default=30, server_default="30")
    min_drop_pct: Mapped[int] = mapped_column(Integer, default=3, server_default="3")
    paused: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AccountSettings(Base):
    """Le réglage d'alertes d'un compte — une ligne, posée paresseusement
    (`alert_settings.settings_of`) à la première lecture ou au premier
    passage du script. `created_at` est l'époque des alertes de *suivi* :
    les recherches ont leur propre point de départ, les suivis n'en avaient
    pas avant ce réglage."""

    __tablename__ = "account_settings"

    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True
    )
    digest_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    include_follows: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    unsubscribe_token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AlertSent(Base):
    """Le journal d'unicité : une alerte n'est dite qu'une fois. La clé
    primaire porte les quatre colonnes — c'est elle, et rien d'autre, qui
    tient la contrainte. `ref` vaut différemment selon `kind`
    (`alert_journal.ref_at`)."""

    __tablename__ = "alerts_sent"
    __table_args__ = (Index("ix_alerts_sent_listing", "listing_id"),)

    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True
    )
    kind: Mapped[str] = mapped_column(String(8), primary_key=True)
    listing_id: Mapped[int] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), primary_key=True
    )
    ref: Mapped[str] = mapped_column(String(40), primary_key=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Digest(Base):
    """La boîte d'envoi : un email du matin par compte et par jour.
    `UNIQUE(account_id, day)` est ce qui rend le script idempotent. Pas de
    colonne `email` : l'adresse se résout à l'envoi (`accounts.email`), pour
    ne jamais en garder une copie périmée."""

    __tablename__ = "digests"
    __table_args__ = (
        UniqueConstraint("account_id", "day", name="uq_digests_account_day"),
        Index("ix_digests_account", "account_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    day: Mapped[date] = mapped_column(Date)
    token: Mapped[str] = mapped_column(String(24), unique=True)
    subject: Mapped[str] = mapped_column(String(200))
    text: Mapped[str] = mapped_column(Text)
    html: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    visits: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    first_visit_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
