"""Les tables du marchand : ce qu'il suit, et le périmètre qu'il surveille.

À part de `models` pour la raison qui avait déjà sorti la mesure d'usage : le
registre des tables de l'annonce est à la limite de longueur du dépôt. Ce qui
part est ce qui parle du marchand plutôt que de l'annonce.

Les deux tables portent la même dépendance : elles n'existent que par une
licence, et la licence supprimée les emporte. C'est la différence avec les
points de prix, qui sont de l'historique de marché et survivent à leur
émetteur — un suivi ne survit à personne, il n'a de sens que pour celui qui
l'a posé.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Follow(Base):
    """Une annonce qu'un marchand a mise de côté.

    La clé primaire commence par la licence — c'est ainsi qu'on lit « ce que
    suit ce marchand ». L'index sur l'annonce seule est là pour l'autre sens :
    Postgres n'indexe pas la colonne qui référence, et sans lui la suppression
    d'une annonce balaierait `follows` en entier pour honorer la cascade. La
    file de revisite, elle, n'en a pas besoin — elle hache la table d'un coup
    plutôt que d'y entrer ligne à ligne (mesuré : sous-plan haché, un bloc).
    """

    __tablename__ = "follows"
    __table_args__ = (Index("ix_follows_listing", "listing_id"),)

    license_key_hash: Mapped[str] = mapped_column(
        String(64), ForeignKey("licenses.key_hash", ondelete="CASCADE"), primary_key=True
    )
    listing_id: Mapped[int] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), primary_key=True
    )
    followed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class TrackedFamily(Base):
    """Une famille — marque et modèle — que le marchand surveille.

    Marque et modèle tels que le site les écrit, donc tels que `listings` les
    porte : le périmètre se compare à des annonces, jamais à un référentiel
    qu'on n'a pas. Pas d'année ni de version — le marchand dit « les Clio »,
    pas « les Clio de 2014 en finition Zen ».
    """

    __tablename__ = "tracked_families"

    license_key_hash: Mapped[str] = mapped_column(
        String(64), ForeignKey("licenses.key_hash", ondelete="CASCADE"), primary_key=True
    )
    brand: Mapped[str] = mapped_column(String(64), primary_key=True)
    model: Mapped[str] = mapped_column(String(128), primary_key=True)
