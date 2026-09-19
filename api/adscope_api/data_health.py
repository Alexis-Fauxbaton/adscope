"""Le rapport de santé des données : ce qui appelle une intervention humaine.

Un script le lance, à la main ou par une tâche planifiée — jamais silencieux :
une alerte le fait sortir avec un code non nul (`scripts/data_health.py`).
Tout l'instant et toutes les fenêtres se passent en argument ; ce module ne
lit jamais l'horloge lui-même. Les quatre sections vivent dans
`data_health_queries.py`, la mise en texte dans `data_health_text.py` — ici,
seulement l'assemblage.

Le point fragile du produit, et la seule section qui alerte : la date exacte
de première publication. `published_at` la porte pour les **deux** sites —
`creationDate`/`firstOnlineDate` d'une fiche La Centrale vaut le
`first_publication_date` de leboncoin (`extension/src/sites/*.js`). Dès que la
colonne est posée, `signals.signals_for` rend `age_source: "exact"` ; sinon
`"inferred"` si `site_published_first` est posé — ce qu'aucun des deux sites ne
nourrit aujourd'hui, faute d'émettre `published_days_ago`. Un site peut retirer
ce champ de ses pages du jour au lendemain sans le dire : c'est ce que cette
section surveille, fenêtre contre fenêtre précédente, par site.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from .data_health_fields import field_fill_rate, version_names_another_model
from .data_health_queries import emerging_models, publication_freshness, unknown_brands, unknown_share
from .models import Listing

DEFAULT_WINDOW = timedelta(days=7)


def head_line(session, now) -> dict:
    total = session.scalar(select(func.count(Listing.id))) or 0
    last_seen = session.scalar(select(func.max(Listing.last_seen)))
    return {"now": now, "total": total, "last_seen": last_seen}


@dataclass
class Report:
    now: datetime
    total_listings: int
    last_seen: datetime | None
    unknown_brands: list = field(default_factory=list)
    emerging_models: list = field(default_factory=list)
    unknown_share: dict = field(default_factory=dict)
    freshness: list = field(default_factory=list)
    field_fill_rate: dict = field(default_factory=dict)
    model_named_by_version: dict = field(default_factory=dict)

    @property
    def alerts(self) -> list[str]:
        return [
            f"{row['site']} : la part de dates exactes tombe à "
            f"{row['current_ratio']:.0%} (elle dépassait "
            f"{row['previous_ratio']:.0%} la fenêtre précédente)"
            for row in self.freshness if row["alert"]
        ]


def compute(session, now=None, window=DEFAULT_WINDOW) -> Report:
    if now is None:
        now = datetime.now(timezone.utc)
    since = now - window
    head = head_line(session, now)
    return Report(
        now=now, total_listings=head["total"], last_seen=head["last_seen"],
        unknown_brands=unknown_brands(session),
        emerging_models=emerging_models(session, since, now),
        unknown_share=unknown_share(session, since, now),
        freshness=publication_freshness(session, now, window),
        field_fill_rate=field_fill_rate(session, since, now),
        model_named_by_version=version_names_another_model(session),
    )
