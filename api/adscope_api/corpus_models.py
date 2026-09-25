"""`Recheck` et `Divergence` : le marqueur « à vérifier » et le journal.

Singulier ici, pluriel dans `divergences.py` — la même convention que
`follow_models.py` / `follows.py`. À ne pas confondre en relecture avec
`divergence.py` (la mécanique, singulier lui aussi) : trois noms voisins pour
trois rôles distincts.

Migration 016 : deux tables neuves, aucune colonne ajoutée à `listings`.
`Recheck` est transitoire — une observation automated la vide pour l'annonce
(`recheck.clear`) — et `Divergence` se garde sans borne, c'est le journal.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Recheck(Base):
    """Une réclamation d'un marchand, en attente du passage du robot.

    Clé primaire à trois colonnes : deux marchands qui réclament le même champ
    sur la même annonce sont jugés l'un et l'autre — c'est le relevé
    intermédiaire (`divergence._explained`) qui absout le premier, jamais
    l'écrasement d'une ligne par l'autre.
    """

    __tablename__ = "rechecks"

    listing_id: Mapped[int] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), primary_key=True
    )
    field: Mapped[str] = mapped_column(String(16), primary_key=True)
    license_key_hash: Mapped[str] = mapped_column(
        String(64), ForeignKey("licenses.key_hash", ondelete="CASCADE"), primary_key=True
    )
    merchant_value: Mapped[str | None] = mapped_column(String(64), default=None)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Divergence(Base):
    """Une ligne du journal : ce que le marchand a déclaré contre ce que le
    robot a vu, avec son délai et son ampleur. Ne juge jamais — c'est la page
    opérateur qui classe."""

    __tablename__ = "divergences"
    __table_args__ = (
        Index("ix_divergences_license", "license_key_hash", "verified_at"),
        Index("ix_divergences_listing", "listing_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id", ondelete="CASCADE"))
    # Nul quand la licence a été supprimée depuis : la preuve qu'elle a
    # produite survit à son émetteur, comme `price_points.license_key_hash`.
    license_key_hash: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("licenses.key_hash", ondelete="SET NULL"), default=None
    )
    field: Mapped[str] = mapped_column(String(16))
    merchant_value: Mapped[str | None] = mapped_column(String(64), default=None)
    robot_value: Mapped[str | None] = mapped_column(String(64), default=None)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Calculé par le code (`int((verified_at - observed_at).total_seconds())`),
    # jamais une colonne générée : `test_migrations.py` compare le schéma des
    # migrations à celui de `create_all`, et une colonne générée les ferait
    # diverger pour rien.
    delay_seconds: Mapped[int] = mapped_column()
    delta_pct: Mapped[float | None] = mapped_column(Numeric(6, 2), default=None)
