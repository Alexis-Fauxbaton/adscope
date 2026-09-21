"""Le journal d'unicité : une alerte n'est dite qu'une fois.

`ref_at` est la seule clé que le chemin « recherche » (SQL, `alert_rules.py`)
et le chemin « suivis » (`feed_query.feed_for`, qui ne rend que `at`) peuvent
produire à l'identique — une annonce suivie *et* filtrée par une recherche
enregistrée n'est donc jamais dite deux fois pour la même baisse : le journal
la reconnaît sous la même clé, quel que soit le chemin qui l'a proposée.
"""

from datetime import datetime, timezone

from sqlalchemy import select, tuple_
from sqlalchemy.dialects.postgresql import insert

from .alert_models import AlertSent


def ref_at(at: datetime) -> str:
    """L'horodatage ISO-8601 UTC à la seconde — la clé d'unicité d'une
    baisse. À la seconde, jamais au micro : `market_query` et `feed_query`
    ne rendent pas la même précision sur `observed_at` après un aller-retour
    par des types Python différents."""
    return at.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def unseen(session, account_id: int, candidates: list[dict]) -> list[dict]:
    """Parmi les candidats (`kind`, `listing_id`, `ref` au moins), ceux que
    le journal ne porte pas encore pour ce compte."""
    if not candidates:
        return []
    keys = {(c["kind"], c["listing_id"], c["ref"]) for c in candidates}
    already = set(session.execute(
        select(AlertSent.kind, AlertSent.listing_id, AlertSent.ref)
        .where(
            AlertSent.account_id == account_id,
            tuple_(AlertSent.kind, AlertSent.listing_id, AlertSent.ref).in_(keys),
        )
    ).all())
    return [c for c in candidates if (c["kind"], c["listing_id"], c["ref"]) not in already]


def mark(session, account_id: int, lines: list[dict], now: datetime) -> None:
    """Inscrit chaque ligne au journal. `ON CONFLICT DO NOTHING` : deux
    exécutions concurrentes du script ne se marchent pas dessus."""
    for line in lines:
        session.execute(
            insert(AlertSent)
            .values(account_id=account_id, kind=line["kind"], listing_id=line["listing_id"],
                    ref=line["ref"], sent_at=now)
            .on_conflict_do_nothing()
        )
