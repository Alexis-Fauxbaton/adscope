"""`GET /v1/divergences` — la route, derrière `require_operator`. Pluriel :
la route, comme `follows.py` en face de `follow_models.py`. `divergence.py`,
voisin au singulier, écrit le journal ; celui-ci le lit seulement.

Alexis vient une fois par semaine ou après une alerte étrange, et veut
répondre en trente secondes à « quelqu'un pourrit-il la base ? » — d'où
l'entête agrégée (`total`/`keys`/`repeat_keys`), exacte même quand les lignes
sont plafonnées (`MAX_ROWS`), et `pending` : sans lui, zéro écart ne dit pas
si tout va bien ou si le recoupement ne tourne plus (docs/roadmap.md § Lot
Corpus, point 4).
"""

from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select

from .corpus_models import Divergence, Recheck
from .db import get_session
from .models import Account, License, Listing
from .naming import label as naming_label
from .operator import require_operator
from .sessions import now_utc
from .taxonomy import inferred_model
from .urls import build as build_url

router = APIRouter()

MAX_ROWS = 500
# Une clé « à trois écarts ou plus » : un chiffre d'affichage, aucune décision
# du code n'en dépend.
REPEAT = 3


def _item(listing, row) -> dict:
    return {
        "listing_id": row.listing_id, "site": listing.site, "site_id": listing.site_id,
        "label": naming_label(listing.brand, listing.model, listing.version,
                              inferred_model(listing.canon_model, listing.canon_model_source),
                              listing.year),
        "source_url": build_url(listing.site, listing.site_id),
        "adscope_url": f"/v1/listings/{listing.site}/{listing.site_id}",
        "field": row.field, "merchant_value": row.merchant_value, "robot_value": row.robot_value,
        "delta_pct": float(row.delta_pct) if row.delta_pct is not None else None,
        "delay_seconds": row.delay_seconds, "observed_at": row.observed_at,
        "verified_at": row.verified_at,
    }


def _grouped(session, rows) -> list[dict]:
    listings = {
        listing.id: listing for listing in session.scalars(
            select(Listing).where(Listing.id.in_({row.listing_id for row in rows}))
        ).all()
    }
    by_key: dict[str | None, list] = {}
    for row in rows:
        by_key.setdefault(row.license_key_hash, []).append(row)
    out = []
    for key_hash, group in by_key.items():
        lic = session.get(License, key_hash) if key_hash else None
        account = session.get(Account, lic.account_id) if lic and lic.account_id else None
        items = sorted(
            (_item(listings[row.listing_id], row) for row in group if row.listing_id in listings),
            key=lambda item: item["verified_at"], reverse=True,
        )
        out.append({
            "license_key_hash": key_hash, "label": lic.label if lic else "clé supprimée",
            "email": account.email if account else None, "active": lic.active if lic else False,
            "count": len(group), "min_delay_seconds": min(row.delay_seconds for row in group),
            "items": items,
        })
    out.sort(key=lambda lic: (-lic["count"], lic["min_delay_seconds"], lic["license_key_hash"] or ""))
    return out


@router.get("/v1/divergences")
def get_divergences(days: int = Query(default=30, ge=1, le=365), session=Depends(get_session),
                    _=Depends(require_operator), now=Depends(now_utc)):
    since = now - timedelta(days=days)
    window = Divergence.verified_at >= since
    total = session.scalar(select(func.count()).where(window)) or 0
    keys = session.scalar(
        select(func.count(func.distinct(Divergence.license_key_hash))).where(window)
    ) or 0
    repeat_keys = session.scalar(
        select(func.count()).select_from(
            select(Divergence.license_key_hash).where(window)
            .group_by(Divergence.license_key_hash).having(func.count() >= REPEAT).subquery()
        )
    ) or 0
    rows = session.scalars(
        select(Divergence).where(window).order_by(Divergence.verified_at.desc()).limit(MAX_ROWS)
    ).all()
    pending = session.scalar(select(func.count()).select_from(Recheck)) or 0
    return {
        "since": since, "total": total, "keys": keys, "repeat_keys": repeat_keys,
        "truncated": total > len(rows), "pending": pending, "licenses": _grouped(session, rows),
    }
