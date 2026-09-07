"""Les tables de la mesure d'usage.

Séparées de `models` pour la seule raison qui vaille ici : le registre des
tables de l'annonce avait atteint la limite de longueur du dépôt, et la file de
revisite y ajoute deux colonnes. Ce qui part est ce qui ne parle pas de
l'annonce.
"""

from datetime import date

from sqlalchemy import Date, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class UsageDay(Base):
    """L'usage du jour courant : une ligne par annonce vue, avec ses passages.

    Les points de prix ne mesuraient que les changements de prix : un marchand
    qui reparcourt chaque jour des annonces stables n'en produit aucun et
    paraissait inactif. Le grain est ici l'annonce dans la journée. Il ne sert
    qu'à dédoublonner les annonces pendant qu'elle dure : passée, son compte
    tient dans `UsageSummary` et ces lignes-là sont effacées.
    """

    __tablename__ = "usage_days"

    license_key_hash: Mapped[str] = mapped_column(
        String(64), ForeignKey("licenses.key_hash", ondelete="CASCADE"), primary_key=True
    )
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    listing_id: Mapped[int] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), primary_key=True
    )
    observations: Mapped[int] = mapped_column(default=0)


class UsageSummary(Base):
    """L'usage d'une journée close : une ligne par licence et par jour.

    Le grain fin pesait 5 615 lignes et 3,2 Mo pour une seule journée, contre
    3,7 Mo pour tout l'historique de prix. Ces deux nombres-ci répondent aux
    deux questions posées à la mesure et se gardent sans borne — `usage.compact`
    dit le reste.
    """

    __tablename__ = "usage_summaries"

    license_key_hash: Mapped[str] = mapped_column(
        String(64), ForeignKey("licenses.key_hash", ondelete="CASCADE"), primary_key=True
    )
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    listings: Mapped[int] = mapped_column(default=0)
    observations: Mapped[int] = mapped_column(default=0)
