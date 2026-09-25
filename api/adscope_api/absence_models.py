"""`AbsenceReport` : le registre des voix qui ont constaté une absence.

Migration 017 (`.superpowers/disparition-plan.md` §2.2). `Recheck` ne pouvait
pas tenir ce rôle : transitoire, elle ne porte que la dernière déclaration
d'une clé, et elle n'existe pas pour le robot. Ici au contraire, une ligne par
acteur, qui tient le *premier* instant de sa constatation.

Clé primaire `(listing_id, actor)`, pas `(listing_id, license_key_hash)` :
l'unité de la règle est le compte, pas la clé (`absence_scope.actor_of`).
Deux clés d'un même compte s'écrasent l'une l'autre — « ne comptent qu'une
fois » tenu par la base, jamais par un `count(distinct)` qu'on pourrait
oublier d'écrire.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class AbsenceReport(Base):
    """`license_key_hash` est nullable et survit à son émetteur (`ON DELETE
    SET NULL`), comme `price_points.license_key_hash` : c'est la clé de la
    *première* constatation de cet acteur, celle que `revival.apply`
    journalise si l'annonce revient. `automated` est dénormalisé pour éviter
    une jointure sur `licenses` dans `absence_scope.quiet_for`, qui tourne sur
    des dizaines de milliers de lignes.

    Pas d'`id` sériel : la table n'est jamais référencée. Les lignes
    survivent à l'écriture d'une disparition ferme — sans elles, la levée
    (`revival.apply`) n'aurait plus de déclarant à comparer — et sont
    effacées à la levée, ou par la cascade si l'annonce est supprimée.
    """

    __tablename__ = "absence_reports"
    __table_args__ = (Index("ix_absence_reports_actor", "actor", "listing_id"),)

    listing_id: Mapped[int] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), primary_key=True
    )
    actor: Mapped[str] = mapped_column(String(72), primary_key=True)
    license_key_hash: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("licenses.key_hash", ondelete="SET NULL"), default=None
    )
    automated: Mapped[bool] = mapped_column(Boolean, default=False)
    evidence: Mapped[str] = mapped_column(String(16))
    first_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
