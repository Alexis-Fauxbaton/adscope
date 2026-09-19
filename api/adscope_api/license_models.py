"""La licence : la clé qu'une machine présente, et à qui elle appartient.

Sortie de `models.py`, que le lot 3a faisait passer les 150 lignes — même
manœuvre que `auth_models`, `follow_models` et `usage_models` avant elle.
`models.py` la réexporte : `from .models import License` continue de la
trouver là où on l'a toujours prise, et `Base.metadata` la porte.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .auth_models import Account
from .base import Base


class License(Base):
    __tablename__ = "licenses"
    __table_args__ = (Index("ix_licenses_account", "account_id"),)

    key_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    label: Mapped[str] = mapped_column(String(64))
    # À qui elle appartient. Nulle pour une clé de machine — le crawler n'est
    # pas un humain et n'a pas d'adresse. `SET NULL` plutôt que cascade : un
    # compte supprimé ne doit pas emporter l'historique de marché que sa licence
    # a produit, dont `price_points` porte l'empreinte.
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="SET NULL"), default=None
    )
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

    account: Mapped[Account | None] = relationship()
